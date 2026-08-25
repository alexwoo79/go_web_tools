package handler

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/gorilla/mux"
	"go-web/internal/models"
)

var roleCodePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{1,31}$`)

func (h *Handler) ListRoleDefinitionsHandler(w http.ResponseWriter, r *http.Request) {
	items, err := h.db.ListRoleDefinitions()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "查询角色失败"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *Handler) CreateRoleDefinitionHandler(w http.ResponseWriter, r *http.Request) {
	var req models.RoleDefinition
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "请求格式错误"})
		return
	}
	req.Code, req.Label, req.Description = strings.TrimSpace(req.Code), strings.TrimSpace(req.Label), strings.TrimSpace(req.Description)
	if !roleCodePattern.MatchString(req.Code) || req.Code == "admin" || req.Code == "user" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "角色代码格式不合法或为保留代码"})
		return
	}
	if req.Label == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "角色名称不能为空"})
		return
	}
	if err := h.db.CreateRoleDefinition(req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "角色代码已存在或创建失败"})
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]string{"status": "success"})
}

func (h *Handler) UpdateRoleDefinitionHandler(w http.ResponseWriter, r *http.Request) {
	code := strings.TrimSpace(mux.Vars(r)["code"])
	var req struct {
		Label       string `json:"label"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "请求格式错误"})
		return
	}
	if strings.TrimSpace(req.Label) == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "角色名称不能为空"})
		return
	}
	if err := h.db.UpdateRoleDefinition(code, strings.TrimSpace(req.Label), strings.TrimSpace(req.Description)); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "内置角色不可修改或角色不存在"})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "success"})
}

func (h *Handler) DeleteRoleDefinitionHandler(w http.ResponseWriter, r *http.Request) {
	code := strings.TrimSpace(mux.Vars(r)["code"])
	if err := h.db.DeleteRoleDefinition(code); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "success"})
}
