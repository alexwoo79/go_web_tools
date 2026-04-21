package gantt_test

import (
	"testing"
	"time"

	"go-web/internal/analytics/gantt"
	"go-web/internal/analytics/model"
)

func ganttDataset() model.Dataset {
	return model.Dataset{
		ID:      "gantt-test",
		OwnerID: 1,
		Headers: []string{"task", "start", "end", "project", "owner"},
		Rows: [][]string{
			{"Design mockups", "2024-01-10", "2024-01-20", "UI", "Alice"},
			{"Implement API", "2024-01-15", "2024-02-05", "Backend", "Bob"},
			{"Write tests", "2024-02-01", "2024-02-10", "Backend", "Bob"},
			{"Deploy to staging", "2024-02-11", "2024-02-15", "DevOps", "Carol"},
		},
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
	}
}

func TestBuild_basic(t *testing.T) {
	ds := ganttDataset()
	cfg := model.GanttConfig{
		TaskCol:    "task",
		StartCol:   "start",
		EndCol:     "end",
		ProjectCol: "project",
		OwnerCol:   "owner",
	}
	result, err := gantt.Build(ds, cfg)
	if err != nil {
		t.Fatalf("Build error: %v", err)
	}
	if len(result.Tasks) != 4 {
		t.Fatalf("want 4 tasks, got %d", len(result.Tasks))
	}
	if result.Stats.TaskCount != 4 {
		t.Fatalf("want Stats.TaskCount=4, got %d", result.Stats.TaskCount)
	}
	if result.Stats.AvgDurationDays <= 0 {
		t.Fatalf("want positive AvgDurationDays, got %f", result.Stats.AvgDurationDays)
	}
}

func TestBuild_taskFields(t *testing.T) {
	ds := ganttDataset()
	cfg := model.GanttConfig{
		TaskCol:  "task",
		StartCol: "start",
		EndCol:   "end",
	}
	result, err := gantt.Build(ds, cfg)
	if err != nil {
		t.Fatalf("Build error: %v", err)
	}
	task := result.Tasks[0]
	if task.TaskName == "" {
		t.Error("TaskName should not be empty")
	}
	if task.StartISO == "" {
		t.Error("StartISO should not be empty")
	}
	if task.EndISO == "" {
		t.Error("EndISO should not be empty")
	}
	if task.DurationDays <= 0 {
		t.Errorf("DurationDays should be positive, got %d", task.DurationDays)
	}
}

func TestBuild_missingRequiredCols(t *testing.T) {
	ds := ganttDataset()
	cfg := model.GanttConfig{
		TaskCol: "task",
		// StartCol and EndCol missing
	}
	_, err := gantt.Build(ds, cfg)
	if err == nil {
		t.Fatal("expected error when StartCol/EndCol missing")
	}
}

func TestBuild_invalidDateRows(t *testing.T) {
	ds := model.Dataset{
		ID:      "gantt-invalid",
		OwnerID: 1,
		Headers: []string{"task", "start", "end"},
		Rows: [][]string{
			{"Valid Task", "2024-01-10", "2024-01-20"},
			{"Bad Dates", "not-a-date", "also-bad"},
			{"", "2024-02-01", "2024-02-10"}, // empty task name skipped
		},
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
	}
	cfg := model.GanttConfig{
		TaskCol:  "task",
		StartCol: "start",
		EndCol:   "end",
	}
	result, err := gantt.Build(ds, cfg)
	if err != nil {
		t.Fatalf("Build error: %v", err)
	}
	// Only 1 valid row (invalid dates and empty name are skipped).
	if len(result.Tasks) != 1 {
		t.Fatalf("want 1 valid task, got %d", len(result.Tasks))
	}
}

func TestInferDefaults(t *testing.T) {
	headers := []string{"task name", "start date", "end date", "project group", "owner"}
	cfg := gantt.InferDefaults(headers)
	if cfg.TaskCol == "" {
		t.Errorf("InferDefaults should infer TaskCol, headers: %v", headers)
	}
	if cfg.StartCol == "" {
		t.Errorf("InferDefaults should infer StartCol, headers: %v", headers)
	}
	if cfg.EndCol == "" {
		t.Errorf("InferDefaults should infer EndCol, headers: %v", headers)
	}
}
