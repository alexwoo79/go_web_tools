// src/utils/chartAdapter.ts
// 图表配置工厂 (ECharts Option Factory)
//
// 将后端返回的 ChartPayload 转换为 ECharts option 对象。
// 根据 chartType 选择不同的图表配置策略。
//
// 支持的图表类型（与 bi/plugins/*.py 对应）：
//   bar_chart        → 柱状图
//   line_chart       → 折线图
//   scatter_chart    → 散点图
//   pie_chart        → 饼图
//   heatmap_chart    → 热力图
//   boxplot_chart    → 箱线图
//   area_chart       → 面积图（折线+areaStyle）
//   histogram_chart  → 直方图（等同柱状图，bin 由后端处理）
//   density_chart    → 密度分布（折线+平滑）

import type { EChartsOption } from 'echarts'

// ─── 后端数据类型（与 Rust ApiResult<ChartPayload> 对应） ─────────────────────

export interface ColumnInfo {
  name: string
  dtype: string
}

export interface ChartPayload {
  columns: ColumnInfo[]
  rows: Record<string, string | number | null>[]
  total_rows: number
}

// ─── 图表类型枚举 ────────────────────────────────────────────────────────────

export type ChartType =
  | 'bar_chart'
  | 'line_chart'
  | 'scatter_chart'
  | 'pie_chart'
  | 'heatmap_chart'
  | 'boxplot_chart'
  | 'area_chart'
  | 'histogram_chart'
  | 'density_chart'

// ─── 图表参数 ────────────────────────────────────────────────────────────────

export interface ChartConfig {
  chartType: ChartType
  xCol: string
  yCol: string
  colorCol?: string
  title?: string
}

// ─── 公共基础 option ─────────────────────────────────────────────────────────

function baseOption(title?: string): Partial<EChartsOption> {
  return {
    backgroundColor: 'transparent',
    title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
    tooltip: { trigger: 'axis' as const },
    legend: { bottom: 0 },
    toolbox: {
      feature: {
        saveAsImage: { title: '保存图片' },
        dataZoom: { title: { zoom: '区域缩放', back: '还原' } },
        restore: { title: '还原' },
      },
    },
    grid: { left: 60, right: 40, top: 40, bottom: 60, containLabel: true },
  }
}

// ─── 主入口函数 ──────────────────────────────────────────────────────────────

/**
 * 将后端 ChartPayload 转换为 ECharts option。
 *
 * @param payload  - 后端返回的图表数据
 * @param config   - 用户在前端选择的图表参数
 * @returns        EChartsOption 对象（可直接传给 <VChart :option="..." />）
 */
export function buildChartOption(
  payload: ChartPayload,
  config: ChartConfig
): EChartsOption {
  const { chartType, xCol, yCol, colorCol, title } = config
  const rows = payload.rows

  switch (chartType) {
    case 'pie_chart':
      return buildPieOption(rows, xCol, yCol, title)
    case 'scatter_chart':
      return buildScatterOption(rows, xCol, yCol, colorCol, title)
    case 'heatmap_chart':
      return buildHeatmapOption(rows, xCol, yCol, colorCol, title)
    case 'boxplot_chart':
      return buildBoxplotOption(rows, xCol, yCol, title)
    case 'area_chart':
      return buildLineOption(rows, xCol, yCol, colorCol, title, true)
    case 'density_chart':
      return buildLineOption(rows, xCol, yCol, colorCol, title, true, true)
    case 'line_chart':
      return buildLineOption(rows, xCol, yCol, colorCol, title, false)
    case 'bar_chart':
    case 'histogram_chart':
    default:
      return buildBarOption(rows, xCol, yCol, colorCol, title)
  }
}

// ─── 柱状图 ──────────────────────────────────────────────────────────────────

function buildBarOption(
  rows: ChartPayload['rows'],
  xCol: string,
  yCol: string,
  colorCol?: string,
  title?: string
): EChartsOption {
  const base = baseOption(title)

  if (colorCol) {
    // 按 colorCol 分组，生成多系列
    const groups = Array.from(new Set(rows.map((r) => String(r[colorCol] ?? ''))))
    const xValues = Array.from(new Set(rows.map((r) => String(r[xCol] ?? ''))))
    const series = groups.map((g) => ({
      name: g,
      type: 'bar' as const,
      data: xValues.map((x) => {
        const row = rows.find((r) => String(r[xCol]) === x && String(r[colorCol]) === g)
        return row ? (row[yCol] ?? 0) : 0
      }),
    }))
    return { ...base, xAxis: { type: 'category', data: xValues }, yAxis: { type: 'value' }, series }
  }

  return {
    ...base,
    xAxis: { type: 'category', data: rows.map((r) => String(r[xCol] ?? '')) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: rows.map((r) => r[yCol] ?? 0) }],
  }
}

// ─── 折线图 / 面积图 / 密度图 ─────────────────────────────────────────────────

