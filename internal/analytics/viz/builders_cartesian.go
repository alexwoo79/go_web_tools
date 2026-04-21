package viz

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
)

func parseFloat(value string) (float64, error) {
	v := strings.TrimSpace(value)
	if n, err := strconv.ParseFloat(v, 64); err == nil {
		return n, nil
	}
	// Fallback: when users map date columns in generic charts, treat dates as Unix milliseconds.
	if t, err := dataset.ParseDate(v); err == nil {
		return float64(t.UnixMilli()), nil
	}
	return 0, fmt.Errorf("invalid number/date: %q", v)
}

func buildCartesian(ds model.Dataset, cfg model.VizConfig) (map[string]any, error) {
	index := headerIndex(ds.Headers)
	xIdx := idx(index, cfg.XCol)
	yCols := selectedYCols(cfg)
	if xIdx < 0 || len(yCols) == 0 {
		return nil, fmt.Errorf("请为该图形选择 X 轴列和 Y 轴列")
	}

	yIndices := make([]int, 0, len(yCols))
	resolvedYCols := make([]string, 0, len(yCols))
	for _, col := range yCols {
		colIdx := idx(index, col)
		if colIdx >= 0 {
			yIndices = append(yIndices, colIdx)
			resolvedYCols = append(resolvedYCols, col)
		}
	}
	if len(yIndices) == 0 {
		return nil, fmt.Errorf("未匹配到可用的 Y 轴列，请确认列名")
	}

	xAxis := make([]string, 0, len(ds.Rows))
	seriesData := make([][]float64, len(yIndices))
	for i := range seriesData {
		seriesData[i] = make([]float64, 0, len(ds.Rows))
	}

	for _, row := range ds.Rows {
		x := dataset.Cell(row, xIdx)
		if x == "" {
			continue
		}
		values := make([]float64, len(yIndices))
		valid := true
		for i, colIdx := range yIndices {
			v, err := parseFloat(dataset.Cell(row, colIdx))
			if err != nil {
				valid = false
				break
			}
			values[i] = v
		}
		if !valid {
			continue
		}
		xAxis = append(xAxis, x)
		for i := range values {
			seriesData[i] = append(seriesData[i], values[i])
		}
	}
	if len(seriesData) == 0 || len(seriesData[0]) == 0 {
		return nil, fmt.Errorf("未解析到可用数值，请确认 Y 轴列为数值")
	}

	if cfg.SortMode == "asc" || cfg.SortMode == "desc" {
		order := make([]int, len(seriesData[0]))
		for i := range order {
			order[i] = i
		}
		multiplier := 1.0
		if cfg.SortMode == "desc" {
			multiplier = -1.0
		}
		sort.SliceStable(order, func(i, j int) bool {
			return multiplier*seriesData[0][order[i]] < multiplier*seriesData[0][order[j]]
		})
		sortedX := make([]string, 0, len(xAxis))
		sortedSeries := make([][]float64, len(seriesData))
		for i := range sortedSeries {
			sortedSeries[i] = make([]float64, 0, len(seriesData[i]))
		}
		for _, pos := range order {
			sortedX = append(sortedX, xAxis[pos])
			for i := range sortedSeries {
				sortedSeries[i] = append(sortedSeries[i], seriesData[i][pos])
			}
		}
		xAxis = sortedX
		seriesData = sortedSeries
	}

	seriesNames := make([]string, 0, len(resolvedYCols))
	for i, col := range resolvedYCols {
		switch i {
		case 0:
			seriesNames = append(seriesNames, cfg.SeriesName)
		case 1:
			seriesNames = append(seriesNames, cfg.Series2Name)
		case 2:
			seriesNames = append(seriesNames, cfg.Series3Name)
		default:
			seriesNames = append(seriesNames, col)
		}
	}

	seriesDefs := make([]map[string]any, 0, len(seriesData))
	for i := range seriesData {
		if len(seriesData[i]) != len(seriesData[0]) {
			continue
		}
		item := map[string]any{"name": seriesNames[i], "data": seriesData[i], "smooth": cfg.SmoothLine}
		seriesDefs = append(seriesDefs, item)
	}
	if len(seriesDefs) == 0 {
		return nil, fmt.Errorf("未解析到可用系列数据，请检查 Y 轴列")
	}

	return map[string]any{
		"kind":     cfg.ChartKind,
		"title":    map[string]any{"text": cfg.Title, "subtext": cfg.SubTitle},
		"xAxis":    xAxis,
		"series":   seriesDefs,
		"swapAxis": cfg.SwapAxis,
	}, nil
}

func init() {
	cartesianFields := []model.FieldDef{
		{Key: "xCol", Label: "X 轴字段", Description: "分类或时间列", Required: true, Type: "column", Aliases: []string{"xAxis"}},
		{Key: "yCol", Label: "Y 轴字段", Description: "主数值列", Required: true, Type: "column", Aliases: []string{"yAxis"}},
		{Key: "y2Col", Label: "Y2 字段", Description: "第 2 数值列", Type: "column", Aliases: []string{"y2Axis"}},
		{Key: "y3Col", Label: "Y3 字段", Description: "第 3 数值列", Type: "column", Aliases: []string{"y3Axis"}},
		{Key: "yExtraCols", Label: "扩展 Y 字段", Description: "第 4+ 数值列", Type: "column", Multi: true},
	}
	register(model.ChartDefinition{
		Kind: "bar", Label: "柱状图", Family: "基础分析",
		Description: "分类对比最直接", Hint: "适合按类别比较单值或多值。",
		Fields: cartesianFields,
	}, buildCartesian)
	register(model.ChartDefinition{
		Kind: "line", Label: "折线图", Family: "基础分析",
		Description: "趋势变化", Hint: "适合按时间或顺序观察波动。",
		Fields: cartesianFields,
	}, buildCartesian)
	register(model.ChartDefinition{
		Kind: "area", Label: "面积图", Family: "基础分析",
		Description: "趋势加体量感", Hint: "适合展示累计规模与趋势。",
		Fields: cartesianFields,
	}, buildCartesian)
	register(model.ChartDefinition{
		Kind: "stack_bar", Label: "堆叠柱状图", Family: "基础分析",
		Description: "总量与构成并看", Hint: "适合对比总量和子项组成。",
		Fields: cartesianFields,
	}, buildCartesian)
	register(model.ChartDefinition{
		Kind: "stack_area", Label: "堆叠面积图", Family: "基础分析",
		Description: "时间维度的构成变化", Hint: "适合看多个序列的累计走势。",
		Fields: cartesianFields,
	}, buildCartesian)
}
