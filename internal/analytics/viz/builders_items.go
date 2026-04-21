package viz

import (
	"fmt"
	"math"
	"strings"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
)

func buildScatter(ds model.Dataset, cfg model.VizConfig) (map[string]any, error) {
	index := headerIndex(ds.Headers)
	xIdx := idx(index, cfg.XCol)
	yIdx := idx(index, cfg.YCol)
	sizeIdx := idx(index, cfg.SizeCol)
	if xIdx < 0 || yIdx < 0 {
		return nil, fmt.Errorf("请为散点图选择 X 轴列和 Y 轴列")
	}

	points := make([]map[string]any, 0, len(ds.Rows))
	for _, row := range ds.Rows {
		x, err := parseFloat(dataset.Cell(row, xIdx))
		if err != nil {
			continue
		}
		y, err := parseFloat(dataset.Cell(row, yIdx))
		if err != nil {
			continue
		}
		size := 12.0
		if sizeIdx >= 0 {
			if sv, err := parseFloat(dataset.Cell(row, sizeIdx)); err == nil {
				size = math.Max(6, math.Min(44, sv))
			}
		}
		points = append(points, map[string]any{"value": []float64{x, y, size}})
	}
	if len(points) == 0 {
		return nil, fmt.Errorf("未解析到可用散点数据，请确认 X/Y 列为数值")
	}

	return map[string]any{
		"kind":       cfg.ChartKind,
		"title":      map[string]any{"text": cfg.Title, "subtext": cfg.SubTitle},
		"xName":      cfg.XCol,
		"yName":      cfg.YCol,
		"seriesName": cfg.SeriesName,
		"sizeName":   cfg.SizeCol,
		"points":     points,
	}, nil
}

func buildItems(ds model.Dataset, cfg model.VizConfig) (map[string]any, error) {
	index := headerIndex(ds.Headers)
	nameIdx := idx(index, cfg.NameCol)
	valueIdx := idx(index, cfg.ValueCol)
	if nameIdx < 0 || valueIdx < 0 {
		return nil, fmt.Errorf("请为该图形选择名称列和值列")
	}
	agg := map[string]float64{}
	items := make([]map[string]any, 0, len(ds.Rows))
	for _, row := range ds.Rows {
		name := dataset.Cell(row, nameIdx)
		if name == "" {
			continue
		}
		v, err := parseFloat(dataset.Cell(row, valueIdx))
		if err != nil {
			continue
		}
		if cfg.AggregateByName {
			agg[name] += v
		} else {
			items = append(items, map[string]any{"name": name, "value": v})
		}
	}
	if cfg.AggregateByName {
		for name, value := range agg {
			items = append(items, map[string]any{"name": name, "value": value})
		}
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("未解析到可用数值，请确认值列为数值")
	}
	return map[string]any{
		"kind":       cfg.ChartKind,
		"title":      map[string]any{"text": cfg.Title, "subtext": cfg.SubTitle},
		"seriesName": cfg.SeriesName,
		"items":      items,
	}, nil
}

func buildGauge(ds model.Dataset, cfg model.VizConfig) (map[string]any, error) {
	index := headerIndex(ds.Headers)
	valueIdx := idx(index, cfg.ValueCol)
	if valueIdx < 0 {
		return nil, fmt.Errorf("请为仪表盘选择数值列")
	}
	var vals []float64
	for _, row := range ds.Rows {
		if v, err := parseFloat(dataset.Cell(row, valueIdx)); err == nil {
			vals = append(vals, v)
		}
	}
	if len(vals) == 0 {
		return nil, fmt.Errorf("未解析到可用数值，请确认数值列为数字")
	}
	calc := vals[0]
	sum := 0.0
	minV, maxV := vals[0], vals[0]
	for _, v := range vals {
		sum += v
		if v < minV {
			minV = v
		}
		if v > maxV {
			maxV = v
		}
	}
	switch cfg.GaugeMode {
	case "min":
		calc = minV
	case "max":
		calc = maxV
	case "first":
		calc = vals[0]
	default:
		calc = sum / float64(len(vals))
	}
	gaugeMax := math.Ceil(maxV*1.2 + 1)
	if gaugeMax < 100 {
		gaugeMax = 100
	}
	return map[string]any{
		"kind":       cfg.ChartKind,
		"title":      map[string]any{"text": cfg.Title, "subtext": cfg.SubTitle},
		"seriesName": cfg.SeriesName,
		"value":      calc,
		"max":        gaugeMax,
	}, nil
}

func init() {
	itemFields := []model.FieldDef{
		{Key: "nameCol", Label: "名称字段", Description: "分类/标签列", Required: true, Type: "column", Aliases: []string{"nameField"}},
		{Key: "valueCol", Label: "数值字段", Description: "主数值列", Required: true, Type: "column", Aliases: []string{"valueField"}},
	}
	register(model.ChartDefinition{
		Kind: "scatter", Label: "散点图", Family: "基础分析",
		Description: "看分布与相关性", Hint: "支持气泡大小列。",
		Fields: []model.FieldDef{
			{Key: "xCol", Label: "X 轴字段", Required: true, Type: "column", Aliases: []string{"xAxis"}},
			{Key: "yCol", Label: "Y 轴字段", Required: true, Type: "column", Aliases: []string{"yAxis"}},
			{Key: "sizeCol", Label: "气泡大小字段", Required: false, Type: "column", Aliases: []string{"size"}},
		},
	}, buildScatter)
	register(model.ChartDefinition{
		Kind: "pie", Label: "饼图", Family: "构成分析",
		Description: "构成占比", Hint: "适合少量分类的比例展示。",
		Fields: itemFields,
	}, buildItems)
	register(model.ChartDefinition{
		Kind: "donut", Label: "环形图", Family: "构成分析",
		Description: "环形占比", Hint: "和饼图类似，但更适合中间留白做摘要。",
		Fields: itemFields,
	}, buildItems)
	register(model.ChartDefinition{
		Kind: "funnel", Label: "漏斗图", Family: "构成分析",
		Description: "阶段转化", Hint: "适合展示流程漏损。",
		Fields: itemFields,
	}, buildItems)
	register(model.ChartDefinition{
		Kind: "gauge", Label: "仪表盘", Family: "构成分析",
		Description: "单指标聚合", Hint: "适合单个 KPI。",
		Fields: []model.FieldDef{
			{Key: "valueCol", Label: "数值字段", Description: "用于聚合计算", Required: true, Type: "column", Aliases: []string{"valueField"}},
			{Key: "gaugeMode", Label: "聚合方式", Description: "avg/first/max/min", Type: "select", Options: []string{"avg", "first", "max", "min"}},
		},
	}, buildGauge)

	// suppress unused import warning at this package level
	_ = strings.TrimSpace
}
