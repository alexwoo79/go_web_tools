package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
)

// ListDepartmentsHandler 管理员：部门列表。
func (h *Handler) ListDepartmentsHandler(w http.ResponseWriter, r *http.Request) {
	departments, err := h.db.ListDepartments()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "查询部门失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"items": departments})
}

// CreateDepartmentHandler 管理员：新增部门。
func (h *Handler) CreateDepartmentHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "请求格式错误"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "部门名称不能为空"})
		return
	}
	id, err := h.db.CreateDepartment(name)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "部门已存在或创建失败"})
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]interface{}{"status": "success", "id": id})
}

// DeleteDepartmentHandler 管理员：删除部门（同时清除领导管理范围引用）。
func (h *Handler) DeleteDepartmentHandler(w http.ResponseWriter, r *http.Request) {
	idStr := mux.Vars(r)["id"]
	id, err := strconv.ParseInt(strings.TrimSpace(idStr), 10, 64)
	if err != nil || id <= 0 {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "部门ID非法"})
		return
	}
	if err := h.db.DeleteDepartment(id); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "删除部门失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "success"})
}

// UpdateUserDepartmentsHandler 管理员：设置分管/主管领导的管理部门范围。
func (h *Handler) UpdateUserDepartmentsHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID        int     `json:"userId"`
		DepartmentIDs []int64 `json:"departmentIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "请求格式错误"})
		return
	}
	if req.UserID <= 0 {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "用户ID非法"})
		return
	}
	user, err := h.db.GetUserByID(req.UserID)
	if err != nil || user == nil {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "用户不存在"})
		return
	}
	if user.Role != RoleSeniorLeader && user.Role != RoleDivisionLeader && user.Role != RoleTopLeader && user.Role != RoleAdmin {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "仅部门以上领导可设置管理范围"})
		return
	}
	if err := h.db.SetLeaderDepartments(req.UserID, req.DepartmentIDs); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "设置管理范围失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "success"})
}

// managedDepartmentNames 返回用户管理范围的部门名列表。
func (h *Handler) managedDepartmentNames(userID int) []string {
	ids, err := h.db.GetLeaderDepartments(userID)
	if err != nil {
		return nil
	}
	names := make([]string, 0, len(ids))
	for _, id := range ids {
		if name, err := h.db.DepartmentNameByID(id); err == nil {
			names = append(names, name)
		}
	}
	return names
}
