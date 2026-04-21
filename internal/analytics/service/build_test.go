package service_test

import (
	"testing"
	"time"

	_ "go-web/internal/analytics/viz"
	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
	"go-web/internal/analytics/service"
)

func storeDS(t *testing.T, id string, ownerID int) model.Dataset {
	t.Helper()
	now := time.Now().UTC()
	ds := model.Dataset{
		ID:      id,
		OwnerID: ownerID,
		Headers: []string{"month", "revenue"},
		Rows:    [][]string{{"Jan", "100"}, {"Feb", "120"}},
		CreatedAt: now,
		ExpiresAt: now.Add(time.Hour),
	}
	if err := dataset.Store(ds); err != nil {
		t.Fatalf("Store: %v", err)
	}
	return ds
}

func TestBuildChart_bar(t *testing.T) {
	ds := storeDS(t, "svc-bar", 1)
	opt, err := service.BuildChart(ds.ID, 1, model.VizConfig{ChartKind: "bar", XCol: "month", YCol: "revenue"})
	if err != nil {
		t.Fatalf("BuildChart error: %v", err)
	}
	if opt == nil {
		t.Fatal("BuildChart returned nil")
	}
}

func TestBuildChart_notFound(t *testing.T) {
	_, err := service.BuildChart("missing-id", 1, model.VizConfig{ChartKind: "bar"})
	if err == nil {
		t.Fatal("expected error for missing dataset")
	}
}

func TestBuildChart_wrongOwner(t *testing.T) {
	ds := storeDS(t, "svc-owner", 99)
	_, err := service.BuildChart(ds.ID, 1, model.VizConfig{ChartKind: "bar"})
	if err == nil {
		t.Fatal("expected error for wrong owner")
	}
}
