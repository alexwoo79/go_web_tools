package dataset

import (
	"fmt"
	"sync"
	"time"

	"go-web/internal/analytics/model"
)

const (
	defaultTTL  = time.Hour
	gcInterval  = 10 * time.Minute
	maxDatasets = 100
)

type entry struct {
	dataset model.Dataset
}

var store = &datasetStore{
	m: make(map[string]entry),
}

type datasetStore struct {
	mu sync.RWMutex
	m  map[string]entry
}

func init() {
	go store.runGC()
}

// Store saves a dataset.  It rejects the dataset if the store is at capacity.
func Store(ds model.Dataset) error {
	store.mu.Lock()
	defer store.mu.Unlock()

	// Count non-expired entries for this owner.
	active := 0
	now := time.Now()
	for _, e := range store.m {
		if e.dataset.ExpiresAt.After(now) {
			active++
		}
	}
	if active >= maxDatasets {
		return fmt.Errorf("数据集存储已满，请稍后再试或删除不用的数据集")
	}

	if ds.CreatedAt.IsZero() {
		ds.CreatedAt = now
	}
	if ds.ExpiresAt.IsZero() {
		ds.ExpiresAt = now.Add(defaultTTL)
	}
	store.m[ds.ID] = entry{dataset: ds}
	return nil
}

// Load retrieves a dataset by ID.  Returns false if not found or expired.
func Load(id string) (model.Dataset, bool) {
	store.mu.RLock()
	e, ok := store.m[id]
	store.mu.RUnlock()
	if !ok {
		return model.Dataset{}, false
	}
	if time.Now().After(e.dataset.ExpiresAt) {
		store.mu.Lock()
		delete(store.m, id)
		store.mu.Unlock()
		return model.Dataset{}, false
	}
	return e.dataset, true
}

// Delete removes a dataset by ID.
func Delete(id string) {
	store.mu.Lock()
	delete(store.m, id)
	store.mu.Unlock()
}

// runGC periodically removes expired datasets.
func (s *datasetStore) runGC() {
	ticker := time.NewTicker(gcInterval)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for id, e := range s.m {
			if now.After(e.dataset.ExpiresAt) {
				delete(s.m, id)
			}
		}
		s.mu.Unlock()
	}
}
