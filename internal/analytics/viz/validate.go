package viz

import (
	"fmt"
	"strings"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
)

// ValidateHierarchy checks tree/treemap mapping consistency and basic topology issues.
func ValidateHierarchy(ds model.Dataset, cfg model.VizConfig) model.HierarchyValidation {
	res := model.HierarchyValidation{
		OK:       true,
		Errors:   []string{},
		Warnings: []string{},
		Stats:    map[string]int{},
	}

	index := headerIndex(ds.Headers)
	nodeIDIdx := idx(index, cfg.NodeIDCol)
	parentIDIdx := idx(index, cfg.ParentIDCol)
	nameIdx := idx(index, cfg.NameCol)
	if nodeIDIdx < 0 {
		nodeIDIdx = nameIdx
	}
	if nodeIDIdx < 0 || parentIDIdx < 0 {
		res.OK = false
		res.Errors = append(res.Errors, "请为该图形选择节点ID列与父节点列")
		return res
	}
	if nodeIDIdx == parentIDIdx {
		res.OK = false
		res.Errors = append(res.Errors, "节点ID列与父节点列不能相同，否则会形成自循环")
		return res
	}

	type edgeRow struct {
		line   int
		nodeID string
		parent string
	}

	idRows := map[string][]int{}
	parentRefs := map[string][]int{}
	edges := make([]edgeRow, 0, len(ds.Rows))
	parentByChild := map[string]string{}

	for i, row := range ds.Rows {
		lineNo := i + 2
		id := strings.TrimSpace(dataset.Cell(row, nodeIDIdx))
		if id == "" {
			id = fmt.Sprintf("node-%d", i+1)
			res.Warnings = append(res.Warnings, fmt.Sprintf("第 %d 行节点ID为空，已使用自动ID: %s", lineNo, id))
		}
		parent := strings.TrimSpace(dataset.Cell(row, parentIDIdx))
		if parent == id && parent != "" {
			res.Errors = append(res.Errors, fmt.Sprintf("第 %d 行节点ID与父节点相同（%s）", lineNo, id))
		}
		idRows[id] = append(idRows[id], lineNo)
		if parent != "" {
			parentRefs[parent] = append(parentRefs[parent], lineNo)
		}
		edges = append(edges, edgeRow{line: lineNo, nodeID: id, parent: parent})
		if parent != "" {
			if existed, ok := parentByChild[id]; ok && existed != parent {
				res.Errors = append(res.Errors, fmt.Sprintf("第 %d 行节点 %s 的父节点与前序记录冲突（%s vs %s）", lineNo, id, existed, parent))
			} else {
				parentByChild[id] = parent
			}
		}
	}

	if len(edges) == 0 {
		res.Errors = append(res.Errors, "未解析到树结构数据")
	}

	for id, lines := range idRows {
		if len(lines) > 1 {
			res.Warnings = append(res.Warnings, fmt.Sprintf("节点ID %s 在多行重复出现（行: %v），会被合并为同一节点", id, lines))
		}
	}

	orphanCount := 0
	for parentID, lines := range parentRefs {
		if _, ok := idRows[parentID]; ok {
			continue
		}
		orphanCount++
		res.Warnings = append(res.Warnings, fmt.Sprintf("父节点 %s 未作为节点出现（引用行: %v），将被视为隐式父节点", parentID, lines))
	}

	// Detect cycles by following each node's parent chain.
	seenCycles := map[string]bool{}
	for child := range parentByChild {
		pathIndex := map[string]int{}
		path := make([]string, 0, 8)
		cur := child
		for cur != "" {
			if start, ok := pathIndex[cur]; ok {
				cycle := append(append([]string{}, path[start:]...), cur)
				key := strings.Join(cycle, "->")
				if !seenCycles[key] {
					seenCycles[key] = true
					res.Errors = append(res.Errors, fmt.Sprintf("检测到循环父子关系: %s", strings.Join(cycle, " -> ")))
				}
				break
			}
			pathIndex[cur] = len(path)
			path = append(path, cur)
			next, ok := parentByChild[cur]
			if !ok {
				break
			}
			cur = next
		}
	}

	roots := 0
	for id := range idRows {
		parent, ok := parentByChild[id]
		if !ok || parent == "" {
			roots++
		}
	}

	res.Stats["rows"] = len(edges)
	res.Stats["nodes"] = len(idRows)
	res.Stats["roots"] = roots
	res.Stats["orphans"] = orphanCount
	res.OK = len(res.Errors) == 0
	return res
}
