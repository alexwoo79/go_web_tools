// Package viz contains the generic ECharts visualisation registry and builders.
package viz

import (
	"fmt"
	"strings"

	"go-web/internal/analytics/model"
)

// Builder creates a chart payload from a dataset and viz config.
type Builder interface {
	Definition() model.ChartDefinition
	Build(dataset model.Dataset, cfg model.VizConfig) (map[string]any, error)
}

type builder struct {
	def   model.ChartDefinition
	build func(dataset model.Dataset, cfg model.VizConfig) (map[string]any, error)
}

func (b builder) Definition() model.ChartDefinition { return b.def }
func (b builder) Build(dataset model.Dataset, cfg model.VizConfig) (map[string]any, error) {
	return b.build(dataset, cfg)
}

var registry = map[string]Builder{}
var order []string

func register(def model.ChartDefinition, fn func(dataset model.Dataset, cfg model.VizConfig) (map[string]any, error)) {
	registry[def.Kind] = builder{def: def, build: fn}
	order = append(order, def.Kind)
}

// Get returns a registered builder by chart kind.
func Get(kind string) (Builder, bool) {
	b, ok := registry[kind]
	return b, ok
}

// Definitions returns all builder metadata in registration order.
func Definitions() []model.ChartDefinition {
	out := make([]model.ChartDefinition, 0, len(order))
	for _, kind := range order {
		out = append(out, registry[kind].Definition())
	}
	return out
}

// Normalize applies defaults to config.
func Normalize(cfg model.VizConfig) model.VizConfig {
	if cfg.ChartKind == "" {
		cfg.ChartKind = "bar"
	}
	if cfg.Theme == "" {
		cfg.Theme = "default"
	}
	if cfg.SeriesName == "" {
		cfg.SeriesName = "Series 1"
	}
	if cfg.Series2Name == "" {
		cfg.Series2Name = "Series 2"
	}
	if cfg.Series3Name == "" {
		cfg.Series3Name = "Series 3"
	}
	if cfg.SortMode == "" {
		cfg.SortMode = "none"
	}
	if cfg.GaugeMode == "" {
		cfg.GaugeMode = "avg"
	}
	cfg.YExtraCols = normalizeCols(cfg.YExtraCols)
	selectedCount := len(selectedYCols(cfg))
	if cfg.YMetricCount < 1 {
		cfg.YMetricCount = selectedCount
	}
	if cfg.YMetricCount < 1 {
		cfg.YMetricCount = 1
	}
	if selectedCount > cfg.YMetricCount {
		cfg.YMetricCount = selectedCount
	}
	if cfg.YMetricCount > 10 {
		cfg.YMetricCount = 10
	}
	return cfg
}

// InferDefaults creates a best-effort config from headers.
func InferDefaults(headers []string) model.VizConfig {
	return Normalize(model.VizConfig{
		ChartKind:    "bar",
		Theme:        "default",
		SeriesName:   "指标A",
		Series2Name:  "指标B",
		Series3Name:  " 指标C",
		SortMode:     "none",
		GaugeMode:    "avg",
		XCol:         inferHeader(headers, "month", "date", "category", "name", "x"),
		YCol:         inferHeader(headers, "revenue", "value", "profit", "amount", "y"),
		Y2Col:        inferHeader(headers, "cost", "share", "value2", "y2"),
		Y3Col:        inferHeader(headers, "profit", "value3", "y3"),
		NameCol:      inferHeader(headers, "category", "name", "label"),
		ValueCol:     inferHeader(headers, "share", "revenue", "value", "amount"),
		Value2Col:    inferHeader(headers, "cost", "profit", "value2"),
		SizeCol:      inferHeader(headers, "scattersize", "size", "bubble"),
		SourceCol:    inferHeader(headers, "source", "from"),
		TargetCol:    inferHeader(headers, "target", "to"),
		LinkValueCol: inferHeader(headers, "linkvalue", "weight", "flow", "value"),
		NodeIDCol:    inferHeader(headers, "nodeid", "id"),
		ParentIDCol:  inferHeader(headers, "parentid", "parent"),
		NodeValueCol: inferHeader(headers, "nodevalue", "value", "amount"),
	})
}

// Build creates a payload with the builder selected by chart kind.
func Build(dataset model.Dataset, cfg model.VizConfig) (map[string]any, error) {
	cfg = Normalize(cfg)
	b, ok := Get(cfg.ChartKind)
	if !ok {
		return nil, fmt.Errorf("不支持的图形类型: %s", cfg.ChartKind)
	}
	return b.Build(dataset, cfg)
}

// ---- helpers ----------------------------------------------------------------

func inferHeader(headers []string, keys ...string) string {
	lower := make([]string, len(headers))
	for i, h := range headers {
		lower[i] = strings.ToLower(h)
	}
	for _, key := range keys {
		needle := strings.ToLower(key)
		for i := range headers {
			if strings.Contains(lower[i], needle) {
				return headers[i]
			}
		}
	}
	return ""
}

func headerIndex(headers []string) map[string]int {
	out := make(map[string]int, len(headers))
	for i, h := range headers {
		out[h] = i
	}
	return out
}

func idx(index map[string]int, col string) int {
	if col == "" {
		return -1
	}
	v, ok := index[col]
	if !ok {
		return -1
	}
	return v
}

func normalizeCols(cols []string) []string {
	if len(cols) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(cols))
	for _, c := range cols {
		v := strings.TrimSpace(c)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func selectedYCols(cfg model.VizConfig) []string {
	cols := make([]string, 0, 3+len(cfg.YExtraCols))
	if strings.TrimSpace(cfg.YCol) != "" {
		cols = append(cols, strings.TrimSpace(cfg.YCol))
	}
	if strings.TrimSpace(cfg.Y2Col) != "" {
		cols = append(cols, strings.TrimSpace(cfg.Y2Col))
	}
	if strings.TrimSpace(cfg.Y3Col) != "" {
		cols = append(cols, strings.TrimSpace(cfg.Y3Col))
	}
	cols = append(cols, normalizeCols(cfg.YExtraCols)...)
	return normalizeCols(cols)
}

// Exported helpers used by builder files in the same package.
var (
	_ = headerIndex // suppress unused warning (used by builder files)
	_ = idx
)
