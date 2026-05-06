// Package handler provides HTTP handlers for the analytics API.
package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/gantt"
	"go-web/internal/analytics/model"
	"go-web/internal/analytics/service"
	"go-web/internal/analytics/viz"

	// side-effect: ensure all viz builders are registered via their init()
	_ "go-web/internal/analytics/viz"

	"go-web/internal/handler"
)

// AnalyticsHandler handles analytics API requests.
// It re-uses the primary handler's session management for auth.
type AnalyticsHandler struct {
	primary *handler.Handler
}

// New creates a new AnalyticsHandler backed by the primary handler.
func New(primary *handler.Handler) *AnalyticsHandler {
	return &AnalyticsHandler{primary: primary}
}

// RequireAdmin delegates admin auth check to the primary handler.
func (ah *AnalyticsHandler) RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return ah.primary.RequireAdmin(next)
}

// adminUserID extracts the current admin user ID from the session cookie.
func (ah *AnalyticsHandler) adminUserID(r *http.Request) int {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return 0
	}
	return ah.primary.SessionUserID(cookie.Value)
}

// parsePageSize reads paging query parameters from the request.
// Returns page (1-based) and size. If size==0 the caller requested the full result set.
func parsePageSize(r *http.Request) (int, int) {
	q := r.URL.Query()
	if q.Get("full") == "1" || strings.EqualFold(q.Get("full"), "true") {
		return 1, 0
	}
	page := 1
	size := 5
	if p := q.Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if s := q.Get("size"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v >= 0 {
			size = v
		}
	}
	// enforce sensible bounds
	const maxSize = 1000
	if size > maxSize {
		size = maxSize
	}
	if page < 1 {
		page = 1
	}
	return page, size
}

// slicePreview returns the requested page of rows and the total page count.
// If size==0 the full rows slice is returned and pageCount is 1.
func slicePreview(rows [][]string, page, size int) ([][]string, int) {
	total := len(rows)
	if size == 0 {
		return rows, 1
	}
	if total == 0 {
		return [][]string{}, 0
	}
	pageCount := (total + size - 1) / size
	if page > pageCount {
		return [][]string{}, pageCount
	}
	start := (page - 1) * size
	if start >= total {
		return [][]string{}, pageCount
	}
	end := start + size
	if end > total {
		end = total
	}
	return rows[start:end], pageCount
}

// UploadDatasetHandler handles POST /api/admin/analytics/datasets/upload
func (ah *AnalyticsHandler) UploadDatasetHandler(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(11 << 20); err != nil {
		jsonResp(w, http.StatusBadRequest, map[string]string{"error": "请求解析失败"})
		return
	}

	mf := r.MultipartForm
	files := mf.File["file"]
	if len(files) == 0 {
		jsonResp(w, http.StatusBadRequest, map[string]string{"error": "请上传 file 字段"})
		return
	}
	fh := files[0]

	ownerID := ah.adminUserID(r)
	ds, err := service.NewDatasetFromUpload(fh, ownerID)
	if err != nil {
		status := http.StatusUnprocessableEntity
		if fh.Size > 10<<20 {
			status = http.StatusRequestEntityTooLarge
		}
		jsonResp(w, status, map[string]string{"error": err.Error()})
		return
	}

	preview := ds.Rows

	// apply optional paging query params
	page, size := parsePageSize(r)
	preview, pageCount := slicePreview(ds.Rows, page, size)

	jsonResp(w, http.StatusOK, map[string]any{
		"id":        ds.ID,
		"name":      ds.Name,
		"source":    ds.Source,
		"headers":   ds.Headers,
		"preview":   preview,
		"rowCount":  len(ds.Rows),
		"page":      page,
		"pageSize":  size,
		"pageCount": pageCount,
		"expiresIn": 3600,
	})
}

