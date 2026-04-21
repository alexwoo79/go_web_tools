// Package gantt implements the Gantt chart builder.
package gantt

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
)

// Result is the JSON-serialisable output produced by the Gantt builder.
type Result struct {
	Tasks []model.Task `json:"tasks"`
	Stats model.Stats  `json:"stats"`
}

// Build converts a Dataset and GanttConfig into a GanttResult.
func Build(ds model.Dataset, cfg model.GanttConfig) (*Result, error) {
	tasks, err := buildTasks(ds, cfg)
	if err != nil {
		return nil, err
	}
	return &Result{Tasks: tasks, Stats: computeStats(tasks)}, nil
}

// InferDefaults suggests a GanttConfig based on header names.
func InferDefaults(headers []string) model.GanttConfig {
	return model.GanttConfig{
		TaskCol:          guessColumn(headers, "task", "任务", "name"),
		StartCol:         guessColumn(headers, "start", "开始", "date"),
		EndCol:           guessColumn(headers, "end", "结束", "date"),
		ProjectCol:       guessColumn(headers, "project", "项目", "group"),
		ColorCol:         guessColumn(headers, "project", "分类", "group", "color"),
		DescCol:          guessColumn(headers, "desc", "description", "detail", "说明"),
		MilestoneCol:     guessColumn(headers, "milestone", "里程碑"),
		MilestoneDateCol: guessColumn(headers, "milestone date", "milestonedate", "里程碑日期"),
		PlanStartCol:     guessColumn(headers, "planstart", "计划开始", "baseline start"),
		PlanEndCol:       guessColumn(headers, "planend", "计划结束", "baseline end"),
		OwnerCol:         guessColumn(headers, "owner", "负责人", "assignee"),
	}
}

func buildTasks(ds model.Dataset, cfg model.GanttConfig) ([]model.Task, error) {
	if cfg.TaskCol == "" || cfg.StartCol == "" || cfg.EndCol == "" {
		return nil, fmt.Errorf("请至少选择任务列、开始日期列、结束日期列")
	}

	headerIndex := make(map[string]int, len(ds.Headers))
	for i, h := range ds.Headers {
		headerIndex[h] = i
	}

	getIdx := func(col string) int {
		if col == "" {
			return -1
		}
		if i, ok := headerIndex[col]; ok {
			return i
		}
		return -1
	}

	taskIdx := getIdx(cfg.TaskCol)
	startIdx := getIdx(cfg.StartCol)
	endIdx := getIdx(cfg.EndCol)
	projectIdx := getIdx(cfg.ProjectCol)
	colorIdx := getIdx(cfg.ColorCol)
	descIdx := getIdx(cfg.DescCol)
	mileIdx := getIdx(cfg.MilestoneCol)
	mileDateIdx := getIdx(cfg.MilestoneDateCol)
	planStartIdx := getIdx(cfg.PlanStartCol)
	planEndIdx := getIdx(cfg.PlanEndCol)
	ownerIdx := getIdx(cfg.OwnerCol)

	if taskIdx < 0 || startIdx < 0 || endIdx < 0 {
		return nil, fmt.Errorf("列映射无效，请重新选择必填列")
	}

	tasks := make([]model.Task, 0, len(ds.Rows))
	for _, row := range ds.Rows {
		taskName := dataset.Cell(row, taskIdx)
		if taskName == "" {
			continue
		}

		startAt, err := dataset.ParseDate(dataset.Cell(row, startIdx))
		if err != nil {
			continue
		}
		endAt, err := dataset.ParseDate(dataset.Cell(row, endIdx))
		if err != nil {
			continue
		}
		if endAt.Before(startAt) {
			startAt, endAt = endAt, startAt
		}

		project := dataset.Cell(row, projectIdx)
		if project == "" {
			project = "未分 组"
		}
		colorGroup := dataset.Cell(row, colorIdx)
		if colorGroup == "" {
			colorGroup = project
		}

		planStartISO := ""
		if t, err := dataset.ParseDate(dataset.Cell(row, planStartIdx)); err == nil {
			planStartISO = t.Format(time.RFC3339)
		}
		planEndISO := ""
		if t, err := dataset.ParseDate(dataset.Cell(row, planEndIdx)); err == nil {
			planEndISO = t.Format(time.RFC3339)
		}

		mileName := dataset.Cell(row, mileIdx)
		mileISO := ""
		if t, err := dataset.ParseDate(dataset.Cell(row, mileDateIdx)); err == nil {
			mileISO = t.Format(time.RFC3339)
		} else if mileName != "" {
			mileISO = startAt.Format(time.RFC3339)
		}

		days := int(endAt.Sub(startAt).Hours()/24) + 1
		if days < 1 {
			days = 1
		}

		tasks = append(tasks, model.Task{
			TaskName:      taskName,
			Project:       project,
			ColorGroup:    colorGroup,
			StartISO:      startAt.Format(time.RFC3339),
			EndISO:        endAt.Format(time.RFC3339),
			PlanStartISO:  planStartISO,
			PlanEndISO:    planEndISO,
			DurationDays:  days,
			Description:   dataset.Cell(row, descIdx),
			MilestoneName: mileName,
			MilestoneISO:  mileISO,
			Owner:         dataset.Cell(row, ownerIdx),
		})
	}

	if len(tasks) == 0 {
		return nil, fmt.Errorf("未解析出有效任务，请检查日期列格式")
	}

	if cfg.SortByStart {
		sort.SliceStable(tasks, func(i, j int) bool {
			if tasks[i].ColorGroup == tasks[j].ColorGroup {
				return tasks[i].StartISO < tasks[j].StartISO
			}
			return tasks[i].ColorGroup < tasks[j].ColorGroup
		})
	} else {
		sort.SliceStable(tasks, func(i, j int) bool {
			return tasks[i].ColorGroup < tasks[j].ColorGroup
		})
	}

	if cfg.ShowTaskNumber {
		for i := range tasks {
			tasks[i].TaskName = fmt.Sprintf("%02d  %s", i+1, tasks[i].TaskName)
		}
	}

	return tasks, nil
}

