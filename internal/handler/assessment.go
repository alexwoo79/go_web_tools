package handler

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"

	"go-web/internal/models"
)

// 考核记录状态
const (
	AssessmentStatusSubmitted = "submitted" // 已填报，等待第一级评分
	AssessmentStatusGrading   = "grading"   // 评分中：已有评分人打分，尚未全部完成
	AssessmentStatusFinalized = "finalized" // 全部有效评分人已打分
)

// Reviewer 一个有序评分阶段：某级领导对一条记录打一个总分。
type Reviewer struct {
	Role   string  `json:"role"`
	Weight float64 `json:"weight"`
}

// ReviewChain 是有序评分人列表，顺序决定评分先后。
type ReviewChain []Reviewer

func defaultReviewChain() ReviewChain {
	return ReviewChain{
		{Role: RoleDeptHead, Weight: 0.4},
		{Role: RoleDivisionLeader, Weight: 0.3},
		{Role: RoleTopLeader, Weight: 0.3},
	}
}

func defaultReviewWeight(role string) float64 {
	switch role {
	case RoleDeptHead:
		return 0.4
	case RoleDivisionLeader, RoleTopLeader:
		return 0.3
	default:
		return 1.0
	}
}

// parseReviewChain 兼容三种格式：空=>默认；数组 [{"role","weight"}...]；旧对象 {scored,approved,finalized}。
func parseReviewChain(s string) ReviewChain {
	def := defaultReviewChain()
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	// 数组格式
	var arr []Reviewer
	if err := json.Unmarshal([]byte(s), &arr); err == nil && arr != nil {
		out := make([]Reviewer, 0, len(arr))
		for _, r := range arr {
			r.Role = strings.TrimSpace(r.Role)
			if r.Role == "" {
				continue
			}
			if r.Weight <= 0 {
				r.Weight = defaultReviewWeight(r.Role)
			}
			out = append(out, r)
		}
		if len(out) == 0 {
			return def
		}
		return out
	}
	// 旧对象格式（值为角色字符串或 {role,weight}）
	var obj map[string]json.RawMessage
	if err := json.Unmarshal([]byte(s), &obj); err == nil {
		defaults := map[string]Reviewer{
			"scored":    {Role: RoleDeptHead, Weight: 0.4},
			"approved":  {Role: RoleDivisionLeader, Weight: 0.3},
			"finalized": {Role: RoleTopLeader, Weight: 0.3},
		}
		out := make([]Reviewer, 0, 3)
		for _, key := range []string{"scored", "approved", "finalized"} {
			rawMsg, ok := obj[key]
			if !ok {
				continue
			}
			d := defaults[key]
			r := Reviewer{Role: d.Role, Weight: d.Weight}
			var so struct {
				Role   string  `json:"role"`
				Weight float64 `json:"weight"`
			}
			if err := json.Unmarshal(rawMsg, &so); err == nil {
				if so.Role != "" {
					r.Role = so.Role
				}
				if so.Weight > 0 {
					r.Weight = so.Weight
				}
			} else {
				var role string
				if json.Unmarshal(rawMsg, &role) == nil {
					r.Role = role
				}
			}
			if r.Role == "" {
				continue
			}
			out = append(out, r)
		}
		if len(out) == 0 {
			return def
		}
		return out
	}
	return def
}

// chainToJSON 序列化为数组；空则返回 ""（走默认）。
func chainToJSON(c ReviewChain) string {
	if len(c) == 0 {
		return ""
	}
	b, _ := json.Marshal(c)
	return string(b)
}

// chainStage 实际参与评分的一个阶段。
type chainStage struct {
	id     string // stage_1, stage_2, ...（对应 scores JSON 的 key）
	role   string
	weight float64
}

func buildStages(c ReviewChain) []chainStage {
	stages := make([]chainStage, 0, len(c))
	for i, r := range c {
		if strings.TrimSpace(r.Role) == "" {
			continue
		}
		stages = append(stages, chainStage{id: fmt.Sprintf("stage_%d", i+1), role: r.Role, weight: r.Weight})
	}
	return stages
}

