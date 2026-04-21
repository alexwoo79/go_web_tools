package handler_test

import (
	"bytes"
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

func TestBuildHandler_returnsStructuredValidationErrors(t *testing.T) {
	ah := analyticshandler.New(nil)
	body := map[string]any{
		"datasetId":     "dummy-ds",
		"chartKind":     "bar",
		"schemaVersion": 2,
		"configV2":      map[string]any{},
	}
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/analytics/build", bytes.NewReader(raw))
	rr := httptest.NewRecorder()

	ah.BuildHandler(rr, req)

	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d; body: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if _, ok := resp["error"]; !ok {
		t.Fatalf("want error field, got: %v", resp)
	}
	details, ok := resp["details"].([]any)
	if !ok || len(details) == 0 {
		t.Fatalf("want non-empty details, got: %v", resp["details"])
	}
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
