package dataset_test

import (
	"bytes"
	"strings"
	"testing"

	"go-web/internal/analytics/dataset"
)

func TestParseCSV_basic(t *testing.T) {
	csv := "name,value\nAlice,100\nBob,200\n"
	headers, rows, err := dataset.ParseCSV(strings.NewReader(csv))
	if err != nil {
		t.Fatalf("ParseCSV error: %v", err)
	}
	if len(headers) != 2 {
		t.Fatalf("want 2 headers, got %d", len(headers))
	}
	if headers[0] != "name" || headers[1] != "value" {
		t.Fatalf("unexpected headers: %v", headers)
	}
	if len(rows) != 2 {
		t.Fatalf("want 2 rows, got %d", len(rows))
	}
	if rows[0][0] != "Alice" || rows[1][1] != "200" {
		t.Fatalf("unexpected row data: %v", rows)
	}
}

func TestParseCSV_empty(t *testing.T) {
	_, _, err := dataset.ParseCSV(bytes.NewReader(nil))
	if err == nil {
		t.Fatal("expected error for empty CSV")
	}
}

func TestParseDate_iso(t *testing.T) {
	got, err := dataset.ParseDate("2024-01-15")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Year() != 2024 || int(got.Month()) != 1 || got.Day() != 15 {
		t.Fatalf("unexpected date: %v", got)
	}
}

func TestParseDate_slash(t *testing.T) {
	got, err := dataset.ParseDate("2024/03/20")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if int(got.Month()) != 3 || got.Day() != 20 {
		t.Fatalf("unexpected date: %v", got)
	}
}

func TestParseDate_chinese(t *testing.T) {
	got, err := dataset.ParseDate("2024\u5e7406\u670801\u65e5")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Year() != 2024 || int(got.Month()) != 6 {
		t.Fatalf("unexpected date: %v", got)
	}
}

func TestParseDate_excelSerial(t *testing.T) {
	// Excel serial 45306 \u2248 2024-01-14
	got, err := dataset.ParseDate("45306")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Year() != 2024 {
		t.Fatalf("expected year 2024, got %d", got.Year())
	}
}

func TestParseDate_invalid(t *testing.T) {
	_, err := dataset.ParseDate("not-a-date")
	if err == nil {
		t.Fatal("expected error for invalid date")
	}
}

func TestParseDate_empty(t *testing.T) {
	_, err := dataset.ParseDate("")
	if err == nil {
		t.Fatal("expected error for empty string")
	}
}

func TestCell_basic(t *testing.T) {
	row := []string{"  Alice  ", "42", ""}
	if got := dataset.Cell(row, 0); got != "Alice" {
		t.Fatalf("want Alice, got %q", got)
	}
	if got := dataset.Cell(row, 99); got != "" {
		t.Fatalf("want empty for OOB, got %q", got)
	}
	if got := dataset.Cell(row, -1); got != "" {
		t.Fatalf("want empty for negative, got %q", got)
	}
}
