package service

import (
	"fmt"

	"go-web/internal/analytics/dataset"
	"go-web/internal/analytics/model"
	"go-web/internal/analytics/viz"
)

// BuildChart retrieves a dataset, normalises the VizConfig, and builds the ECharts option payload.
func BuildChart(datasetID string, ownerID int, cfg model.VizConfig) (map[string]any, error) {
	ds, ok := dataset.Load(datasetID)
	if !ok {
		return nil, fmt.Errorf("数据集不存在或已过期")
	}
	if ds.OwnerID != ownerID {
		return nil, fmt.Errorf("无权访问该数据集")
	}
	return viz.Build(ds, cfg)
}