// GetDatasetHandler handles GET /api/admin/analytics/datasets/{id}
func (ah *AnalyticsHandler) GetDatasetHandler(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	ds, ok := dataset.Load(id)
	if !ok {
		jsonResp(w, http.StatusNotFound, map[string]string{"error": "数据集不存在或已过期"})
		return
	}
	if ds.OwnerID != ah.adminUserID(r) {
		jsonResp(w, http.StatusForbidden, map[string]string{"error": "无权访问该数据集"})
		return
	}

	preview := ds.Rows

	page, size := parsePageSize(r)
	preview, pageCount := slicePreview(ds.Rows, page, size)

	jsonResp(w, http.StatusOK, map[string]any{
		"id":        ds.ID,
		"name":      ds.Name,
		"source":    ds.Source,
		"headers":   ds.Headers,
		"preview":   preview,
		"rowCount":  len(ds.Rows),
		"page":      page,
		"pageSize":  size,
		"pageCount": pageCount,
		"createdAt": ds.CreatedAt,
		"expiresAt": ds.ExpiresAt,
	})
}

// DeleteDatasetHandler handles DELETE /api/admin/analytics/datasets/{id}
func (ah *AnalyticsHandler) DeleteDatasetHandler(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	ds, ok := dataset.Load(id)
	if !ok {
		jsonResp(w, http.StatusNotFound, map[string]string{"error": "数据集不存在或已过期"})
		return
	}
	if ds.OwnerID != ah.adminUserID(r) {
		jsonResp(w, http.StatusForbidden, map[string]string{"error": "无权删除该数据集"})
		return
	}
	dataset.Delete(id)
	w.WriteHeader(http.StatusNoContent)
}