// effectiveStages 返回实际生效的评分阶段：若记录所属人角色正好是某级，则跳过（自评）。
func effectiveStages(c ReviewChain, ownerRole string) []chainStage {
	stages := buildStages(c)
	out := make([]chainStage, 0, len(stages))
	for _, st := range stages {
		if ownerRole != "" && st.role == ownerRole {
			continue
		}
		out = append(out, st)
	}
	return out
}

// currentStage 返回下一个待评分阶段（按顺序找第一个未打分的）。
func currentStage(stages []chainStage, scores map[string]ScoreEntry) *chainStage {
	for i := range stages {
		if _, ok := scores[stages[i].id]; !ok {
			return &stages[i]
		}
	}
	return nil
}

// ScoreEntry 某一阶段已录入的评分。
type ScoreEntry struct {
	Role     string  `json:"role"`
	Username string  `json:"username"`
	Score    float64 `json:"score"`
	Weight   float64 `json:"weight"`
	// 按项打分的逐行得分（key=repeated_group 名，值为与提交行对齐的分数数组）
	Details map[string][]float64 `json:"details,omitempty"`
}

func parseScores(s string) map[string]ScoreEntry {
	out := map[string]ScoreEntry{}
	if strings.TrimSpace(s) == "" {
		return out
	}
	_ = json.Unmarshal([]byte(s), &out)
	return out
}

// weightedAverage 按有效评分人权重归一化：Σ(score×weight) / Σ(weight)。
func weightedAverage(scores map[string]ScoreEntry, stages []chainStage) *float64 {
	var num, den float64
	for _, st := range stages {
		e, ok := scores[st.id]
		if !ok {
			continue
		}
		num += e.Score * e.Weight
		den += e.Weight
	}
	if den <= 0 {
		return nil
	}
	v := num / den
	return &v
}

// assessmentStatusFor 根据已打分的阶段数推导记录状态。
func assessmentStatusFor(stages []chainStage, scores map[string]ScoreEntry) string {
	if len(stages) == 0 {
		return AssessmentStatusFinalized
	}
	scored := 0
	for _, st := range stages {
		if _, ok := scores[st.id]; ok {
			scored++
		}
	}
	if scored == 0 {
		return AssessmentStatusSubmitted
	}
	if scored == len(stages) {
		return AssessmentStatusFinalized
	}
	return AssessmentStatusGrading
}

// scoringMode 返回表单声明的评分模式（默认 single）。
func scoringMode(fi FormInfo) string {
	if fi.Scoring != nil && fi.Scoring.Mode != "" {
		return fi.Scoring.Mode
	}
	return "single"
}

// isItemScoring 是否为按项打分的模式。
func isItemScoring(mode string) bool {
	return mode == "item_avg" || mode == "item_weighted"
}

// scoreField 返回 scoring 声明的逐项得分字段名。
func scoreField(fi FormInfo) string {
	if fi.Scoring != nil {
		return fi.Scoring.ScoreField
	}
	return ""
}

// weightField 返回 scoring 声明的逐项权重字段名。
func weightField(fi FormInfo) string {
	if fi.Scoring != nil {
		return fi.Scoring.WeightField
	}
	return ""
}

// itemScoreGroups 返回用于按项打分的 repeated_group 列表。
// 仅当 scoring.group 指定时用该组；否则使用所有包含 score_field 的 repeated_group。
func itemScoreGroups(fi FormInfo) []FieldInfo {
	if fi.Scoring == nil {
		return nil
	}
	sf := fi.Scoring.ScoreField
	if sf == "" {
		return nil
	}
	var out []FieldInfo
	for _, f := range fi.Fields {
		if f.Type != "repeated_group" {
			continue
		}
		if fi.Scoring.Group != "" && f.Name != fi.Scoring.Group {
			continue
		}
		has := false
		for _, g := range f.GroupFields {
			if g.Name == sf {
				has = true
				break
			}
		}
		if has {
			out = append(out, f)
		}
	}
	return out
}

