package viz

import (
	"fmt"
	"strings"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
)

func buildHierarchy(ds model.Dataset, cfg model.VizConfig) (map[string]any, error) {
	validation := ValidateHierarchy(ds, cfg)
	if len(validation.Errors) > 0 {
		return nil, fmt.Errorf("%s", strings.Join(validation.Errors, "；"))
	}

	index := headerIndex(ds.Headers)
	nodeIDIdx := idx(index, cfg.NodeIDCol)
	parentIDIdx := idx(index, cfg.ParentIDCol)
	nodeValueIdx := idx(index, cfg.NodeValueCol)
	nameIdx := idx(index, cfg.NameCol)
	if nodeIDIdx < 0 {
		nodeIDIdx = nameIdx
	}
	if nodeIDIdx < 0 || parentIDIdx < 0 {
		return nil, fmt.Errorf("请为该图形选择节点ID列与父节点列")
	}
	if nodeIDIdx == parentIDIdx {
		return nil, fmt.Errorf("节点ID列与父节点列不能相同，否则会形成自循环")
	}

	type treeNode struct {
		ID       string
		Name     string
		Value    float64
		Children []*treeNode
	}
	nodesByID := map[string]*treeNode{}
	getNode := func(id string) *treeNode {
		if n, ok := nodesByID[id]; ok {
			return n
		}
		n := &treeNode{ID: id, Name: id}
		nodesByID[id] = n
		return n
	}
	roots := map[string]*treeNode{}

	for i, row := range ds.Rows {
		id := strings.TrimSpace(dataset.Cell(row, nodeIDIdx))
		if id == "" {
			id = fmt.Sprintf("node-%d", i+1)
		}
		parent := strings.TrimSpace(dataset.Cell(row, parentIDIdx))
		if parent == id {
			return nil, fmt.Errorf("第 %d 行节点ID与父节点相同（%s），请修正映射或数据", i+1, id)
		}
		name := ""
		if nameIdx >= 0 {
			name = strings.TrimSpace(dataset.Cell(row, nameIdx))
		}
		if name == "" {
			name = id
		}
		node := getNode(id)
		node.Name = name
		if nodeValueIdx >= 0 {
			if v, err := parseFloat(dataset.Cell(row, nodeValueIdx)); err == nil {
				node.Value = v
			}
		}
		if parent == "" {
			roots[id] = node
			continue
		}
		p := getNode(parent)
		exists := false
		for _, ch := range p.Children {
			if ch.ID == node.ID {
				exists = true
				break
			}
		}
		if !exists {
			p.Children = append(p.Children, node)
		}
		delete(roots, id)
	}

	var toPayload func(n *treeNode, stack map[string]bool) (map[string]any, error)
	toPayload = func(n *treeNode, stack map[string]bool) (map[string]any, error) {
		if stack[n.ID] {
			return nil, fmt.Errorf("检测到循环父子关系，节点ID: %s", n.ID)
		}
		stack[n.ID] = true
		defer delete(stack, n.ID)

		out := map[string]any{"name": n.Name}
		if n.Value != 0 {
			out["value"] = n.Value
		}
		if len(n.Children) > 0 {
			children := make([]map[string]any, 0, len(n.Children))
			for _, ch := range n.Children {
				child, err := toPayload(ch, stack)
				if err != nil {
					return nil, err
				}
				children = append(children, child)
			}
			out["children"] = children
		}
		return out, nil
	}

	rootNodes := make([]map[string]any, 0)
	for _, n := range roots {
		payloadNode, err := toPayload(n, map[string]bool{})
		if err != nil {
			return nil, err
		}
		rootNodes = append(rootNodes, payloadNode)
	}
	if len(rootNodes) == 0 {
		for _, n := range nodesByID {
			payloadNode, err := toPayload(n, map[string]bool{})
			if err != nil {
				return nil, err
			}
			rootNodes = append(rootNodes, payloadNode)
		}
	}
	if len(rootNodes) == 0 {
		return nil, fmt.Errorf("未解析到树结构数据")
	}

	root := map[string]any{"name": cfg.SeriesName, "children": rootNodes}
	if cfg.ChartKind == "tree" && len(rootNodes) == 1 {
		root = rootNodes[0]
	}
	return map[string]any{
		"kind":       cfg.ChartKind,
		"title":      map[string]any{"text": cfg.Title, "subtext": cfg.SubTitle},
		"seriesName": cfg.SeriesName,
		"tree":       root,
	}, nil
}

func init() {
	hierarchyFields := []model.FieldDef{
		{Key: "nodeIDCol", Label: "节点ID字段", Required: true, Type: "column"},
		{Key: "parentIDCol", Label: "父节点字段", Required: true, Type: "column"},
		{Key: "nameCol", Label: "显示名称字段", Required: false, Type: "column", Aliases: []string{"nameField"}},
		{Key: "nodeValueCol", Label: "数值字段", Required: false, Type: "column"},
		{Key: "subTitle", Label: "副标题", Type: "text"},
		{Key: "seriesName", Label: "系列名称", Type: "text"},
	}
	register(model.ChartDefinition{
		Kind: "tree", Label: "树图", Family: "层级结构",
		Description: "层级展开", Hint: "需要节点、父节点。",
		Fields: hierarchyFields,
	}, buildHierarchy)
	register(model.ChartDefinition{
		Kind: "treemap", Label: "矩形树图", Family: "层级结构",
		Description: "层级占比", Hint: "适合有父子层级和数值权重的数据。",
		Fields: hierarchyFields,
	}, buildHierarchy)
}