// UpdateDatasetHandler handles PUT /api/admin/analytics/datasets/{id}
func (ah *AnalyticsHandler) UpdateDatasetHandler(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var body struct {
		Rows [][]string `json:"rows"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonResp(w, http.StatusBadRequest, map[string]string{"error": "请求体解析失败"})
		return
	}
	ds, ok := dataset.Load(id)
	if !ok {
		jsonResp(w, http.StatusNotFound, map[string]string{"error": "数据集不存在或已过期"})
		return
	}
	if ds.OwnerID != ah.adminUserID(r) {
		jsonResp(w, http.StatusForbidden, map[string]string{"error": "无权修改该数据集"})
		return
	}
	if err := dataset.Update(id, ds.OwnerID, body.Rows); err != nil {
		jsonResp(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}
	preview := body.Rows
	if len(preview) > 5 {
		preview = preview[:5]
	}
	jsonResp(w, http.StatusOK, map[string]any{"id": id, "preview": preview, "rowCount": len(body.Rows)})
}

// DefinitionsHandler handles GET /api/admin/analytics/definitions
func (ah *AnalyticsHandler) DefinitionsHandler(w http.ResponseWriter, r *http.Request) {
	jsonResp(w, http.StatusOK, viz.Definitions())
}

// BuildHandler handles POST /api/admin/analytics/build
func (ah *AnalyticsHandler) BuildHandler(w http.ResponseWriter, r *http.Request) {
	var req model.BuildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonAPIError(w, http.StatusBadRequest, model.ErrCodeTransportInvalidJSON, "请求体解析失败")
		return
	}
	if req.DatasetID == "" {
		jsonAPIError(w, http.StatusBadRequest, model.ErrCodeValidationRequiredField, "datasetId 不能为空")
		return
	}
	if req.ChartKind == "" {
		jsonAPIError(w, http.StatusBadRequest, model.ErrCodeValidationRequiredField, "chartKind 不能为空")
		return
	}

	cfg := model.VizConfig{ChartKind: req.ChartKind}
	if req.SchemaVersion >= 2 && req.ConfigV2 != nil {
		cfg = model.VizConfig{
			ChartKind:       req.ChartKind,
			Title:           req.ConfigV2.Title,
			SubTitle:        req.ConfigV2.SubTitle,
			Theme:           req.ConfigV2.Theme,
			SeriesName:      req.ConfigV2.SeriesName,
			Series2Name:     req.ConfigV2.Series2Name,
			Series3Name:     req.ConfigV2.Series3Name,
			YMetricCount:    req.ConfigV2.YMetricCount,
			XCol:            req.ConfigV2.XCol,
			YCol:            req.ConfigV2.YCol,
			Y2Col:           req.ConfigV2.Y2Col,
			Y3Col:           req.ConfigV2.Y3Col,
			YExtraCols:      req.ConfigV2.YExtraCols,
			NameCol:         req.ConfigV2.NameCol,
			ValueCol:        req.ConfigV2.ValueCol,
			Value2Col:       req.ConfigV2.Value2Col,
			SizeCol:         req.ConfigV2.SizeCol,
			SwapAxis:        req.ConfigV2.SwapAxis,
			SmoothLine:      req.ConfigV2.SmoothLine,
			SortMode:        req.ConfigV2.SortMode,
			AggregateByName: req.ConfigV2.AggregateByName,
			GaugeMode:       req.ConfigV2.GaugeMode,
			SourceCol:       req.ConfigV2.SourceCol,
			TargetCol:       req.ConfigV2.TargetCol,
			LinkValueCol:    req.ConfigV2.LinkValueCol,
			NodeIDCol:       req.ConfigV2.NodeIDCol,
			ParentIDCol:     req.ConfigV2.ParentIDCol,
			NodeValueCol:    req.ConfigV2.NodeValueCol,
		}
	}
	if req.Config != nil {
		if cfg.Title == "" {
			cfg.Title = req.Config["title"]
		}
		if cfg.SubTitle == "" {
			cfg.SubTitle = req.Config["subTitle"]
		}
		if cfg.XCol == "" {
			cfg.XCol = pickConfig(req.Config, "xCol", "xAxis")
		}
		if cfg.YCol == "" {
			cfg.YCol = pickConfig(req.Config, "yCol", "yAxis")
		}
		if cfg.Y2Col == "" {
			cfg.Y2Col = pickConfig(req.Config, "y2Col", "y2Axis")
		}
		if cfg.Y3Col == "" {
			cfg.Y3Col = pickConfig(req.Config, "y3Col", "y3Axis")
		}
		if cfg.NameCol == "" {
			cfg.NameCol = pickConfig(req.Config, "nameCol", "nameField")
		}
		if cfg.ValueCol == "" {
			cfg.ValueCol = pickConfig(req.Config, "valueCol", "valueField")
		}
		if cfg.SizeCol == "" {
			cfg.SizeCol = pickConfig(req.Config, "sizeCol", "size")
		}
		if cfg.SourceCol == "" {
			cfg.SourceCol = req.Config["sourceCol"]
		}
		if cfg.TargetCol == "" {
			cfg.TargetCol = req.Config["targetCol"]
		}
		if cfg.LinkValueCol == "" {
			cfg.LinkValueCol = req.Config["linkValueCol"]
		}
		if cfg.NodeIDCol == "" {
			cfg.NodeIDCol = req.Config["nodeIDCol"]
		}
		if cfg.ParentIDCol == "" {
			cfg.ParentIDCol = req.Config["parentIDCol"]
		}
		if cfg.NodeValueCol == "" {
			cfg.NodeValueCol = req.Config["nodeValueCol"]
		}
		if cfg.SeriesName == "" {
			cfg.SeriesName = req.Config["seriesName"]
		}
		if len(cfg.YExtraCols) == 0 {
			cfg.YExtraCols = splitCSV(req.Config["yExtraCols"])
		}
		if cfg.SortMode == "" {
			cfg.SortMode = req.Config["sortMode"]
		}
		if cfg.GaugeMode == "" {
			cfg.GaugeMode = req.Config["gaugeMode"]
		}
		if !cfg.SmoothLine {
			cfg.SmoothLine = parseBool(req.Config["smoothLine"])
		}
		if !cfg.SwapAxis {
			cfg.SwapAxis = parseBool(req.Config["swapAxis"])
		}
		if !cfg.AggregateByName {
			cfg.AggregateByName = parseBool(req.Config["aggregateByName"])
		}
	}

	if issues := validateBuildConfig(req.ChartKind, cfg); len(issues) > 0 {
		jsonResp(w, http.StatusUnprocessableEntity, model.ValidationErrorResponse{
			Code:    model.ErrCodeValidationInvalidConfig,
			Error:   "配置校验失败，请检查字段映射",
			Details: issues,
		})
		return
	}

	ownerID := ah.adminUserID(r)
	option, err := service.BuildChart(req.DatasetID, ownerID, cfg)
	if err != nil {
		jsonAPIError(w, http.StatusUnprocessableEntity, model.ErrCodeBusinessNotFound, err.Error())
		return
	}

	jsonResp(w, http.StatusOK, model.BuildResponse{Option: option})
}

// ValidateHierarchyHandler handles POST /api/admin/analytics/validate-hierarchy
func (ah *AnalyticsHandler) ValidateHierarchyHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DatasetID   string `json:"datasetId"`
		LabelField  string `json:"labelField"`
		ParentField string `json:"parentField"`
		ValueField  string `json:"valueField"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonResp(w, http.StatusBadRequest, map[string]string{"error": "请求体解析失败"})
		return
	}

	ds, ok := dataset.Load(body.DatasetID)
	if !ok {
		jsonResp(w, http.StatusNotFound, map[string]string{"error": "数据集不存在或已过期"})
		return
	}
	if ds.OwnerID != ah.adminUserID(r) {
		jsonResp(w, http.StatusForbidden, map[string]string{"error": "无权访问该数据集"})
		return
	}

	cfg := model.VizConfig{
		NameCol:      body.LabelField,
		NodeIDCol:    body.LabelField,
		ParentIDCol:  body.ParentField,
		NodeValueCol: body.ValueField,
	}

	result := viz.ValidateHierarchy(ds, cfg)
	jsonResp(w, http.StatusOK, result)
}

