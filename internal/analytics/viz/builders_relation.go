package viz

import (
	"fmt"
	"math"
	"strings"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
)

func buildRelation(ds model.Dataset, cfg model.VizConfig) (map[string]any, error) {
	index := headerIndex(ds.Headers)
	sourceIdx := idx(index, cfg.SourceCol)
	targetIdx := idx(index, cfg.TargetCol)
	valueIdx := idx(index, cfg.LinkValueCol)
	if sourceIdx < 0 || targetIdx < 0 {
		return nil, fmt.Errorf("请为该图形选择来源列和目标列")
	}
	nodeSet := map[string]struct{}{}
	degree := map[string]float64{}
	nodes := make([]map[string]any, 0)
	links := make([]map[string]any, 0)

	for _, row := range ds.Rows {
		source := strings.TrimSpace(dataset.Cell(row, sourceIdx))
		target := strings.TrimSpace(dataset.Cell(row, targetIdx))
		if source == "" || target == "" {
			continue
		}
		value := 1.0
		if valueIdx >= 0 {
			if v, err := parseFloat(dataset.Cell(row, valueIdx)); err == nil {
				value = v
			}
		}
		if _, ok := nodeSet[source]; !ok {
			nodeSet[source] = struct{}{}
			nodes = append(nodes, map[string]any{"name": source})
		}
		if _, ok := nodeSet[target]; !ok {
			nodeSet[target] = struct{}{}
			nodes = append(nodes, map[string]any{"name": target})
		}
		degree[source] += value
		degree[target] += value
		links = append(links, map[string]any{"source": source, "target": target, "value": value})
	}
	if len(links) == 0 {
		return nil, fmt.Errorf("未解析到关系数据，请确认来源/目标列")
	}

	if cfg.ChartKind == "graph" || cfg.ChartKind == "chord" {
		for i := range nodes {
			name := fmt.Sprintf("%v", nodes[i]["name"])
			size := 10 + math.Sqrt(math.Max(1, degree[name]))*2.6
			if size > 58 {
				size = 58
			}
			nodes[i]["value"] = degree[name]
			nodes[i]["symbolSize"] = size
		}
	}

	subTitle := cfg.SubTitle
	if subTitle == "" && cfg.ChartKind == "chord" {
		subTitle = "和弦风格关系布局"
	}
	return map[string]any{
		"kind":       cfg.ChartKind,
		"title":      map[string]any{"text": cfg.Title, "subtext": subTitle},
		"seriesName": cfg.SeriesName,
		"nodes":      nodes,
		"links":      links,
	}, nil
}

func init() {
	relationFields := []model.FieldDef{
		{Key: "sourceCol", Label: "来源字段", Required: true, Type: "column"},
		{Key: "targetCol", Label: "目标字段", Required: true, Type: "column"},
		{Key: "linkValueCol", Label: "权重字段", Required: false, Type: "column"},
	}
	register(model.ChartDefinition{
		Kind: "sankey", Label: "桑基图", Family: "关系流向",
		Description: "节点流向关系", Hint: "需要来源、目标和可选权重。",
		Fields: relationFields,
	}, buildRelation)
	register(model.ChartDefinition{
		Kind: "graph", Label: "关系图", Family: "关系流向",
		Description: "网络关系", Hint: "适合节点关系网络。",
		Fields: relationFields,
	}, buildRelation)
	register(model.ChartDefinition{
		Kind: "chord", Label: "和弦图", Family: "关系流向",
		Description: "环形关系强度", Hint: "适合互联关系。",
		Fields: relationFields,
	}, buildRelation)
}
