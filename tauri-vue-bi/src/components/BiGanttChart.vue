<script setup lang="ts">
// src/components/BiGanttChart.vue
// 封装的高级甘特图组件 (Advanced Gantt Chart Component)
//
// 使用 ECharts `custom` series 实现甘特图（横道图），支持：
//   • 任务条 (task bar) 的渲染与 tooltip
//   • 里程碑菱形标记
//   • 颜色分组（按 project/phase 等字段）
//   • Project 汇总图（可选）
//   • 数据缩放（DataZoom）
//
// 数据格式（从 Tauri 后端 fetch_gantt_data 命令返回）：
//   rows: Array<{ [taskCol]: string, [startCol]: string, [endCol]: string, [colorCol]?: string }>

import { computed, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import BiChart from './BiChart.vue'

// ─── Props ───────────────────────────────────────────────────────────────────

interface GanttRow {
  [key: string]: string | number | null
}

interface Props {
  /** 原始数据行 */
  rows: GanttRow[]
  /** 任务名称列 */
  taskCol: string
  /** 开始日期列 */
  startCol: string
  /** 结束日期列 */
  endCol: string
  /** 颜色分组列（可选） */
  colorCol?: string
  /** 里程碑列（可选） */
  milestoneCol?: string
  /** 是否显示加载状态 */
  loading?: boolean
  /** 图表高度 */
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  height: '480px',
})

// ─── 颜色调色板 ───────────────────────────────────────────────────────────────
const PALETTE = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666',
  '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc',
]

// ─── 计算 ECharts option ──────────────────────────────────────────────────────
const chartOption = computed<EChartsOption | null>(() => {
  if (!props.rows || props.rows.length === 0) return null

  // 提取任务列表（Y 轴分类）
  const tasks: string[] = Array.from(
    new Set(props.rows.map((r) => String(r[props.taskCol] ?? '')))
  )

  // 颜色分组映射
  const colorGroups: string[] = props.colorCol
    ? Array.from(new Set(props.rows.map((r) => String(r[props.colorCol!] ?? ''))))
    : []
  const colorMap = Object.fromEntries(
    colorGroups.map((g, i) => [g, PALETTE[i % PALETTE.length]])
  )

  // 构建 custom series data
  const barData = props.rows.map((row) => {
    const task = String(row[props.taskCol] ?? '')
    const start = new Date(String(row[props.startCol] ?? '')).getTime()
    const end = new Date(String(row[props.endCol] ?? '')).getTime()
    const group = props.colorCol ? String(row[props.colorCol] ?? '') : ''
    const color = group ? colorMap[group] : PALETTE[0]

    return {
      name: task,
      value: [tasks.indexOf(task), start, end, task, group],
      itemStyle: { color },
    }
  })

  // 里程碑 scatter data
  const milestoneData = props.milestoneCol
    ? props.rows
        .filter((r) => r[props.milestoneCol!] != null && String(r[props.milestoneCol!]).trim() !== '')
        .map((r) => {
          const task = String(r[props.taskCol] ?? '')
          const date = new Date(String(r[props.startCol] ?? '')).getTime()
          return {
            name: String(r[props.milestoneCol!]),
            value: [tasks.indexOf(task), date],
            symbol: 'diamond',
            symbolSize: 14,
            itemStyle: { color: '#ffd700' },
          }
        })
    : []

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (params: any) => {
        const v = params.value
        const start = new Date(v[1]).toLocaleDateString('zh-CN')
        const end = new Date(v[2]).toLocaleDateString('zh-CN')
        return `<b>${v[3]}</b><br/>开始: ${start}<br/>结束: ${end}${v[4] ? '<br/>分组: ' + v[4] : ''}`
      },
    },
    grid: { left: 160, right: 60, top: 20, bottom: 60 },
    xAxis: {
      type: 'time',
      axisLabel: { formatter: '{yyyy}-{MM}-{dd}' },
    },
    yAxis: {
      type: 'category',
      data: tasks,
      axisLabel: {
        width: 140,
        overflow: 'truncate',
      },
    },
    dataZoom: [
      { type: 'slider', xAxisIndex: 0, bottom: 10 },
      { type: 'inside', xAxisIndex: 0 },
    ],
    series: [
      {
        type: 'custom',
        renderItem: (_params: any, api: any) => {
          const categoryIndex = api.value(0)
          const start = api.coord([api.value(1), categoryIndex])
          const end = api.coord([api.value(2), categoryIndex])
          const height = api.size([0, 1])[1] * 0.6
          return {
            type: 'rect',
            shape: {
              x: start[0],
              y: start[1] - height / 2,
              width: Math.max(end[0] - start[0], 2),
              height,
            },
            style: api.style(),
          }
        },
        encode: { x: [1, 2], y: 0 },
        data: barData,
      },
      // 里程碑 scatter 系列（仅在有数据时添加）
      ...(milestoneData.length > 0
        ? [
            {
              type: 'scatter' as const,
              data: milestoneData,
              encode: { x: 1, y: 0 },
              tooltip: {
                formatter: (p: any) => `🏁 里程碑: <b>${p.name}</b>`,
              },
            },
          ]
        : []),
    ],
  }

  return option
})
</script>

<template>
  <BiChart
    :option="chartOption"
    :loading="props.loading"
    :height="props.height"
    theme="dark"
  />
</template>
