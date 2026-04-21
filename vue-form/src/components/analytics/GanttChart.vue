<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts/core'
import { CustomChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, GridComponent,
  LegendComponent, DataZoomComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  CustomChart,
  TitleComponent, TooltipComponent, GridComponent,
  LegendComponent, DataZoomComponent,
  CanvasRenderer
])

export interface GanttTask {
  taskName: string
  project: string
  colorGroup: string
  startISO: string
  endISO: string
  planStartISO: string
  planEndISO: string
  durationDays: number
  description: string
  milestoneName: string
  milestoneISO: string
  owner: string
}

export interface GanttStats {
  taskCount: number
  avgDurationDays: number
  totalDurationDay: number
  maxDurationDay: number
  planTotalDurationDay: number
  hasPlanTotalDuration: boolean
}

const props = defineProps<{
  tasks: GanttTask[]
  stats: GanttStats
}>()

const chartEl = ref<HTMLDivElement>()
let instance: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

// Build a stable colour palette keyed by project/colorGroup
const PALETTE = [
  '#1677ff','#52c41a','#fa8c16','#eb2f96','#13c2c2',
  '#722ed1','#faad14','#2f54eb','#f5222d','#08979c',
]
function colourFor(label: string, index: number) {
  // deterministic: hash the label
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]!
}

function buildOption(tasks: GanttTask[]): Record<string, any> {
  if (!tasks.length) return {}

  // Y-axis: task labels (reversed so first task is on top)
  const yLabels = tasks.map(t => t.taskName || '(无名)')

  // Collect groups for legend
  const groups = Array.from(new Set(tasks.map(t => t.project || t.colorGroup || '其他')))
  const groupColour: Record<string, string> = {}
  groups.forEach((g, i) => { groupColour[g] = colourFor(g, i) })

  // Build custom series data: [yIndex, start, end, group, task]
  const barData: any[] = []
  const planData: any[] = []
  const milestoneData: any[] = []

  tasks.forEach((t, i) => {
    if (!t.startISO || !t.endISO) return
    const group = t.project || t.colorGroup || '其他'
    const colour = groupColour[group]
    barData.push({
      value: [i, t.startISO, t.endISO, group],
      itemStyle: { color: colour, opacity: 0.9 }
    })
    if (t.planStartISO && t.planEndISO) {
      planData.push({
        value: [i, t.planStartISO, t.planEndISO, group],
        itemStyle: { color: colour, opacity: 0.3, borderType: 'dashed', borderColor: colour, borderWidth: 1 }
      })
    }
    if (t.milestoneISO) {
      milestoneData.push({ value: [i, t.milestoneISO], name: t.milestoneName || '里程碑' })
    }
  })

  const BAR_HEIGHT = 16
  const ROW_HEIGHT = 36

  const renderGanttBar = (params: any, api: any) => {
    const yIndex = api.value(0)
    const startTime = api.coord([api.value(1), yIndex])
    const endTime = api.coord([api.value(2), yIndex])
    const height = BAR_HEIGHT
    return {
      type: 'rect',
      shape: {
        x: startTime[0],
        y: startTime[1] - height / 2,
        width: Math.max(endTime[0] - startTime[0], 2),
        height
      },
      style: api.style(),
      emphasis: { style: { shadowBlur: 4, shadowColor: 'rgba(0,0,0,0.3)' } },
      focus: 'self'
    }
  }

  const renderMilestone = (params: any, api: any) => {
    const yIndex = api.value(0)
    const pos = api.coord([api.value(1), yIndex])
    const size = 10
    return {
      type: 'polygon',
      shape: {
        points: [
          [pos[0], pos[1] - size],
          [pos[0] + size, pos[1]],
          [pos[0], pos[1] + size],
          [pos[0] - size, pos[1]]
        ]
      },
      style: { fill: '#f5222d', opacity: 0.9 },
      focus: 'self'
    }
  }

  const series: any[] = [
    {
      type: 'custom',
      name: '实际',
      renderItem: renderGanttBar,
      encode: { x: [1, 2], y: 0 },
      data: barData,
      tooltip: {
        formatter: (p: any) => {
          const t = tasks[p.value[0] as number]
          if (!t) return ''
          return [
            `<b>${t.taskName}</b>`,
            `项目：${t.project || '-'}`,
            `开始：${t.startISO?.slice(0, 10)}`,
            `结束：${t.endISO?.slice(0, 10)}`,
            `工期：${t.durationDays} 天`,
            t.owner ? `负责人：${t.owner}` : '',
            t.description ? `备注：${t.description}` : ''
          ].filter(Boolean).join('<br/>')
        }
      }
    }
  ]

  if (planData.length) {
    series.push({
      type: 'custom',
      name: '计划',
      renderItem: renderGanttBar,
      encode: { x: [1, 2], y: 0 },
      data: planData,
      tooltip: { formatter: (p: any) => {
        const t = tasks[p.value[0] as number]
        if (!t) return ''
        return `<b>${t.taskName}</b><br/>计划：${t.planStartISO?.slice(0,10)} → ${t.planEndISO?.slice(0,10)}`
      }}
    })
  }

  if (milestoneData.length) {
    series.push({
      type: 'custom',
      name: '里程碑',
      renderItem: renderMilestone,
      encode: { x: 1, y: 0 },
      data: milestoneData,
      tooltip: { formatter: (p: any) => `<b>${p.name}</b><br/>${tasks[p.value[0] as number]?.milestoneISO?.slice(0,10) ?? ''}` }
    })
  }

  return {
    tooltip: { trigger: 'item' },
    legend: groups.length > 1 ? {
      data: groups,
      bottom: 0,
      type: 'scroll'
    } : undefined,
    grid: { left: 120, right: 30, top: 40, bottom: groups.length > 1 ? 44 : 20 },
    xAxis: {
      type: 'time',
      splitLine: { show: true, lineStyle: { type: 'dashed', color: '#eee' } }
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      inverse: true,
      axisLabel: {
        width: 110,
        overflow: 'truncate'
      }
    },
    dataZoom: [
      { type: 'slider', xAxisIndex: 0, bottom: groups.length > 1 ? 48 : 4, height: 18 }
    ],
    series
  }
}

