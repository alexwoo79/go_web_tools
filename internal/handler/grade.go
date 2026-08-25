package handler

import (
	"encoding/json"
	"math"
	"sort"
	"strings"
)

// GradeRule 一个等级规则（如 A 优秀 20%）。
type GradeRule struct {
	Grade string  `json:"grade"`
	Label string  `json:"label"`
	Ratio float64 `json:"ratio"`
}

// GradeConfig 强制分布配置（考核定义里可配置，也可在表单 YAML 声明默认）。
type GradeConfig struct {
	Enabled bool        `json:"enabled"`
	GroupBy string      `json:"group_by"` // department=按部门比较 | all=全员一个池
	Rules   []GradeRule `json:"rules"`
}

func defaultGradeConfig() GradeConfig {
	return GradeConfig{
		Enabled: false,
		GroupBy: "department",
		Rules: []GradeRule{
			{Grade: "A", Label: "优秀", Ratio: 0.2},
			{Grade: "B", Label: "良好", Ratio: 0.3},
			{Grade: "C", Label: "合格", Ratio: 0.4},
			{Grade: "D", Label: "待改进", Ratio: 0.1},
		},
	}
}

// parseGradeConfig 解析等级配置 JSON；空时返回默认（未启用）。
func parseGradeConfig(s string) GradeConfig {
	def := defaultGradeConfig()
	if strings.TrimSpace(s) == "" {
		return def
	}
	var c GradeConfig
	if err := json.Unmarshal([]byte(s), &c); err != nil {
		return def
	}
	if len(c.Rules) == 0 {
		c.Rules = def.Rules
	}
	if c.GroupBy == "" {
		c.GroupBy = "department"
	}
	return c
}

// gradeConfigToJSON 序列化等级配置；未启用或规则为空则返回空串（走默认）。
func gradeConfigToJSON(c GradeConfig) string {
	if !c.Enabled || len(c.Rules) == 0 {
		return ""
	}
	b, _ := json.Marshal(c)
	return string(b)
}

// resultRow 结果列表中的一条记录（grade 计算后的展示载体）。
type resultRow struct {
	id         int64
	username   string
	department string
	formName   string
	formTitle  string
	status     string
	reviewedBy string
	updatedAt  string
	total      *float64
	scores     map[string]ScoreEntry
	reviewers  []map[string]interface{}
	grade      string
	gradeLabel string
	rank       int
	hasGrade   bool
}

// computeGrades 对已确认记录按最终得分做强制分布（A/B/C/D）。
// 仅在 cfg.Enabled 时生效；group_by=department 时每部门独立排，否则全员一个池。
func computeGrades(rows []*resultRow, cfg GradeConfig) {
	if !cfg.Enabled || len(cfg.Rules) == 0 {
		return
	}
	groups := map[string][]*resultRow{}
	for _, r := range rows {
		if r.status != AssessmentStatusFinalized || r.total == nil {
			continue
		}
		key := "__all__"
		if cfg.GroupBy != "all" {
			key = r.department
			if key == "" {
				key = "未分组"
			}
		}
		groups[key] = append(groups[key], r)
	}
	for _, gr := range groups {
		sort.SliceStable(gr, func(i, j int) bool {
			if *gr[i].total != *gr[j].total {
				return *gr[i].total > *gr[j].total
			}
			return gr[i].id < gr[j].id
		})
		counts := gradeCounts(len(gr), cfg.Rules)
		idx := 0
		for gi, rule := range cfg.Rules {
			for k := 0; k < counts[gi]; k++ {
				if idx >= len(gr) {
					break
				}
				gr[idx].grade = rule.Grade
				gr[idx].gradeLabel = rule.Label
				gr[idx].rank = idx + 1
				gr[idx].hasGrade = true
				idx++
			}
		}
		// 取整误差剩余挂到最后一档
		for ; idx < len(gr); idx++ {
			last := cfg.Rules[len(cfg.Rules)-1]
			gr[idx].grade = last.Grade
			gr[idx].gradeLabel = last.Label
			gr[idx].rank = idx + 1
			gr[idx].hasGrade = true
		}
	}
}

// gradeCounts 按比例计算各等级人数（四舍五入，非末级且 ratio>0 至少 1 人）。
func gradeCounts(n int, rules []GradeRule) []int {
	if n <= 0 || len(rules) == 0 {
		return nil
	}
	counts := make([]int, len(rules))
	remaining := n
	for i, r := range rules {
		if i == len(rules)-1 {
			counts[i] = remaining
			break
		}
		if remaining == 0 {
			counts[i] = 0
			continue
		}
		c := int(math.Round(float64(n) * r.Ratio))
		if r.Ratio > 0 && c < 1 {
			c = 1
		}
		if c > remaining {
			c = remaining
		}
		counts[i] = c
		remaining -= c
	}
	return counts
}
