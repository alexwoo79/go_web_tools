package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"

	"go-web/internal/models"
)

// 考核记录状态（四层流程）
const (
	AssessmentStatusSubmitted = "submitted" // 职员已填报
	AssessmentStatusScored    = "scored"    // 部门负责人已评分
	AssessmentStatusApproved  = "approved"  // 分管领导已审核
	AssessmentStatusFinalized = "finalized" // 主管领导已确认
)

// recordAssessmentSubmission 提交自评表后登记/更新考核记录。
func (h *Handler) recordAssessmentSubmission(period *models.AssessmentPeriod, fi FormInfo, session *Session, rowID int64) {
	tableName := fi.Model.TableName
	if tableName == "" {
		tableName = "form_" + fi.Name
	}
	rec, err := h.db.GetAssessmentRecordByUser(period.ID, session.UserID, fi.Name)
	if err != nil {
		return
	}
	if rec == nil {
		_, _ = h.db.CreateAssessmentRecord(models.AssessmentRecord{
			PeriodID:   period.ID,
			UserID:     session.UserID,
			Username:   session.Username,
			Department: h.userDepartment(session.UserID),
			FormName:   fi.Name,
			TableName:  tableName,
			RowID:      rowID,
			Status:     AssessmentStatusSubmitted,
		})
		return
	}
	// 仅“已填报”状态下允许重新提交替换引用
	if rec.Status == AssessmentStatusSubmitted {
		_ = h.db.UpdateAssessmentRecordRow(rec.ID, rowID)
	}
}

func (h *Handler) userDepartment(userID int) string {
	u, err := h.db.GetUserByID(userID)
	if err != nil || u == nil {
		return ""
	}
	return u.Department
}

// nextAssessmentStatus 返回角色对应的下一状态（管理员可跳级推进）。
func nextAssessmentStatus(role, current string) (string, bool) {
	switch role {
	case RoleDeptHead:
		if current == AssessmentStatusSubmitted {
			return AssessmentStatusScored, true
		}
	case RoleDivisionLeader:
		if current == AssessmentStatusScored {
			return AssessmentStatusApproved, true
		}
	case RoleTopLeader:
		if current == AssessmentStatusApproved {
			return AssessmentStatusFinalized, true
		}
	case RoleAdmin:
		order := []string{AssessmentStatusSubmitted, AssessmentStatusScored, AssessmentStatusApproved, AssessmentStatusFinalized}
		for i, s := range order {
			if s == current && i+1 < len(order) {
				return order[i+1], true
			}
		}
	}
	return "", false
}

// MyAssessmentHandler 员工端：我的考核记录。
func (h *Handler) MyAssessmentHandler(w http.ResponseWriter, r *http.Request) {
	session := h.getCurrentUser(r)
	if session == nil {
		jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "未登录"})
		return
	}
	periods, err := h.db.ListAssessmentPeriods()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "查询考核周期失败"})
		return
	}
	items := make([]map[string]interface{}, 0)
	for _, p := range periods {
		rec, _ := h.db.GetAssessmentRecordByUser(p.ID, session.UserID, p.FormName)
		item := map[string]interface{}{
			"periodId":   p.ID,
			"periodName": p.Name,
			"formName":   p.FormName,
			"status":     "none",
			"totalScore": nil,
		}
		if rec != nil {
			item["status"] = rec.Status
			item["totalScore"] = rec.TotalScore
			item["recordId"] = rec.ID
			item["reviewedBy"] = rec.ReviewedBy
			item["updatedAt"] = rec.UpdatedAt
		}
		items = append(items, item)
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"items": items})
}