// aggregateItemScores 汇总某评分人的逐项得分：
//   - item_avg：简单平均；
//   - item_weighted：Σ(单项权重×得分)/Σ(单项权重)；无有效权重时回退简单平均。
func aggregateItemScores(fi FormInfo, mode string, data map[string]interface{}, items map[string][]float64) float64 {
	wf := weightField(fi)
	var num, den float64
	var count int
	for _, g := range itemScoreGroups(fi) {
		scores, ok := items[g.Name]
		if !ok {
			continue
		}
		rows := normalizePayloadArray(data[g.Name])
		for i, s := range scores {
			if i >= len(rows) {
				break
			}
			if s < 0 || s > 100 {
				continue
			}
			count++
			w := 1.0
			if mode == "item_weighted" && wf != "" {
				if m, ok := rows[i].(map[string]interface{}); ok {
					if v := toFloat(m[wf]); v > 0 {
						w = v
					}
				}
			}
			num += s * w
			den += w
		}
	}
	if den <= 0 {
		if count == 0 {
			return 0
		}
		return num / float64(count)
	}
	return num / den
}

// validateItemScores 校验逐项打分：每个用于评分的重复表格必须提交与行数一致的 0-100 分数。
func validateItemScores(fi FormInfo, data map[string]interface{}, items map[string][]float64) string {
	groups := itemScoreGroups(fi)
	if len(groups) == 0 {
		return "表单未声明可评分的重复表格（scoring.group / scoring.score_field）"
	}
	for _, g := range groups {
		rows := normalizePayloadArray(data[g.Name])
		if len(rows) == 0 {
			continue // 该表格未提交行，无需打分
		}
		scores, ok := items[g.Name]
		if !ok || len(scores) != len(rows) {
			return "「" + g.Label + "」评分数量与考核项数量不一致"
		}
		for i, s := range scores {
			if s < 0 || s > 100 {
				return "「" + g.Label + "」第 " + strconv.Itoa(i+1) + " 项评分需在 0-100 之间"
			}
		}
	}
	return ""
}

// itemScoreDetails 记录某评分人的逐项得分（用于审计/回显）。
func itemScoreDetails(fi FormInfo, items map[string][]float64) map[string][]float64 {
	out := map[string][]float64{}
	for _, g := range itemScoreGroups(fi) {
		if scores, ok := items[g.Name]; ok {
			out[g.Name] = scores
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// recordAssessmentSubmission 提交自评表后登记/更新考核记录。
func (h *Handler) recordAssessmentSubmission(period *models.AssessmentPeriod, fi FormInfo, session *Session, rowID int64) {
	// 仅参与角色创建考核记录；未配置时默认全员（非管理员）
	if period.ParticipantRoles != "" {
		allowed := map[string]bool{}
		for _, r := range strings.Split(period.ParticipantRoles, ",") {
			allowed[strings.TrimSpace(r)] = true
		}
		if session.Role != RoleAdmin && !allowed[session.Role] {
			return
		}
	}
	tableName := fi.Model.TableName
	if tableName == "" {
		tableName = "form_" + fi.Name
	}
	// 若提交人自身就是某级评分人，则该级跳过；若所有级都跳过则直接完成。
	status := AssessmentStatusSubmitted
	if len(effectiveStages(parseReviewChain(period.ReviewChain), session.Role)) == 0 {
		status = AssessmentStatusFinalized
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
			Status:     status,
		})
		return
	}
	// 仅“已填报”状态下允许重新提交替换引用
	if rec.Status == AssessmentStatusSubmitted {
		_ = h.db.DeleteRow(rec.TableName, rec.RowID) // 只保留最后一次，删除旧提交
		_ = h.db.UpdateAssessmentRecordRow(rec.ID, rowID)
		if status != rec.Status {
			_ = h.db.UpdateAssessmentRecordStatus(rec.ID, status, "", nil)
		}
	}
}

func (h *Handler) userDepartment(userID int) string {
	u, err := h.db.GetUserByID(userID)
	if err != nil || u == nil {
		return ""
	}
	return u.Department
}

func (h *Handler) recordOwnerRole(rec *models.AssessmentRecord) string {
	u, err := h.db.GetUserByID(rec.UserID)
	if err != nil || u == nil {
		return ""
	}
	return u.Role
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
			item["scores"] = parseScores(rec.Scores)
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
	if session.Role == RoleSeniorLeader || session.Role == RoleDivisionLeader || session.Role == RoleTopLeader {
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
		chain := h.periodChain(rec.PeriodID)
		stages := effectiveStages(chain, h.recordOwnerRole(&rec))
		scores := parseScores(rec.Scores)
		cs := currentStage(stages, scores)
		currentRole := ""
		canScore := false
		if cs != nil {
			currentRole = cs.role
			if session.Role == RoleAdmin || session.Role == cs.role {
				if session.UserID != rec.UserID {
					if _, done := scores[cs.id]; !done {
						canScore = true
					}
				}
			}
		}
		items = append(items, map[string]interface{}{
			"id":          rec.ID,
			"username":    rec.Username,
			"department":  rec.Department,
			"formName":    rec.FormName,
			"formTitle":   title,
			"status":      rec.Status,
			"totalScore":  rec.TotalScore,
			"reviewedBy":  rec.ReviewedBy,
			"updatedAt":   rec.UpdatedAt,
			"currentRole": currentRole,
			"canScore":    canScore,
		})
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"items":  items,
		"period": map[string]interface{}{"id": period.ID, "name": period.Name, "formName": period.FormName},
		"role":   session.Role,
	})
}