function buildLineOption(
  rows: ChartPayload['rows'],
  xCol: string,
  yCol: string,
  colorCol?: string,
  title?: string,
  showArea = false,
  smooth = false
): EChartsOption {
  const base = baseOption(title)
  const areaStyle = showArea ? {} : undefined

  if (colorCol) {
    const groups = Array.from(new Set(rows.map((r) => String(r[colorCol] ?? ''))))
    const xValues = Array.from(new Set(rows.map((r) => String(r[xCol] ?? ''))))
    const series = groups.map((g) => ({
      name: g,
      type: 'line' as const,
      smooth,
      areaStyle,
      data: xValues.map((x) => {
        const row = rows.find((r) => String(r[xCol]) === x && String(r[colorCol]) === g)
        return row ? (row[yCol] ?? null) : null
      }),
    }))
    return { ...base, xAxis: { type: 'category', data: xValues }, yAxis: { type: 'value' }, series }
  }

  return {
    ...base,
    xAxis: { type: 'category', data: rows.map((r) => String(r[xCol] ?? '')) },
    yAxis: { type: 'value' },
    series: [{ type: 'line', smooth, areaStyle, data: rows.map((r) => r[yCol] ?? 0) }],
  }
}

// ─── 散点图 ──────────────────────────────────────────────────────────────────

function buildScatterOption(
  rows: ChartPayload['rows'],
  xCol: string,
  yCol: string,
  colorCol?: string,
  title?: string
): EChartsOption {
  const base = baseOption(title)

  if (colorCol) {
    const groups = Array.from(new Set(rows.map((r) => String(r[colorCol] ?? ''))))
    const series = groups.map((g) => ({
      name: g,
      type: 'scatter' as const,
      data: rows
        .filter((r) => String(r[colorCol]) === g)
        .map((r) => [r[xCol] ?? 0, r[yCol] ?? 0]),
    }))
    return { ...base, xAxis: { type: 'value' }, yAxis: { type: 'value' }, series }
  }

  return {
    ...base,
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: [{ type: 'scatter', data: rows.map((r) => [r[xCol] ?? 0, r[yCol] ?? 0]) }],
  }
}

// ─── 饼图 ────────────────────────────────────────────────────────────────────

function buildPieOption(
  rows: ChartPayload['rows'],
  xCol: string,
  yCol: string,
  title?: string
): EChartsOption {
  return {
    ...baseOption(title),
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['35%', '65%'],
        data: rows.map((r) => ({
          name: String(r[xCol] ?? ''),
          value: Number(r[yCol] ?? 0),
        })),
        emphasis: { itemStyle: { shadowBlur: 10 } },
      },
    ],
  }
}

// ─── 热力图 ──────────────────────────────────────────────────────────────────

function buildHeatmapOption(
  rows: ChartPayload['rows'],
  xCol: string,
  yCol: string,
  valueCol?: string,
  title?: string
): EChartsOption {
  const xValues = Array.from(new Set(rows.map((r) => String(r[xCol] ?? ''))))
  const yValues = Array.from(new Set(rows.map((r) => String(r[yCol] ?? ''))))
  const vCol = valueCol ?? yCol

  const data = rows.map((r) => [
    xValues.indexOf(String(r[xCol] ?? '')),
    yValues.indexOf(String(r[yCol] ?? '')),
    r[vCol] ?? 0,
  ])

  return {
    ...baseOption(title),
    tooltip: { position: 'top' },
    xAxis: { type: 'category', data: xValues },
    yAxis: { type: 'category', data: yValues },
    visualMap: { min: 0, max: Math.max(...rows.map((r) => Number(r[vCol] ?? 0))), calculable: true },
    series: [{ type: 'heatmap', data, label: { show: true } }],
  }
}

// ─── 箱线图 ──────────────────────────────────────────────────────────────────

function buildBoxplotOption(
  rows: ChartPayload['rows'],
  xCol: string,
  yCol: string,
  title?: string
): EChartsOption {
  // Group data by xCol and compute box statistics per group
  const groups = Array.from(new Set(rows.map((r) => String(r[xCol] ?? ''))))
  const boxData = groups.map((g) => {
    const vals = rows
      .filter((r) => String(r[xCol]) === g)
      .map((r) => Number(r[yCol] ?? 0))
      .sort((a, b) => a - b)
    if (vals.length === 0) return [0, 0, 0, 0, 0]
    const q1 = vals[Math.floor(vals.length * 0.25)]
    const q2 = vals[Math.floor(vals.length * 0.5)]
    const q3 = vals[Math.floor(vals.length * 0.75)]
    return [vals[0], q1, q2, q3, vals[vals.length - 1]]
  })

  return {
    ...baseOption(title),
    xAxis: { type: 'category', data: groups },
    yAxis: { type: 'value' },
    series: [{ type: 'boxplot', data: boxData }],
  }
}
