package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
	"go-web/internal/models"
)

const maxFormRows = 10_000

// FromFormData reads form rows from SQLite and stores them as a temporary analytics dataset.
func FromFormData(db *models.Database, tableName, formName string, ownerID int, fields []string) (model.Dataset, error) {
	if db == nil {
		return model.Dataset{}, fmt.Errorf("数据库连接不可用")
	}
	if tableName == "" {
		return model.Dataset{}, fmt.Errorf("表名不能为空")
	}
	if !db.TableExists(tableName) {
		return model.Dataset{}, fmt.Errorf("表 %s 不存在", tableName)
	}

	available := make(map[string]struct{})
	for _, c := range db.TableColumns(tableName) {
		available[c] = struct{}{}
	}

	selected := normalizeRequestedFields(fields, available)
	if len(selected) == 0 {
		for c := range available {
			if c == "id" || c == "data" {
				continue
			}
			selected = append(selected, c)
		}
	}
	if len(selected) == 0 {
		return model.Dataset{}, fmt.Errorf("表单没有可用字段")
	}

	rows, err := db.QueryRowsLimited(tableName, selected, maxFormRows)
	if err != nil {
		return model.Dataset{}, fmt.Errorf("查询表单数据失败: %w", err)
	}

	headers := append([]string(nil), selected...)
	grid := make([][]string, 0, len(rows))
	for _, row := range rows {
		line := make([]string, 0, len(headers))
		for _, h := range headers {
			line = append(line, toCell(row[h]))
		}
		grid = append(grid, line)
	}

	now := time.Now().UTC()
	ds := model.Dataset{
		ID:        uuid.NewString(),
		Name:      formName,
		Source:    "form",
		FormName:  formName,
		OwnerID:   ownerID,
		Headers:   headers,
		Rows:      grid,
		CreatedAt: now,
		ExpiresAt: now.Add(time.Hour),
	}
	if err := dataset.Store(ds); err != nil {
		return model.Dataset{}, fmt.Errorf("数据集存储失败: %w", err)
	}
	return ds, nil
}

func normalizeRequestedFields(fields []string, available map[string]struct{}) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		name := strings.TrimSpace(f)
		if name == "" {
			continue
		}
		if _, ok := available[name]; !ok {
			continue
		}
		if _, dup := seen[name]; dup {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	return out
}

func toCell(v any) string {
	if v == nil {
		return ""
	}
	switch vv := v.(type) {
	case string:
		return vv
	case []byte:
		return string(vv)
	default:
		return fmt.Sprintf("%v", vv)
	}
}