// AssessmentResultsHandler 管理端：当前周期下所有人员的考核结果列表（含各评分人得分与最终汇总）。
// buildAssessmentResults 构建当前周期下的考核结果行（按会话范围过滤），并计算等级分布。
func (h *Handler) buildAssessmentResults(session *Session) (*models.AssessmentPeriod, []*resultRow, map[string]interface{}) {
	period, err := h.db.GetActiveAssessmentPeriod()
	if err != nil || period == nil {
		return nil, nil, map[string]interface{}{}
	}
	dept := ""
	if session.Role == RoleDeptHead {
		dept = h.userDepartment(session.UserID)
	}
	records, err := h.db.ListAssessmentRecords(period.ID, "", dept)
	if err != nil {
		return period, nil, map[string]interface{}{}
	}
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
	rows := make([]*resultRow, 0, len(records))
	var finalized, grading int
	var sumFinal float64
	var finalizedCount int
	for _, rec := range records {
		title := formTitles[rec.FormName]
		if title == "" {
			if fi, ok := h.getForm(rec.FormName); ok {
				title = fi.Title
			}
			formTitles[rec.FormName] = title
		}
		chain := h.periodChain(rec.PeriodID)
		stages := effectiveStages(chain, h.recordOwnerRole(&rec))
		scores := parseScores(rec.Scores)
		reviewers := make([]map[string]interface{}, 0, len(stages))
		for _, st := range stages {
			e, ok := scores[st.id]
			reviewers = append(reviewers, map[string]interface{}{
				"id":        st.id,
				"role":      st.role,
				"roleLabel": RoleLabels[st.role],
				"weight":    st.weight,
				"done":      ok,
				"score":     e.Score,
				"username":  e.Username,
			})
		}
		switch rec.Status {
		case AssessmentStatusFinalized:
			finalized++
			if rec.TotalScore != nil {
				sumFinal += *rec.TotalScore
				finalizedCount++
			}
		case AssessmentStatusGrading, AssessmentStatusSubmitted:
			grading++
		}
		rows = append(rows, &resultRow{
			id: rec.ID, username: rec.Username, department: rec.Department,
			formName: rec.FormName, formTitle: title, status: rec.Status,
			reviewedBy: rec.ReviewedBy, updatedAt: rec.UpdatedAt, total: rec.TotalScore,
			scores: scores, reviewers: reviewers,
		})
	}

	gradeCfg := parseGradeConfig(period.GradeConfig)
	computeGrades(rows, gradeCfg)

	var avg float64
	if finalizedCount > 0 {
		avg = sumFinal / float64(finalizedCount)
	}
	summary := map[string]interface{}{
		"total":       len(rows),
		"finalized":   finalized,
		"grading":     grading,
		"avgScore":    avg,
		"gradeConfig": gradeCfg,
	}
	return period, rows, summary
}

