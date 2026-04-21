// Package model defines shared data types for the analytics subsystem.
package model

import "time"

// Dataset holds raw tabular data parsed from an uploaded file or a form query.
type Dataset struct {
	ID        string
	Name      string
	Source    string // "upload" | "form"
	FormName  string // populated when Source == "form"
	OwnerID   int    // admin user id who created the dataset
	Headers   []string
	Rows      [][]string
	CreatedAt time.Time
	ExpiresAt time.Time
}

// Task represents a single Gantt chart task row.
type Task struct {
	TaskName      string `json:"taskName"`
	Project       string `json:"project"`
	ColorGroup    string `json:"colorGroup"`
	StartISO      string `json:"startISO"`
	EndISO        string `json:"endISO"`
	PlanStartISO  string `json:"planStartISO"`
	PlanEndISO    string `json:"planEndISO"`
	DurationDays  int    `json:"durationDays"`
	Description   string `json:"description"`
	MilestoneName string `json:"milestoneName"`
	MilestoneISO  string `json:"milestoneISO"`
	Owner         string `json:"owner"`
}

// Stats holds summary statistics for a set of Gantt tasks.
type Stats struct {
	TaskCount            int     `json:"taskCount"`
	AvgDurationDays      float64 `json:"avgDurationDays"`
	TotalDurationDay     int     `json:"totalDurationDay"`
	MaxDurationDay       int     `json:"maxDurationDay"`
	PlanTotalDurationDay int     `json:"planTotalDurationDay"`
	HasPlanTotalDuration bool    `json:"hasPlanTotalDuration"`
}

// VizConfig stores the visualisation form selections for generic chart building.
type VizConfig struct {
	ChartKind       string
	Title           string
	SubTitle        string
	Theme           string
	SeriesName      string
	Series2Name     string
	Series3Name     string
	YMetricCount    int
	XCol            string
	YCol            string
	Y2Col           string
	Y3Col           string
	YExtraCols      []string
	NameCol         string
	ValueCol        string
	Value2Col       string
	SizeCol         string
	SwapAxis        bool
	SmoothLine      bool
	SortMode        string
	AggregateByName bool
	GaugeMode       string
	SourceCol       string
	TargetCol       string
	LinkValueCol    string
	NodeIDCol       string
	ParentIDCol     string
	NodeValueCol    string
}

// GanttConfig holds the column mapping for Gantt chart building.
type GanttConfig struct {
	TaskCol          string
	StartCol         string
	EndCol           string
	ProjectCol       string
	ColorCol         string
	DescCol          string
	MilestoneCol     string
	MilestoneDateCol string
	PlanStartCol     string
	PlanEndCol       string
	OwnerCol         string
	SortByStart      bool
	ShowTaskNumber   bool
}

// BuildRequest is the unified chart build request accepted by the API.
type BuildRequest struct {
	DatasetID string            `json:"datasetId"`
	ChartKind string            `json:"chartKind"`
	Config    map[string]string `json:"config"`
}

// BuildResponse wraps the ECharts option payload returned to the frontend.
type BuildResponse struct {
	Option map[string]any `json:"option"`
}

// FieldDef describes one required/optional field for a chart type.
type FieldDef struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Required bool   `json:"required"`
}

// ChartDefinition describes a visual builder for the UI.
type ChartDefinition struct {
	Kind        string     `json:"kind"`
	Label       string     `json:"label"`
	Family      string     `json:"family"`
	Description string     `json:"description"`
	Hint        string     `json:"hint"`
	Fields      []FieldDef `json:"fields"`
}

// HierarchyValidation summarises hierarchy mapping/data checks for tree-like charts.
type HierarchyValidation struct {
	OK       bool           `json:"ok"`
	Errors   []string       `json:"errors"`
	Warnings []string       `json:"warnings"`
	Stats    map[string]int `json:"stats"`
}
