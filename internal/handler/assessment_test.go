package handler

import "testing"

func TestParseReviewChainDefault(t *testing.T) {
	c := parseReviewChain("")
	if len(c) != 3 {
		t.Fatalf("len = %d", len(c))
	}
	if c[0].Role != RoleDeptHead || c[0].Weight != 0.4 {
		t.Fatalf("scored = %+v", c[0])
	}
	if c[1].Role != RoleDivisionLeader || c[2].Role != RoleTopLeader || c[1].Weight != 0.3 || c[2].Weight != 0.3 {
		t.Fatalf("weights = %+v / %+v", c[1], c[2])
	}
}

func TestParseReviewChainOldString(t *testing.T) {
	c := parseReviewChain(`{"scored":"dept_head","approved":"division_leader","finalized":"top_leader"}`)
	if len(c) != 3 || c[0].Role != RoleDeptHead || c[0].Weight != 0.4 {
		t.Fatalf("got %+v", c)
	}
}

func TestParseReviewChainOldObject(t *testing.T) {
	c := parseReviewChain(`{"scored":{"role":"dept_head","weight":0.5},"finalized":{"role":"top_leader","weight":0.5}}`)
	if len(c) != 2 || c[0].Weight != 0.5 || c[1].Role != RoleTopLeader {
		t.Fatalf("got %+v", c)
	}
}

func TestParseReviewChainNewArray(t *testing.T) {
	c := parseReviewChain(`[{"role":"dept_head","weight":0.5},{"role":"top_leader","weight":0.5}]`)
	if len(c) != 2 || c[0].Weight != 0.5 || c[1].Role != RoleTopLeader {
		t.Fatalf("got %+v", c)
	}
}

func TestParseReviewChainEmptyArray(t *testing.T) {
	c := parseReviewChain(`[]`)
	if len(c) != 3 {
		t.Fatalf("empty array should fall back to default, got len=%d", len(c))
	}
}

func TestEffectiveStagesSkipSelf(t *testing.T) {
	c := defaultReviewChain()
	stages := effectiveStages(c, RoleDeptHead)
	if len(stages) != 2 {
		t.Fatalf("len = %d", len(stages))
	}
	if stages[0].role != RoleDivisionLeader || stages[0].id != "stage_2" {
		t.Fatalf("stage0 = %+v", stages[0])
	}
	if stages[1].role != RoleTopLeader || stages[1].id != "stage_3" {
		t.Fatalf("stage1 = %+v", stages[1])
	}
}

func TestEffectiveStagesNoSkip(t *testing.T) {
	c := defaultReviewChain()
	stages := effectiveStages(c, RoleStaff)
	if len(stages) != 3 {
		t.Fatalf("len = %d", len(stages))
	}
	if stages[0].id != "stage_1" || stages[1].id != "stage_2" || stages[2].id != "stage_3" {
		t.Fatalf("ids = %+v", stages)
	}
}

func TestWeightedAverageRenormalizes(t *testing.T) {
	c := defaultReviewChain()
	stages := effectiveStages(c, RoleDeptHead)
	scores := map[string]ScoreEntry{
		"stage_2": {Role: RoleDivisionLeader, Score: 80, Weight: 0.3},
		"stage_3": {Role: RoleTopLeader, Score: 100, Weight: 0.3},
	}
	total := weightedAverage(scores, stages)
	if total == nil || *total != 90 {
		t.Fatalf("total = %v", total)
	}
}

func TestWeightedAverageFull(t *testing.T) {
	c := defaultReviewChain()
	stages := effectiveStages(c, RoleStaff)
	scores := map[string]ScoreEntry{
		"stage_1": {Role: RoleDeptHead, Score: 90, Weight: 0.4},
		"stage_2": {Role: RoleDivisionLeader, Score: 80, Weight: 0.3},
		"stage_3": {Role: RoleTopLeader, Score: 100, Weight: 0.3},
	}
	total := weightedAverage(scores, stages)
	if total == nil || *total != 90 {
		t.Fatalf("total = %v", total)
	}
}