func resultRowToMap(r *resultRow) map[string]interface{} {
	return map[string]interface{}{
		"id":         r.id,
		"username":   r.username,
		"department": r.department,
		"formName":   r.formName,
		"formTitle":  r.formTitle,
		"status":     r.status,
		"totalScore": r.total,
		"reviewedBy": r.reviewedBy,
		"updatedAt":  r.updatedAt,
		"scores":     r.scores,
		"reviewers":  r.reviewers,
		"grade":      r.grade,
		"gradeLabel": r.gradeLabel,
		"rank":       r.rank,
		"hasGrade":   r.hasGrade,
	}
}

// AssessmentResultsHandler 管理端：当前周期下所有人员的考核结果列表。
func (h *Handler) AssessmentResultsHandler(w http.ResponseWriter, r *http.Request) {
	session := h.getCurrentUser(r)
	if session == nil {
		jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "未登录"})
		return
	}
	period, rows, summary := h.buildAssessmentResults(session)
	if period == nil {
		jsonResponse(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}, "period": nil, "summary": map[string]interface{}{}})
		return
	}
	items := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		items = append(items, resultRowToMap(row))
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"items":   items,
		"period":  map[string]interface{}{"id": period.ID, "name": period.Name, "formName": period.FormName},
		"summary": summary,
		"role":    session.Role,
	})
}