// ReviewListHandler 评审端：按角色返回待办/全部记录。
func (h *Handler) ReviewListHandler(w http.ResponseWriter, r *http.Request) {
	session := h.getCurrentUser(r)
	if session == nil {
		jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "未登录"})
		return
	}
	period, err := h.db.GetActiveAssessmentPeriod()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "查询考核周期失败"})
		return
	}
	if period == nil {
		jsonResponse(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}, "period": nil})
		return
	}

	// 部门负责人只看本部门；其余评审角色看全部
	dept := ""
	if session.Role == RoleDeptHead {
		dept = h.userDepartment(session.UserID)
	}
	records, err := h.db.ListAssessmentRecords(period.ID, "", dept)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "查询考核记录失败"})
		return
	}
	// 分管/主管领导按“管理范围”过滤（未配置时默认全部）
	if session.Role == RoleDivisionLeader || session.Role == RoleTopLeader {
		if ids := h.leaderManagedDepartments(session.UserID); len(ids) > 0 {
			allowed := map[string]bool{}
			for _, id := range ids {
				if name, err := h.db.DepartmentNameByID(id); err == nil {
					allowed[name] = true
				}
			}
			filtered := records[:0]
			for _, rec := range records {
				if allowed[rec.Department] {
					filtered = append(filtered, rec)
				}
			}
			records = filtered
		}
	}

	formTitles := map[string]string{}
	items := make([]map[string]interface{}, 0, len(records))
	for _, rec := range records {
		title := formTitles[rec.FormName]
		if title == "" {
			if fi, ok := h.getForm(rec.FormName); ok {
				title = fi.Title
			}
			formTitles[rec.FormName] = title
		}
		items = append(items, map[string]interface{}{
			"id":         rec.ID,
			"username":   rec.Username,
			"department": rec.Department,
			"formName":   rec.FormName,
			"formTitle":  title,
			"status":     rec.Status,
			"totalScore": rec.TotalScore,
			"reviewedBy": rec.ReviewedBy,
			"updatedAt":  rec.UpdatedAt,
		})
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"items":  items,
		"period": map[string]interface{}{"id": period.ID, "name": period.Name, "formName": period.FormName},
		"role":   session.Role,
	})
}

// AssessmentRecordDetailHandler 评审详情：记录 + 表单定义 + 提交数据。
func (h *Handler) AssessmentRecordDetailHandler(w http.ResponseWriter, r *http.Request) {
	session := h.getCurrentUser(r)
	if session == nil {
		jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "未登录"})
		return
	}
	id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	if err != nil || id <= 0 {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "记录ID非法"})
		return
	}
	rec, err := h.db.GetAssessmentRecordByID(id)
	if err != nil || rec == nil {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "记录不存在"})
		return
	}
	if !h.canViewAssessmentRecord(session, rec) {
		jsonResponse(w, http.StatusForbidden, map[string]string{"error": "无权查看该记录"})
		return
	}

	fi, ok := h.getForm(rec.FormName)
	if !ok {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "表单不存在"})
		return
	}
	rows, err := h.db.Query(rec.TableName, "id = ?", rec.RowID)
	if err != nil || len(rows) == 0 {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "提交数据不存在"})
		return
	}
	row := rows[0]
	data := map[string]interface{}{}
	if raw, ok := row["data"].(string); ok && raw != "" {
		_ = json.Unmarshal([]byte(raw), &data)
	}
	next, _ := nextAssessmentStatus(session.Role, rec.Status)
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"record":  rec,
		"form":    h.assessmentFormMap(fi),
		"data":    data,
		"canNext": next != "",
		"next":    next,
	})
}

// assessmentFormMap 评审详情用的表单定义结构。
func (h *Handler) assessmentFormMap(fi FormInfo) map[string]interface{} {
	fields := make([]map[string]interface{}, 0, len(fi.Fields))
	for _, f := range fi.Fields {
		fields = append(fields, h.fieldMap(f))
	}
	return map[string]interface{}{
		"Name":        fi.Name,
		"Title":       fi.Title,
		"Description": fi.Description,
		"Fields":      fields,
	}
}