func TestAssessmentStatusFor(t *testing.T) {
	stages := effectiveStages(defaultReviewChain(), RoleStaff)
	if got := assessmentStatusFor(stages, map[string]ScoreEntry{}); got != AssessmentStatusSubmitted {
		t.Fatalf("empty = %s", got)
	}
	some := map[string]ScoreEntry{"stage_1": {Score: 90}}
	if got := assessmentStatusFor(stages, some); got != AssessmentStatusGrading {
		t.Fatalf("partial = %s", got)
	}
	all := map[string]ScoreEntry{
		"stage_1": {Score: 90}, "stage_2": {Score: 80}, "stage_3": {Score: 100},
	}
	if got := assessmentStatusFor(stages, all); got != AssessmentStatusFinalized {
		t.Fatalf("all = %s", got)
	}
	// 有有效评分人但还没打分 -> submitted（非空有效阶段）
	if got := assessmentStatusFor(effectiveStages(defaultReviewChain(), RoleTopLeader), map[string]ScoreEntry{}); got != AssessmentStatusSubmitted {
		t.Fatalf("top self (non-empty effective) should be submitted, got %s", got)
	}
}

func TestItemScoreGroups(t *testing.T) {
	fi := FormInfo{
		Fields: []FieldInfo{
			{Name: "key_tasks", Type: "repeated_group", GroupFields: []FieldInfo{{Name: "de_fen", Type: "number"}, {Name: "dan_xiang_quan_zhong", Type: "number"}}},
			{Name: "daily_tasks", Type: "repeated_group", GroupFields: []FieldInfo{{Name: "de_fen", Type: "number"}}},
			{Name: "other", Type: "repeated_group", GroupFields: []FieldInfo{{Name: "note", Type: "text"}}},
		},
		Scoring: &ScoringInfo{Mode: "item_weighted", ScoreField: "de_fen", WeightField: "dan_xiang_quan_zhong"},
	}
	groups := itemScoreGroups(fi)
	if len(groups) != 2 {
		t.Fatalf("len = %d", len(groups))
	}
	if groups[0].Name != "key_tasks" || groups[1].Name != "daily_tasks" {
		t.Fatalf("groups = %+v", groups)
	}
}

func TestAggregateItemScoresWeighted(t *testing.T) {
	fi := FormInfo{
		Fields: []FieldInfo{
			{Name: "key_tasks", Type: "repeated_group", GroupFields: []FieldInfo{{Name: "de_fen", Type: "number"}, {Name: "dan_xiang_quan_zhong", Type: "number"}}},
		},
		Scoring: &ScoringInfo{Mode: "item_weighted", ScoreField: "de_fen", WeightField: "dan_xiang_quan_zhong"},
	}
	data := map[string]interface{}{
		"key_tasks": []map[string]interface{}{
			{"de_fen": "", "dan_xiang_quan_zhong": 0.6},
			{"de_fen": "", "dan_xiang_quan_zhong": 0.4},
		},
	}
	items := map[string][]float64{"key_tasks": {80, 100}}
	got := aggregateItemScores(fi, "item_weighted", data, items)
	if got != 88 {
		t.Fatalf("weighted aggregate = %v", got)
	}
}

func TestAggregateItemScoresAvg(t *testing.T) {
	fi := FormInfo{
		Fields: []FieldInfo{
			{Name: "key_tasks", Type: "repeated_group", GroupFields: []FieldInfo{{Name: "de_fen", Type: "number"}}},
		},
		Scoring: &ScoringInfo{Mode: "item_avg", ScoreField: "de_fen"},
	}
	data := map[string]interface{}{
		"key_tasks": []map[string]interface{}{{"de_fen": ""}, {"de_fen": ""}, {"de_fen": ""}},
	}
	items := map[string][]float64{"key_tasks": {60, 80, 100}}
	got := aggregateItemScores(fi, "item_avg", data, items)
	if got != 80 {
		t.Fatalf("avg aggregate = %v", got)
	}
}