// AssessmentResultsExportHandler 管理端：导出当前周期的考核结果 CSV。
func (h *Handler) AssessmentResultsExportHandler(w http.ResponseWriter, r *http.Request) {
	session := h.getCurrentUser(r)
	if session == nil {
		jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "未登录"})
		return
	}
	period, rows, _ := h.buildAssessmentResults(session)
	if period == nil {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "暂无考核周期"})
		return
	}
	chain := parseReviewChain(period.ReviewChain)
	roleLabels := make([]string, 0, len(chain))
	for _, rv := range chain {
		label := RoleLabels[rv.Role]
		if label == "" {
			label = rv.Role
		}
		roleLabels = append(roleLabels, label+"得分")
	}
	headers := []string{"姓名", "部门", "状态", "最终汇总分", "等级", "名次", "确认人", "更新时间"}
	headers = append(headers, roleLabels...)

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="assessment_results.csv"`)
	cw := csv.NewWriter(w)
	cw.UseCRLF = true
	_ = cw.Write(headers)
	for _, row := range rows {
		rec := []string{
			row.username,
			row.department,
			assessmentStatusLabel(row.status),
			scoreStr(row.total),
			row.grade,
			rankStr(row.rank, row.hasGrade),
			row.reviewedBy,
			row.updatedAt,
		}
		for _, rv := range chain {
			score := ""
			for _, rev := range row.reviewers {
				if rev["role"].(string) == rv.Role {
					if done, _ := rev["done"].(bool); done {
						score = fmt.Sprintf("%.2f", rev["score"].(float64))
					}
					break
				}
			}
			rec = append(rec, score)
		}
		_ = cw.Write(rec)
	}
	cw.Flush()
}

func scoreStr(v *float64) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%.2f", *v)
}

func rankStr(rank int, has bool) string {
	if !has {
		return ""
	}
	return fmt.Sprintf("%d", rank)
}

func assessmentStatusLabel(s string) string {
	switch s {
	case AssessmentStatusSubmitted:
		return "已填报"
	case AssessmentStatusGrading:
		return "评分中"
	case AssessmentStatusFinalized:
		return "已确认"
	default:
		return s
	}
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
	chain := h.periodChain(rec.PeriodID)
	ownerRole := h.recordOwnerRole(rec)
	stages := effectiveStages(chain, ownerRole)
	scores := parseScores(rec.Scores)
	cs := currentStage(stages, scores)

	// 当前会话用户能否评分
	canNext := false
	next := ""
	if cs != nil && (session.Role == RoleAdmin || session.Role == cs.role) {
		if session.UserID != rec.UserID {
			if _, done := scores[cs.id]; !done {
				canNext = true
				next = cs.id
			}
		}
	}

	reviewers := make([]map[string]interface{}, 0, len(stages))
	for _, st := range stages {
		e, ok := scores[st.id]
		reviewers = append(reviewers, map[string]interface{}{
			"id":        st.id,
			"role":      st.role,
			"roleLabel": RoleLabels[st.role],
			"weight":    st.weight,
			"done":      ok,
			"score":     e.Score,
			"username":  e.Username,
			"details":   e.Details,
		})
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"record":    rec,
		"form":      h.assessmentFormMap(fi),
		"data":      data,
		"canNext":   canNext,
		"next":      next,
		"scores":    scores,
		"reviewers": reviewers,
	})
}

// assessmentFormMap 评审详情用的表单定义结构。
func (h *Handler) assessmentFormMap(fi FormInfo) map[string]interface{} {
	fields := make([]map[string]interface{}, 0, len(fi.Fields))
	for _, f := range fi.Fields {
		fields = append(fields, h.fieldMap(f))
	}
	var scoring map[string]interface{}
	if fi.Scoring != nil {
		scoring = map[string]interface{}{
			"mode":        fi.Scoring.Mode,
			"group":       fi.Scoring.Group,
			"scoreField":  fi.Scoring.ScoreField,
			"weightField": fi.Scoring.WeightField,
		}
	}
	return map[string]interface{}{
		"Name":        fi.Name,
		"Title":       fi.Title,
		"Description": fi.Description,
		"Fields":      fields,
		"Scoring":     scoring,
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
		Score *float64             `json:"score"`
		Items map[string][]float64 `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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
	if session.UserID == rec.UserID {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "不能给自己评分"})
		return
	}

	fi, ok := h.getForm(rec.FormName)
	if !ok {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "表单不存在"})
		return
	}
	mode := scoringMode(fi)

	// 计算该评分人本次的分值（single=一个总分；item_avg/item_weighted=逐项聚合）
	var graderScore float64
	var details map[string][]float64
	if isItemScoring(mode) {
		rows, err := h.db.Query(rec.TableName, "id = ?", rec.RowID)
		if err != nil || len(rows) == 0 {
			jsonResponse(w, http.StatusNotFound, map[string]string{"error": "提交数据不存在"})
			return
		}
		data := map[string]interface{}{}
		if raw, ok := rows[0]["data"].(string); ok && raw != "" {
			_ = json.Unmarshal([]byte(raw), &data)
		}
		if msg := validateItemScores(fi, data, req.Items); msg != "" {
			jsonResponse(w, http.StatusBadRequest, map[string]string{"error": msg})
			return
		}
		graderScore = aggregateItemScores(fi, mode, data, req.Items)
		details = itemScoreDetails(fi, req.Items)
	} else {
		if req.Score == nil || *req.Score < 0 || *req.Score > 100 {
			jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "评分需在 0-100 之间"})
			return
		}
		graderScore = *req.Score
	}

	chain := h.periodChain(rec.PeriodID)
	ownerRole := h.recordOwnerRole(rec)
	stages := effectiveStages(chain, ownerRole)
	scores := parseScores(rec.Scores)
	if len(stages) == 0 {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "该记录无需评分（已跳过全部评分层）"})
		return
	}
	cs := currentStage(stages, scores)
	if cs == nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "该记录已结束，无需评分"})
		return
	}
	if !(session.Role == RoleAdmin || session.Role == cs.role) {
		jsonResponse(w, http.StatusForbidden, map[string]string{"error": "当前阶段由「" + RoleLabels[cs.role] + "」评分，您无权操作"})
		return
	}
	if _, done := scores[cs.id]; done {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "您已评分，如需修改请联系管理员重置"})
		return
	}
	scores[cs.id] = ScoreEntry{Role: cs.role, Username: session.Username, Score: graderScore, Weight: cs.weight, Details: details}
	scoresJSON, _ := json.Marshal(scores)
	total := weightedAverage(scores, stages)
	next := assessmentStatusFor(stages, scores)
	if err := h.db.SetAssessmentRecordResult(rec.ID, next, session.Username, string(scoresJSON), total); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "更新考核状态失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":     "success",
		"next":       next,
		"stage":      cs.id,
		"totalScore": total,
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

