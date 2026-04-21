// Package service provides higher-level helpers that orchestrate dataset
// ingestion and chart building.
package service

import (
	"fmt"
	"mime/multipart"
	"time"

	"github.com/google/uuid"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
)

const (
	maxUploadBytes = 10 << 20 // 10 MB
	maxRows        = 100_000
	maxCols        = 200
)

// NewDatasetFromUpload parses an uploaded file and stores the result.
// ownerID should be the admin user ID who owns the session.
func NewDatasetFromUpload(fh *multipart.FileHeader, ownerID int) (model.Dataset, error) {
	if fh.Size > maxUploadBytes {
		return model.Dataset{}, fmt.Errorf("文件大小超过限制 (最大 10 MB)")
	}

	headers, rows, err := dataset.ParseUploadedFile(fh)
	if err != nil {
		return model.Dataset{}, err
	}

	if len(rows) > maxRows {
		return model.Dataset{}, fmt.Errorf("数据行数超过限制 (最大 %d 行)", maxRows)
	}
	if len(headers) > maxCols {
		return model.Dataset{}, fmt.Errorf("列数超过限制 (最大 %d 列)", maxCols)
	}

	now := time.Now().UTC()
	ds := model.Dataset{
		ID:        uuid.NewString(),
		Name:      fh.Filename,
		Source:    "upload",
		OwnerID:   ownerID,
		Headers:   headers,
		Rows:      rows,
		CreatedAt: now,
		ExpiresAt: now.Add(time.Hour),
	}

	if err := dataset.Store(ds); err != nil {
		return model.Dataset{}, fmt.Errorf("数据集存储失败: %w", err)
	}

	return ds, nil
}