// GetFormSchemaHandler handles GET /api/admin/analytics/forms/{formName}/schema
func (ah *AnalyticsHandler) GetFormSchemaHandler(w http.ResponseWriter, r *http.Request) {
	formName := mux.Vars(r)["formName"]
	fi, ok := ah.primary.GetFormForAnalytics(formName)
	if !ok {
		jsonResp(w, http.StatusNotFound, map[string]string{"error": "表单不存在"})
		return
	}

	tableName := fi.Model.TableName
	if tableName == "" {
		tableName = "form_" + fi.Name
	}

	db := ah.primary.DBForAnalytics()
	if !db.TableExists(tableName) {
		jsonResp(w, http.StatusNotFound, map[string]string{"error": "该表单暂无数据"})
		return
	}

	fields := make([]map[string]any, 0, len(fi.Fields)+3)
	headers := make([]string, 0, len(fi.Fields)+3)
	for _, f := range fi.Fields {
		headers = append(headers, f.Name)
		fields = append(fields, map[string]any{
			"name":     f.Name,
			"label":    f.Label,
			"type":     normalizeFieldType(f.Type),
			"required": f.Required,
			"system":   false,
		})
	}

	for _, sf := range []struct {
		name  string
		label string
		typ   string
	}{
		{name: "_submitted_at", label: "提交时间", typ: "date"},
		{name: "_ip", label: "IP", typ: "text"},
		{name: "owner_user_id", label: "提交用户ID", typ: "number"},
	} {
		headers = append(headers, sf.name)
		fields = append(fields, map[string]any{
			"name":     sf.name,
			"label":    sf.label,
			"type":     sf.typ,
			"required": false,
			"system":   true,
		})
	}

	jsonResp(w, http.StatusOK, map[string]any{
		"formName":          fi.Name,
		"formTitle":         fi.Title,
		"tableName":         tableName,
		"headers":           headers,
		"fields":            fields,
		"definitions":       viz.Definitions(),
		"recommendedCharts": recommendChartKinds(fi.Fields),
	})
}

