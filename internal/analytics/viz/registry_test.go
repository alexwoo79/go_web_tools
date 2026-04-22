package viz_test

import (
	"testing"
	"time"

	"go-web/internal/analytics/model"
	"go-web/internal/analytics/viz"
	_ "go-web/internal/analytics/viz"
)

func TestDefinitions_count(t *testing.T) {
	defs := viz.Definitions()
	if len(defs) < 16 {
		t.Fatalf("want at least 16 definitions, got %d", len(defs))
	}
	t.Logf("definitions count: %d", len(defs))
}

func TestDefinitions_uniqueKinds(t *testing.T) {
	seen := map[string]bool{}
	for _, d := range viz.Definitions() {
		if seen[d.Kind] {
			t.Fatalf("duplicate kind %q", d.Kind)
		}
		seen[d.Kind] = true
	}
}

func TestDefinitions_requiredFields(t *testing.T) {
	for _, d := range viz.Definitions() {
		if d.Kind == "" {
			t.Errorf("definition has empty Kind: %+v", d)
		}
		if d.Label == "" {
			t.Errorf("definition %q has empty Label", d.Kind)
		}
		if d.Family == "" {
			t.Errorf("definition %q has empty Family", d.Kind)
		}
	}
}

func sampleDS() model.Dataset {
	return model.Dataset{
		ID:      "test",
		OwnerID: 1,
		Headers: []string{"month", "revenue", "name", "value"},
		Rows: [][]string{
			{"Jan", "100", "Alpha", "30"},
			{"Feb", "120", "Beta", "50"},
		},
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
	}
}

func TestBuild_bar(t *testing.T) {
	opt, err := viz.Build(sampleDS(), model.VizConfig{ChartKind: "bar", XCol: "month", YCol: "revenue"})
	if err != nil {
		t.Fatalf("Build(bar) error: %v", err)
	}
	if opt == nil {
		t.Fatal("Build(bar) returned nil")
	}
}

func TestBuild_pie(t *testing.T) {
	opt, err := viz.Build(sampleDS(), model.VizConfig{ChartKind: "pie", NameCol: "name", ValueCol: "value"})
	if err != nil {
		t.Fatalf("Build(pie) error: %v", err)
	}
	if opt == nil {
		t.Fatal("Build(pie) returned nil")
	}
}

func TestBuild_unknownKind(t *testing.T) {
	_, err := viz.Build(sampleDS(), model.VizConfig{ChartKind: "unknown_xyz"})
	if err == nil {
		t.Fatal("expected error for unknown kind")
	}
}

func TestInferDefaults_setsKind(t *testing.T) {
	cfg := viz.InferDefaults([]string{"month", "revenue"})
	if cfg.ChartKind == "" {
		t.Fatal("InferDefaults returned empty ChartKind")
	}
}