// periodChain 取某考核定义的使用评分链。
func (h *Handler) periodChain(periodID int64) ReviewChain {
	p, err := h.db.GetAssessmentPeriodByID(periodID)
	if err != nil || p == nil {
		return parseReviewChain("")
	}
	return parseReviewChain(p.ReviewChain)
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

// ListAssessmentPeriodsHandler 管理员：考核周期列表。
func (h *Handler) ListAssessmentPeriodsHandler(w http.ResponseWriter, r *http.Request) {
	periods, err := h.db.ListAssessmentPeriods()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "查询失败"})
		return
	}
	items := make([]map[string]interface{}, 0, len(periods))
	for _, p := range periods {
		roles := []string{}
		if p.ParticipantRoles != "" {
			roles = strings.Split(p.ParticipantRoles, ",")
		}
		items = append(items, map[string]interface{}{
			"ID":               p.ID,
			"Name":             p.Name,
			"FormName":         p.FormName,
			"Status":           p.Status,
			"CreatedAt":        p.CreatedAt,
			"participantRoles": roles,
			"reviewers":        parseReviewChain(p.ReviewChain),
			"gradeConfig":      parseGradeConfig(p.GradeConfig),
		})
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"items": items})
}

// CreateAssessmentPeriodHandler 管理员：新建考核周期。
func (h *Handler) CreateAssessmentPeriodHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name             string      `json:"name"`
		FormName         string      `json:"formName"`
		ParticipantRoles []string    `json:"participantRoles"`
		Reviewers        []Reviewer  `json:"reviewers"`
		GradeConfig      GradeConfig `json:"gradeConfig"`
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
	parts := strings.Join(req.ParticipantRoles, ",")
	chainJSON := chainToJSON(req.Reviewers)
	id, err := h.db.CreateAssessmentPeriod(req.Name, req.FormName, parts, string(chainJSON), gradeConfigToJSON(req.GradeConfig))
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "创建失败"})
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]interface{}{"status": "success", "id": id})
}