// GetFormPreviewHandler handles GET /api/admin/analytics/forms/{formName}/preview
func (ah *AnalyticsHandler) GetFormPreviewHandler(w http.ResponseWriter, r *http.Request) {
	formName := mux.Vars(r)["formName"]
	fi, ok := ah.primary.GetFormForAnalytics(formName)
	if !ok {
		jsonResp(w, http.StatusNotFound, map[string]string{"error": "表单不存在"})
		return
	}

	tableName := fi.Model.TableName
	if tableName == "" {
		tableName = "form_" + fi.Name
	}

	ownerID := ah.adminUserID(r)
	ds, err := service.FromFormData(ah.primary.DBForAnalytics(), tableName, fi.Name, ownerID, nil)
	if err != nil {
		jsonAPIError(w, http.StatusUnprocessableEntity, model.ErrCodeBusinessNotFound, err.Error())
		return
	}

	page, size := parsePageSize(r)
	preview, pageCount := slicePreview(ds.Rows, page, size)

	jsonResp(w, http.StatusOK, map[string]any{
		"id":        ds.ID,
		"headers":   ds.Headers,
		"preview":   preview,
		"rowCount":  len(ds.Rows),
		"page":      page,
		"pageSize":  size,
		"pageCount": pageCount,
	})
}