const chartOption = computed(() => buildOption(props.tasks))

function exportPNG() {
  if (!instance) return
  const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const a = document.createElement('a')
  a.href = url
  a.download = 'gantt.png'
  a.click()
}

function exportJSON() {
  const json = JSON.stringify(chartOption.value, null, 2)
  navigator.clipboard.writeText(json).catch(() => {
    const ta = document.createElement('textarea')
    ta.value = json
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  })
}

function enterFullscreen() {
  const el = chartEl.value?.closest?.('.gantt-chart-wrap') as HTMLElement | null ?? chartEl.value
  if (el?.requestFullscreen) el.requestFullscreen()
}

defineExpose({ exportPNG, exportJSON, enterFullscreen })

onMounted(() => {
  if (!chartEl.value) return
  instance = echarts.init(chartEl.value)
  instance.setOption(chartOption.value)
  ro = new ResizeObserver(() => instance?.resize())
  ro.observe(chartEl.value)
})

onUnmounted(() => {
  ro?.disconnect()
  instance?.dispose()
  instance = null
})

watch(chartOption, (opt) => {
  if (instance) instance.setOption(opt, true)
})
</script>

<template>
  <div class="gantt-chart-wrap">
    <div ref="chartEl" class="gantt-el" />

    <div class="gantt-stats" v-if="stats">
      <span class="stat-item">任务数：<b>{{ stats.taskCount }}</b></span>
      <span class="stat-item">平均工期：<b>{{ stats.avgDurationDays.toFixed(1) }} 天</b></span>
      <span class="stat-item">最长工期：<b>{{ stats.maxDurationDay }} 天</b></span>
      <span v-if="stats.hasPlanTotalDuration" class="stat-item">
        计划总工期：<b>{{ stats.planTotalDurationDay }} 天</b>
      </span>
    </div>
  </div>
</template>

<style scoped>
.gantt-chart-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 420px;
}
.gantt-el {
  flex: 1;
  width: 100%;
  min-height: 380px;
}
.gantt-stats {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-top: 1px solid #eee;
  background: #fafafa;
  font-size: 13px;
  color: #555;
}
.stat-item b {
  color: #1677ff;
}
</style>