func computeStats(tasks []model.Task) model.Stats {
	if len(tasks) == 0 {
		return model.Stats{}
	}

	totalTaskDuration := 0
	maxDur := 0
	var actualMinStart, actualMaxEnd time.Time
	hasPlan := false
	var planMinStart, planMaxEnd time.Time

	for _, t := range tasks {
		totalTaskDuration += t.DurationDays
		if t.DurationDays > maxDur {
			maxDur = t.DurationDays
		}

		if startAt, startErr := time.Parse(time.RFC3339, t.StartISO); startErr == nil {
			if endAt, endErr := time.Parse(time.RFC3339, t.EndISO); endErr == nil {
				if startAt.After(endAt) {
					startAt, endAt = endAt, startAt
				}
				if actualMinStart.IsZero() || startAt.Before(actualMinStart) {
					actualMinStart = startAt
				}
				if actualMaxEnd.IsZero() || endAt.After(actualMaxEnd) {
					actualMaxEnd = endAt
				}
			}
		}

		if planStartAt, planStartErr := time.Parse(time.RFC3339, t.PlanStartISO); planStartErr == nil {
			if planEndAt, planEndErr := time.Parse(time.RFC3339, t.PlanEndISO); planEndErr == nil {
				if planEndAt.Before(planStartAt) {
					planStartAt, planEndAt = planEndAt, planStartAt
				}
				if !hasPlan {
					hasPlan = true
					planMinStart = planStartAt
					planMaxEnd = planEndAt
				} else {
					if planStartAt.Before(planMinStart) {
						planMinStart = planStartAt
					}
					if planEndAt.After(planMaxEnd) {
						planMaxEnd = planEndAt
					}
				}
			}
		}
	}

	actualSpan := 0
	if !actualMinStart.IsZero() && !actualMaxEnd.IsZero() {
		actualSpan = int(actualMaxEnd.Sub(actualMinStart).Hours()/24) + 1
	}
	if actualSpan < 1 {
		actualSpan = 1
	}

	planSpan := 0
	if hasPlan {
		planSpan = int(planMaxEnd.Sub(planMinStart).Hours()/24) + 1
	}
	if planSpan < 1 {
		planSpan = 1
	}

	return model.Stats{
		TaskCount:            len(tasks),
		AvgDurationDays:      float64(totalTaskDuration) / float64(len(tasks)),
		TotalDurationDay:     actualSpan,
		MaxDurationDay:       maxDur,
		PlanTotalDurationDay: planSpan,
		HasPlanTotalDuration: hasPlan,
	}
}

func guessColumn(headers []string, keys ...string) string {
	lower := make([]string, len(headers))
	for i, h := range headers {
		lower[i] = strings.ToLower(h)
	}
	for _, key := range keys {
		for i := range headers {
			if strings.Contains(lower[i], strings.ToLower(key)) {
				return headers[i]
			}
		}
	}
	return ""
}
