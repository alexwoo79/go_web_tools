package dataset_test

import (
	"testing"
	"time"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
)

func makeDataset(id string, ownerID int, ttl time.Duration) model.Dataset {
	now := time.Now().UTC()
	return model.Dataset{
		ID:        id,
		Name:      "test.csv",
		Source:    "upload",
		OwnerID:   ownerID,
		Headers:   []string{"name", "value"},
		Rows:      [][]string{{"Alice", "100"}, {"Bob", "200"}},
		CreatedAt: now,
		ExpiresAt: now.Add(ttl),
	}
}

func TestStore_StoreAndLoad(t *testing.T) {
	ds := makeDataset("st-1", 42, time.Hour)
	if err := dataset.Store(ds); err != nil {
		t.Fatalf("Store error: %v", err)
	}
	got, ok := dataset.Load(ds.ID)
	if !ok {
		t.Fatal("Load returned false for stored dataset")
	}
	if got.OwnerID != 42 {
		t.Fatalf("want OwnerID 42, got %d", got.OwnerID)
	}
}

func TestStore_LoadNotFound(t *testing.T) {
	_, ok := dataset.Load("non-existent-xyz")
	if ok {
		t.Fatal("expected false for non-existent ID")
	}
}

func TestStore_LoadExpired(t *testing.T) {
	ds := makeDataset("st-expired", 1, -time.Second)
	if err := dataset.Store(ds); err != nil {
		t.Fatalf("Store error: %v", err)
	}
	_, ok := dataset.Load(ds.ID)
	if ok {
		t.Fatal("expected false for expired dataset")
	}
}

func TestStore_Delete(t *testing.T) {
	ds := makeDataset("st-del", 7, time.Hour)
	if err := dataset.Store(ds); err != nil {
		t.Fatalf("Store error: %v", err)
	}
	dataset.Delete(ds.ID)
	_, ok := dataset.Load(ds.ID)
	if ok {
		t.Fatal("expected false after Delete")
	}
}
