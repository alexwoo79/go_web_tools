package handler

import "testing"

func gfPtr(v float64) *float64 { return &v }

func TestGradeCounts(t *testing.T) {
	rules := []GradeRule{{"A", "优秀", 0.2}, {"B", "良好", 0.25}, {"C", "合格", 0.3}, {"D", "待改进", 0.25}}
	counts := gradeCounts(4, rules)
	if counts[0] != 1 || counts[1] != 1 || counts[2] != 1 || counts[3] != 1 {
		t.Fatalf("counts = %v", counts)
	}
}

func TestComputeGrades(t *testing.T) {
	cfg := GradeConfig{
		Enabled: true,
		GroupBy: "department",
		Rules:   []GradeRule{{"A", "优秀", 0.2}, {"B", "良好", 0.25}, {"C", "合格", 0.3}, {"D", "待改进", 0.25}},
	}
	rows := []*resultRow{
		{id: 1, username: "a", department: "技术部", status: AssessmentStatusFinalized, total: gfPtr(92)},
		{id: 2, username: "b", department: "技术部", status: AssessmentStatusFinalized, total: gfPtr(86.4)},
		{id: 3, username: "c", department: "技术部", status: AssessmentStatusFinalized, total: gfPtr(78.2)},
		{id: 4, username: "d", department: "技术部", status: AssessmentStatusFinalized, total: gfPtr(70.2)},
		{id: 5, username: "e", department: "技术部", status: AssessmentStatusGrading, total: gfPtr(89)},
	}
	computeGrades(rows, cfg)
	want := map[int64]string{1: "A", 2: "B", 3: "C", 4: "D"}
	for _, r := range rows {
		if r.id == 5 {
			if r.hasGrade {
				t.Fatalf("grading record should not get grade")
			}
			continue
		}
		if !r.hasGrade || r.grade != want[r.id] || r.rank != int(r.id) {
			t.Fatalf("row %d got grade=%s rank=%d hasGrade=%v", r.id, r.grade, r.rank, r.hasGrade)
		}
	}
}

func TestComputeGradesDisabled(t *testing.T) {
	cfg := GradeConfig{Enabled: false}
	rows := []*resultRow{{id: 1, status: AssessmentStatusFinalized, total: gfPtr(90)}}
	computeGrades(rows, cfg)
	if rows[0].hasGrade {
		t.Fatalf("disabled config should not assign grades")
	}
}
