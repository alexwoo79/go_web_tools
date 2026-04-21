package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	analyticshandler "go-web/internal/analytics/handler"
	_ "go-web/internal/analytics/viz"
)

func TestDefinitionsHandler_returnsDefinitions(t *testing.T) {
	ah := analyticshandler.New(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/admin/analytics/definitions", nil)
	rr := httptest.NewRecorder()
	ah.DefinitionsHandler(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d; body: %s", rr.Code, rr.Body.String())
	}
	var defs []map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &defs); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if len(defs) < 16 {
		t.Fatalf("want at least 16 definitions, got %d", len(defs))
	}
	t.Logf("definitions endpoint returned %d chart kinds", len(defs))
}

func TestDefinitionsHandler_contentType(t *testing.T) {
	ah := analyticshandler.New(nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	ah.DefinitionsHandler(rr, req)
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("want application/json, got %q", ct)
	}
}
