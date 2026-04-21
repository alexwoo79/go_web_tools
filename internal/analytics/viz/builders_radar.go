package viz

import (
	"fmt"
	"math"
	"strings"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
)

func buildRadar(ds model.Dataset, cfg model.VizConfig) (map[string]any, error) {
	index := headerIndex(ds.Headers)
	nameIdx := idx(index, cfg.NameCol)
	if nameIdx < 0 {
		return nil, fmt.Errorf("请为雷达图选择指标名称列（nameCol）")
	}

	yCols := selectedYCols(cfg)
	if len(yCols) < 1 {
		return nil, fmt.Errorf("雷达图至少需要一个数值列")
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
	if len(yIndices) < 1 {
		return nil, fmt.Errorf("未找到可用的数值列")
	}

	indicators := []map[string]any{}
	seriesDataList := make([][]float64, len(yIndices))
	for i := range seriesDataList {
		seriesDataList[i] = make([]float64, 0)
	}
	maxVals := make([]float64, len(yIndices))

	for _, row := range ds.Rows {
		name := strings.TrimSpace(dataset.Cell(row, nameIdx))
		if name == "" {
			continue
		}
		rowValues := make([]float64, len(yIndices))
		valid := true
		for i, colIdx := range yIndices {
			v, err := parseFloat(dataset.Cell(row, colIdx))
			if err != nil {
				valid = false
				break
			}
			rowValues[i] = v
			if rowValues[i] > maxVals[i] {
				maxVals[i] = rowValues[i]
			}
		}
		if !valid {
			continue
		}
		indicators = append(indicators, map[string]any{"name": name})
		for i, val := range rowValues {
			seriesDataList[i] = append(seriesDataList[i], val)
		}
	}
	if len(indicators) == 0 {
		return nil, fmt.Errorf("未解析到可用的指标行数据")
	}

	for i := range indicators {
		maxAtIdx := 0.0
		for seriesIdx := range seriesDataList {
			if i < len(seriesDataList[seriesIdx]) && seriesDataList[seriesIdx][i] > maxAtIdx {
				maxAtIdx = seriesDataList[seriesIdx][i]
			}
		}
		maxVal := math.Ceil(maxAtIdx*1.2 + 1)
		if maxVal < 10 {
			maxVal = 10
		}
		indicators[i]["max"] = maxVal
	}

	series := make([]map[string]any, len(yIndices))
	seriesNames := []string{cfg.SeriesName, cfg.Series2Name, cfg.Series3Name}
	for i, col := range resolvedYCols {
		seriesName := col
		if i < len(seriesNames) && strings.TrimSpace(seriesNames[i]) != "" {
			seriesName = seriesNames[i]
		}
		series[i] = map[string]any{
			"name": seriesName,
			"type": "radar",
			"data": []map[string]any{{"value": seriesDataList[i], "name": seriesName}},
		}
	}

	return map[string]any{
		"kind":       cfg.ChartKind,
		"title":      map[string]any{"text": cfg.Title, "subtext": cfg.SubTitle},
		"indicators": indicators,
		"series":     series,
	}, nil
}

func init() {
	register(model.ChartDefinition{
		Kind: "radar", Label: "雷达图", Family: "构成分析",
		Description: "多指标能力画像", Hint: "适合少量核心维度的平均或代表值。",
		Fields: []model.FieldDef{
			{Key: "nameCol", Label: "指标名称字段", Required: true, Type: "column", Aliases: []string{"nameField"}},
			{Key: "yCol", Label: "主数值字段", Required: true, Type: "column", Aliases: []string{"yAxis"}},
			{Key: "y2Col", Label: "第 2 数值字段", Type: "column", Aliases: []string{"y2Axis"}},
			{Key: "y3Col", Label: "第 3 数值字段", Type: "column", Aliases: []string{"y3Axis"}},
			{Key: "yExtraCols", Label: "扩展数值字段", Description: "可多选", Type: "column", Multi: true},
			{Key: "yMetricCount", Label: "Y 数据数量", Description: "控制 Y2/Y3/扩展字段显示", Type: "select", Options: []string{"1", "2", "3", "4", "5", "6", "7", "8"}},
			{Key: "subTitle", Label: "副标题", Type: "text"},
			{Key: "seriesName", Label: "系列 1 名称", Type: "text"},
			{Key: "series2Name", Label: "系列 2 名称", Type: "text"},
			{Key: "series3Name", Label: "系列 3 名称", Type: "text"},
		},
	}, buildRadar)
}