// BuildFromFormHandler handles POST /api/admin/analytics/forms/{formName}/build
func (ah *AnalyticsHandler) BuildFromFormHandler(w http.ResponseWriter, r *http.Request) {
	formName := mux.Vars(r)["formName"]
	fi, ok := ah.primary.GetFormForAnalytics(formName)
	if !ok {
		jsonAPIError(w, http.StatusNotFound, model.ErrCodeBusinessNotFound, "表单不存在")
		return
	}

	var req struct {
		ChartKind string            `json:"chartKind"`
		Config    map[string]string `json:"config"`
		Fields    []string          `json:"fields"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonAPIError(w, http.StatusBadRequest, model.ErrCodeTransportInvalidJSON, "请求体解析失败")
		return
	}
	if req.ChartKind == "" {
		jsonAPIError(w, http.StatusBadRequest, model.ErrCodeValidationRequiredField, "chartKind 不能为空")
		return
	}

	tableName := fi.Model.TableName
	if tableName == "" {
		tableName = "form_" + fi.Name
	}

	requiredFields := append(req.Fields, configFields(req.Config)...)
	ownerID := ah.adminUserID(r)
	ds, err := service.FromFormData(ah.primary.DBForAnalytics(), tableName, fi.Name, ownerID, requiredFields)
	if err != nil {
		jsonAPIError(w, http.StatusUnprocessableEntity, model.ErrCodeBusinessNotFound, err.Error())
		return
	}

	cfg := model.VizConfig{
		ChartKind:    req.ChartKind,
		Title:        req.Config["title"],
		SubTitle:     req.Config["subTitle"],
		XCol:         req.Config["xAxis"],
		YCol:         req.Config["yAxis"],
		Y2Col:        req.Config["y2Axis"],
		Y3Col:        req.Config["y3Axis"],
		NameCol:      req.Config["nameField"],
		ValueCol:     req.Config["valueField"],
		SizeCol:      req.Config["size"],
		SourceCol:    req.Config["sourceCol"],
		TargetCol:    req.Config["targetCol"],
		LinkValueCol: req.Config["linkValueCol"],
		NodeIDCol:    req.Config["nodeIDCol"],
		ParentIDCol:  req.Config["parentIDCol"],
		NodeValueCol: req.Config["nodeValueCol"],
		SeriesName:   req.Config["seriesName"],
	}

	if issues := validateBuildConfig(req.ChartKind, cfg); len(issues) > 0 {
		jsonResp(w, http.StatusUnprocessableEntity, model.ValidationErrorResponse{
			Code:    model.ErrCodeValidationInvalidConfig,
			Error:   "配置校验失败，请检查字段映射",
			Details: issues,
		})
		return
	}

	option, err := service.BuildChart(ds.ID, ownerID, cfg)
	if err != nil {
		jsonAPIError(w, http.StatusUnprocessableEntity, model.ErrCodeBusinessNotFound, err.Error())
		return
	}

	jsonResp(w, http.StatusOK, map[string]any{
		"option": option,
		"dataset": map[string]any{
			"id":       ds.ID,
			"rowCount": len(ds.Rows),
			"headers":  ds.Headers,
		},
	})
}

// ganttBuildRequest is the JSON body for the gantt build endpoints.
type ganttBuildRequest struct {
	DatasetID string            `json:"datasetId"`
	Headers   []string          `json:"headers,omitempty"`
	Rows      [][]string        `json:"rows,omitempty"`
	Config    model.GanttConfig `json:"config"`
}

// BuildGanttHandler handles POST /api/admin/analytics/gantt/build
func (ah *AnalyticsHandler) BuildGanttHandler(w http.ResponseWriter, r *http.Request) {
	var req ganttBuildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResp(w, http.StatusBadRequest, map[string]string{"error": "请求解析失败"})
		return
	}
	// Allow either an inline set of rows + headers or a stored dataset id.
	var result *gantt.Result
	if len(req.Rows) > 0 {
		ds := model.Dataset{Headers: req.Headers, Rows: req.Rows}
		var err error
		result, err = gantt.Build(ds, req.Config)
		if err != nil {
			jsonResp(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
			return
		}
	} else {
		if strings.TrimSpace(req.DatasetID) == "" {
			jsonResp(w, http.StatusBadRequest, map[string]string{"error": "缺少 datasetId 或 rows"})
			return
		}
		ds, ok := dataset.Load(req.DatasetID)
		if !ok {
			jsonResp(w, http.StatusNotFound, map[string]string{"error": "dataset 不存在"})
			return
		}
		var err error
		result, err = gantt.Build(ds, req.Config)
		if err != nil {
			jsonResp(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
			return
		}
	}

	jsonResp(w, http.StatusOK, map[string]any{"gantt": result})
}

// BuildFormGanttHandler handles POST /api/admin/analytics/forms/{formName}/gantt/build
func (ah *AnalyticsHandler) BuildFormGanttHandler(w http.ResponseWriter, r *http.Request) {
	formName := mux.Vars(r)["formName"]
	fi, ok := ah.primary.GetFormForAnalytics(formName)
	if !ok {
		jsonResp(w, http.StatusNotFound, map[string]string{"error": "表单不存在"})
		return
	}

	var req struct {
		Config model.GanttConfig `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResp(w, http.StatusBadRequest, map[string]string{"error": "请求解析失败"})
		return
	}

	tableName := fi.Model.TableName
	if tableName == "" {
		tableName = "form_" + fi.Name
	}

	// Collect the columns we need from the gantt config
	ganttCols := []string{}
	for _, col := range []string{
		req.Config.TaskCol, req.Config.StartCol, req.Config.EndCol,
		req.Config.ProjectCol, req.Config.ColorCol, req.Config.DescCol,
		req.Config.MilestoneCol, req.Config.MilestoneDateCol,
		req.Config.PlanStartCol, req.Config.PlanEndCol, req.Config.OwnerCol,
	} {
		if col != "" {
			ganttCols = append(ganttCols, col)
		}
	}

	ownerID := ah.adminUserID(r)
	ds, err := service.FromFormData(ah.primary.DBForAnalytics(), tableName, fi.Name, ownerID, ganttCols)
	if err != nil {
		jsonResp(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	result, err := gantt.Build(ds, req.Config)
	if err != nil {
		jsonResp(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	jsonResp(w, http.StatusOK, map[string]any{"gantt": result})
}

// ---- helpers ----------------------------------------------------------------

func normalizeFieldType(t string) string {
	t = strings.ToLower(strings.TrimSpace(t))
	switch t {
	case "number", "range":
		return "number"
	case "date", "time", "datetime":
		return "date"
	default:
		return "text"
	}
}

func configFields(cfg map[string]string) []string {
	out := make([]string, 0, len(cfg))
	for k, v := range cfg {
		if strings.TrimSpace(v) == "" {
			continue
		}
		switch k {
		case "xAxis", "yAxis", "y2Axis", "y3Axis", "nameField", "valueField", "size", "sourceCol", "targetCol", "linkValueCol", "nodeIDCol", "parentIDCol", "nodeValueCol":
			out = append(out, v)
		}
	}
	return out
}

func pickConfig(cfg map[string]string, keys ...string) string {
	for _, k := range keys {
		if v := strings.TrimSpace(cfg[k]); v != "" {
			return v
		}
	}
	return ""
}

func splitCSV(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		v := strings.TrimSpace(p)
		if v != "" {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func parseBool(s string) bool {
	s = strings.TrimSpace(strings.ToLower(s))
	return s == "1" || s == "true" || s == "on" || s == "yes"
}

func validateBuildConfig(chartKind string, cfg model.VizConfig) []model.ValidationIssue {
	defs := viz.Definitions()
	var def *model.ChartDefinition
	for i := range defs {
		if defs[i].Kind == chartKind {
			def = &defs[i]
			break
		}
	}
	if def == nil {
		return []model.ValidationIssue{{Field: "chartKind", Code: model.ErrCodeValidationUnsupportedChart, Message: "不支持的图形类型"}}
	}

	issues := make([]model.ValidationIssue, 0)
	seen := map[string]bool{}
	for _, f := range def.Fields {
		if !f.Required {
			continue
		}
		if hasConfigValue(cfg, f.Key, f.Aliases) {
			continue
		}
		if seen[f.Key] {
			continue
		}
		seen[f.Key] = true
		issues = append(issues, model.ValidationIssue{Field: f.Key, Code: model.ErrCodeValidationRequiredField, Message: f.Label + " 不能为空"})
	}
	return issues
}

func hasConfigValue(cfg model.VizConfig, key string, aliases []string) bool {
	if configValueSet(cfg, key) {
		return true
	}
	for _, a := range aliases {
		if configValueSet(cfg, a) {
			return true
		}
	}
	return false
}

func configValueSet(cfg model.VizConfig, key string) bool {
	s := func(v string) bool { return strings.TrimSpace(v) != "" }
	slice := func(v []string) bool { return len(v) > 0 }
	key = strings.TrimSpace(key)
	switch key {
	case "xCol", "xAxis":
		return s(cfg.XCol)
	case "yCol", "yAxis":
		return s(cfg.YCol)
	case "y2Col", "y2Axis":
		return s(cfg.Y2Col)
	case "y3Col", "y3Axis":
		return s(cfg.Y3Col)
	case "yExtraCols":
		return slice(cfg.YExtraCols)
	case "nameCol", "nameField":
		return s(cfg.NameCol)
	case "valueCol", "valueField":
		return s(cfg.ValueCol)
	case "value2Col":
		return s(cfg.Value2Col)
	case "sizeCol", "size":
		return s(cfg.SizeCol)
	case "sourceCol":
		return s(cfg.SourceCol)
	case "targetCol":
		return s(cfg.TargetCol)
	case "linkValueCol":
		return s(cfg.LinkValueCol)
	case "nodeIDCol":
		return s(cfg.NodeIDCol)
	case "parentIDCol":
		return s(cfg.ParentIDCol)
	case "nodeValueCol":
		return s(cfg.NodeValueCol)
	case "title":
		return s(cfg.Title)
	case "subTitle":
		return s(cfg.SubTitle)
	case "theme":
		return s(cfg.Theme)
	case "seriesName":
		return s(cfg.SeriesName)
	case "series2Name":
		return s(cfg.Series2Name)
	case "series3Name":
		return s(cfg.Series3Name)
	case "sortMode":
		return s(cfg.SortMode)
	case "gaugeMode":
		return s(cfg.GaugeMode)
	case "smoothLine":
		return cfg.SmoothLine
	case "swapAxis":
		return cfg.SwapAxis
	case "aggregateByName":
		return cfg.AggregateByName
	default:
		return false
	}
}

func recommendChartKinds(fields []handler.FieldInfo) []string {
	numeric := 0
	textual := 0
	for _, f := range fields {
		t := normalizeFieldType(f.Type)
		if t == "number" {
			numeric++
		} else {
			textual++
		}
	}
	if numeric == 0 {
		return []string{"pie", "donut", "funnel"}
	}
	if textual == 0 {
		return []string{"line", "area", "bar"}
	}
	return []string{"bar", "line", "pie", "scatter", "radar"}
}

func jsonResp(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// jsonAPIError writes a structured API error response using model.APIErrorResponse.
func jsonAPIError(w http.ResponseWriter, status int, code string, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(model.APIErrorResponse{Code: code, Error: msg})
}