// UpdateAssessmentPeriodHandler 管理员：修改考核定义（名称 / 绑定表单）。
func (h *Handler) UpdateAssessmentPeriodHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	if err != nil || id <= 0 {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "考核定义ID非法"})
		return
	}
	var req struct {
		Name             string      `json:"name"`
		FormName         string      `json:"formName"`
		ParticipantRoles []string    `json:"participantRoles"`
		Reviewers        []Reviewer  `json:"reviewers"`
		GradeConfig      GradeConfig `json:"gradeConfig"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "请求格式错误"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.FormName = strings.TrimSpace(req.FormName)
	if req.Name == "" || req.FormName == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "名称与表单名必填"})
		return
	}
	if _, ok := h.getForm(req.FormName); !ok {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("表单 %s 不存在", req.FormName)})
		return
	}
	parts := strings.Join(req.ParticipantRoles, ",")
	chainJSON := chainToJSON(req.Reviewers)
	if err := h.db.UpdateAssessmentPeriod(id, req.Name, req.FormName, parts, string(chainJSON), gradeConfigToJSON(req.GradeConfig)); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "更新失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "success"})
}

// DeleteAssessmentPeriodHandler 管理员：删除考核定义（同时删除其考核记录）。
func (h *Handler) DeleteAssessmentPeriodHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	if err != nil || id <= 0 {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "考核定义ID非法"})
		return
	}
	if err := h.db.DeleteAssessmentPeriod(id); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "删除失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "success"})
}

// ResetAssessmentRecordHandler 管理员：重置记录为“已填报”，员工可重新提交。
func (h *Handler) ResetAssessmentRecordHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	if err != nil || id <= 0 {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "记录ID非法"})
		return
	}
	if err := h.db.ResetAssessmentRecordStatus(id); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "重置失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "success", "message": "已恢复为已填报状态"})
}

// AssessmentPermissionOverviewHandler 管理员：评分权限与职责总览（由角色/部门/管理范围自动推导）。
func (h *Handler) AssessmentPermissionOverviewHandler(w http.ResponseWriter, r *http.Request) {
	depts, err := h.db.ListDepartments()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "查询部门失败"})
		return
	}
	users, err := h.db.ListUsers()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "查询用户失败"})
		return
	}

	deptParticipant := map[string]int{}
	deptHead := map[string]string{}
	var noDeptStaff []string
	leaderDeptMap := map[int][]string{}
	leaderScopeEmpty := map[int]bool{}

	for _, u := range users {
		if u.Role == RoleAdmin {
			continue
		}
		// 领导的管理范围不受自身部门为空影响，先计算
		if u.Role == RoleSeniorLeader || u.Role == RoleDivisionLeader || u.Role == RoleTopLeader {
			ids, _ := h.db.GetLeaderDepartments(u.ID)
			names := make([]string, 0, len(ids))
			for _, id := range ids {
				if n, err := h.db.DepartmentNameByID(id); err == nil {
					names = append(names, n)
				}
			}
			leaderDeptMap[u.ID] = names
			leaderScopeEmpty[u.ID] = len(names) == 0
		}
		if u.Role == RoleDeptHead && strings.TrimSpace(u.Department) != "" && deptHead[u.Department] == "" {
			deptHead[u.Department] = u.Username
		}
		if u.Role != RoleSeniorLeader && u.Role != RoleDivisionLeader && u.Role != RoleTopLeader && strings.TrimSpace(u.Department) == "" {
			noDeptStaff = append(noDeptStaff, u.Username)
			continue
		}
		if strings.TrimSpace(u.Department) != "" {
			deptParticipant[u.Department]++
		}
	}

	leaderFor := func(role string) []map[string]interface{} {
		out := make([]map[string]interface{}, 0)
		for _, u := range users {
			if u.Role != role {
				continue
			}
			out = append(out, map[string]interface{}{
				"username":    u.Username,
				"role":        u.Role,
				"departments": leaderDeptMap[u.ID],
				"scopeEmpty":  leaderScopeEmpty[u.ID],
			})
		}
		return out
	}
	seniorLeaders := leaderFor(RoleSeniorLeader)
	divisionLeaders := leaderFor(RoleDivisionLeader)
	topLeaders := leaderFor(RoleTopLeader)

	coverDept := func(uID int, dept string) bool {
		if leaderScopeEmpty[uID] {
			return true
		}
		for _, n := range leaderDeptMap[uID] {
			if n == dept {
				return true
			}
		}
		return false
	}

	deptOverview := make([]map[string]interface{}, 0, len(depts))
	var gaps []string
	for _, d := range depts {
		name := d.Name
		div := make([]string, 0)
		top := make([]string, 0)
		for _, u := range users {
			if u.Role == RoleSeniorLeader && coverDept(u.ID, name) {
				div = append(div, u.Username)
			}
			if u.Role == RoleDivisionLeader && coverDept(u.ID, name) {
				div = append(div, u.Username)
			}
			if u.Role == RoleTopLeader && coverDept(u.ID, name) {
				top = append(top, u.Username)
			}
		}
		head := deptHead[name]
		if head == "" {
			gaps = append(gaps, "部门「"+name+"」未配置部门负责人（该部门员工无法进入评分）")
		}
		deptOverview = append(deptOverview, map[string]interface{}{
			"name":            name,
			"participants":    deptParticipant[name],
			"deptHead":        head,
			"divisionLeaders": div,
			"topLeaders":      top,
		})
	}
	if len(noDeptStaff) > 0 {
		gaps = append(gaps, "以下员工未设置部门，无法被部门负责人评分："+strings.Join(noDeptStaff, "、"))
	}
	for _, u := range users {
		if (u.Role == RoleSeniorLeader || u.Role == RoleDivisionLeader || u.Role == RoleTopLeader) && leaderScopeEmpty[u.ID] {
			gaps = append(gaps, "领导「"+u.Username+"」未设置管理范围（当前覆盖全部部门）")
		}
	}

	var total int
	withHead := 0
	for _, d := range deptOverview {
		total += d["participants"].(int)
		if d["deptHead"].(string) != "" {
			withHead++
		}
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"summary": map[string]interface{}{
			"departments":     len(depts),
			"participants":    total,
			"withHead":        withHead,
			"divisionLeaders": len(divisionLeaders) + len(seniorLeaders),
			"topLeaders":      len(topLeaders),
			"gaps":            len(gaps),
		},
		"departments":     deptOverview,
		"divisionLeaders": divisionLeaders,
		"topLeaders":      topLeaders,
		"gaps":            gaps,
	})
}
