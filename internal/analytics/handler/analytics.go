// Package handler provides HTTP handlers for the analytics API.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"go-web/internal/analytics/dataset"
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
	if len(preview) > 5 {
		preview = preview[:5]
	}

	jsonResp(w, http.StatusOK, map[string]any{
		"id":        ds.ID,
		"name":      ds.Name,
		"source":    ds.Source,
		"headers":   ds.Headers,
		"preview":   preview,
		"rowCount":  len(ds.Rows),
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
	if len(preview) > 5 {
		preview = preview[:5]
	}

	jsonResp(w, http.StatusOK, map[string]any{
		"id":        ds.ID,
		"name":      ds.Name,
		"source":    ds.Source,
		"headers":   ds.Headers,
		"preview":   preview,
		"rowCount":  len(ds.Rows),
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

// DefinitionsHandler handles GET /api/admin/analytics/definitions
func (ah *AnalyticsHandler) DefinitionsHandler(w http.ResponseWriter, r *http.Request) {
	jsonResp(w, http.StatusOK, map[string]any{
		"definitions": viz.Definitions(),
	})
}

// BuildHandler handles POST /api/admin/analytics/build
func (ah *AnalyticsHandler) BuildHandler(w http.ResponseWriter, r *http.Request) {
	var req model.BuildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResp(w, http.StatusBadRequest, map[string]string{"error": "请求体解析失败"})
		return
	}
	if req.DatasetID == "" {
		jsonResp(w, http.StatusBadRequest, map[string]string{"error": "datasetId 不能为空"})
		return
	}
	if req.ChartKind == "" {
		jsonResp(w, http.StatusBadRequest, map[string]string{"error": "chartKind 不能为空"})
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

	ownerID := ah.adminUserID(r)
	option, err := service.BuildChart(req.DatasetID, ownerID, cfg)
	if err != nil {
		jsonResp(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
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

// ---- helpers ----------------------------------------------------------------

func jsonResp(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