// AssessmentReviewHandler 打分/审核：更新数据并推进状态。
func (h *Handler) AssessmentReviewHandler(w http.ResponseWriter, r *http.Request) {
	session := h.getCurrentUser(r)
	if session == nil {
		jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "未登录"})
		return
	}
	id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	if err != nil || id <= 0 {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "记录ID非法"})
		return
	}
	var req struct {
		Data map[string]interface{} `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Data == nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "请求格式错误"})
		return
	}
	rec, err := h.db.GetAssessmentRecordByID(id)
	if err != nil || rec == nil {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "记录不存在"})
		return
	}
	if !h.canReviewAssessmentRecord(session, rec) {
		jsonResponse(w, http.StatusForbidden, map[string]string{"error": "当前角色无权处理该记录"})
		return
	}
	next, ok := nextAssessmentStatus(session.Role, rec.Status)
	if !ok {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "该记录当前状态不可由您推进"})
		return
	}

	fi, ok := h.getForm(rec.FormName)
	if !ok {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "表单不存在"})
		return
	}
	// 更新数据行（data + repeated_group JSON 列）
	groupJSON := map[string]string{}
	for _, f := range fi.Fields {
		if f.Type != "repeated_group" {
			continue
		}
		if v, exists := req.Data[f.Name]; exists {
			if b, err := json.Marshal(v); err == nil {
				groupJSON[f.Name] = string(b)
			}
		}
	}
	if err := h.db.UpdateRowData(rec.TableName, rec.RowID, req.Data, groupJSON); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "保存评分失败：" + err.Error()})
		return
	}
	score := computeWeightedScore(fi, req.Data)
	if err := h.db.UpdateAssessmentRecordStatus(rec.ID, next, session.Username, score); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "更新考核状态失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":     "success",
		"next":       next,
		"totalScore": score,
	})
}

// canViewAssessmentRecord 记录查看权限。
func (h *Handler) canViewAssessmentRecord(session *Session, rec *models.AssessmentRecord) bool {
	if session.Role == RoleAdmin {
		return true
	}
	if session.Role == RoleDeptHead {
		return rec.Department == h.userDepartment(session.UserID)
	}
	if session.Role == RoleDivisionLeader || session.Role == RoleTopLeader {
		return h.canAccessDepartment(session, rec.Department)
	}
	return rec.UserID == session.UserID
}

// canReviewAssessmentRecord 评审权限：按角色对应的待处理状态。
func (h *Handler) canReviewAssessmentRecord(session *Session, rec *models.AssessmentRecord) bool {
	if session.Role == RoleAdmin {
		return true
	}
	if session.Role == RoleDeptHead {
		return rec.Department == h.userDepartment(session.UserID)
	}
	if session.Role == RoleDivisionLeader || session.Role == RoleTopLeader {
		return h.canAccessDepartment(session, rec.Department)
	}
	return false
}

// leaderManagedDepartments 领导的管理部门 id 列表。
func (h *Handler) leaderManagedDepartments(userID int) []int64 {
	ids, err := h.db.GetLeaderDepartments(userID)
	if err != nil {
		return nil
	}
	return ids
}

// canAccessDepartment 判断当前用户是否有权访问某部门的数据。
func (h *Handler) canAccessDepartment(session *Session, department string) bool {
	if session.Role == RoleAdmin {
		return true
	}
	if session.Role == RoleDeptHead {
		return department == h.userDepartment(session.UserID)
	}
	if session.Role == RoleDivisionLeader || session.Role == RoleTopLeader {
		ids := h.leaderManagedDepartments(session.UserID)
		if len(ids) == 0 {
			return true // 未配置管理范围时默认全部（兼容旧数据）
		}
		for _, id := range ids {
			if name, err := h.db.DepartmentNameByID(id); err == nil && name == department {
				return true
			}
		}
	}
	return false
}

// computeWeightedScore 加权总分 = Σ(权重×得分) / Σ权重（跨所有 repeated_group 表）。
func computeWeightedScore(fi FormInfo, data map[string]interface{}) *float64 {
	var num, den float64
	for _, f := range fi.Fields {
		if f.Type != "repeated_group" || f.WeightSumField == "" {
			continue
		}
		scoreField := groupScoreField(f)
		if scoreField == "" {
			continue
		}
		for _, row := range normalizePayloadArray(data[f.Name]) {
			m, ok := row.(map[string]interface{})
			if !ok {
				continue
			}
			w := toFloat(m[f.WeightSumField])
			s := toFloat(m[scoreField])
			num += w * s
			den += w
		}
	}
	if den <= 0 {
		return nil
	}
	v := num / den
	return &v
}

// groupScoreField 查找 repeated_group 中的得分字段（label 含得分/评分或 name=de_fen）。
func groupScoreField(f FieldInfo) string {
	for _, g := range f.GroupFields {
		if g.Type == "number" && (strings.Contains(g.Label, "得分") || strings.Contains(g.Label, "评分") || g.Name == "de_fen") {
			return g.Name
		}
	}
	return ""
}

// ListAssessmentPeriodsHandler 管理员：考核周期列表。
func (h *Handler) ListAssessmentPeriodsHandler(w http.ResponseWriter, r *http.Request) {
	periods, err := h.db.ListAssessmentPeriods()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "查询失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"items": periods})
}

// CreateAssessmentPeriodHandler 管理员：新建考核周期。
func (h *Handler) CreateAssessmentPeriodHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		FormName string `json:"formName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "请求格式错误"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.FormName = strings.TrimSpace(req.FormName)
	if req.Name == "" || req.FormName == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "周期名称与表单名必填"})
		return
	}
	if _, ok := h.getForm(req.FormName); !ok {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("表单 %s 不存在", req.FormName)})
		return
	}
	id, err := h.db.CreateAssessmentPeriod(req.Name, req.FormName)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "创建失败"})
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]interface{}{"status": "success", "id": id})
}
