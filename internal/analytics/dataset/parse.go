// Package dataset handles file parsing and in-memory dataset storage.
package dataset

import (
	"encoding/csv"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

// ParseCSV reads all rows from a CSV reader.
// The first row is treated as a header row.
func ParseCSV(r io.Reader) (headers []string, rows [][]string, err error) {
	cr := csv.NewReader(r)
	cr.LazyQuotes = true
	cr.TrimLeadingSpace = true

	all, err := cr.ReadAll()
	if err != nil {
		return nil, nil, fmt.Errorf("CSV 解析失败: %w", err)
	}
	if len(all) == 0 {
		return nil, nil, fmt.Errorf("CSV 文件为空")
	}
	headers = all[0]
	if len(all) > 1 {
		rows = all[1:]
	}
	return headers, rows, nil
}

// ParseXLSX reads rows from the first sheet of an Excel file.
func ParseXLSX(r io.Reader) (headers []string, rows [][]string, err error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, nil, fmt.Errorf("XLSX 解析失败: %w", err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, nil, fmt.Errorf("XLSX 文件没有工作表")
	}

	allRows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, nil, fmt.Errorf("XLSX 读取失败: %w", err)
	}
	if len(allRows) == 0 {
		return nil, nil, fmt.Errorf("XLSX 第一个工作表为空")
	}

	headers = allRows[0]
	if len(allRows) > 1 {
		rows = allRows[1:]
	}
	return headers, rows, nil
}

// ParseUploadedFile dispatches to ParseCSV or ParseXLSX based on file extension.
func ParseUploadedFile(fh *multipart.FileHeader) (headers []string, rows [][]string, err error) {
	f, err := fh.Open()
	if err != nil {
		return nil, nil, fmt.Errorf("打开上传文件失败: %w", err)
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(fh.Filename))
	switch ext {
	case ".csv":
		return ParseCSV(f)
	case ".xlsx", ".xls":
		return ParseXLSX(f)
	default:
		return nil, nil, fmt.Errorf("不支持的文件类型 %q，请上传 CSV 或 XLSX", ext)
	}
}

// ParseDate attempts to parse a date/time string using 20+ common formats,
// including Chinese date strings and Excel serial date numbers.
func ParseDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("空日期字符串")
	}

	// Excel serial number (e.g. "44927")
	if n, err := strconv.ParseFloat(s, 64); err == nil && n > 0 {
		// Excel epoch: Jan 0, 1900. Adjust for leap-year bug.
		epoch := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
		days := int(n)
		frac := n - float64(days)
		secs := int(math.Round(frac * 86400))
		t := epoch.AddDate(0, 0, days).Add(time.Duration(secs) * time.Second)
		if t.Year() >= 1900 && t.Year() <= 2100 {
			return t, nil
		}
	}

	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02",
		"2006/01/02",
		"01/02/2006",
		"01-02-2006",
		"02/01/2006",
		"02-01-2006",
		"Jan 2, 2006",
		"Jan 2 2006",
		"January 2, 2006",
		"January 2 2006",
		"2006年01月02日",
		"2006年1月2日",
		"2006-1-2",
		"2006/1/2",
		"1/2/2006",
		"2 Jan 2006",
		"2-Jan-2006",
		"20060102",
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}

	return time.Time{}, fmt.Errorf("无法解析日期: %q", s)
}

// Cell safely retrieves a cell value from a row by column index.
// Returns an empty string if the index is out of range or negative.
func Cell(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}
