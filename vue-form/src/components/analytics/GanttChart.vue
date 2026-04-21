<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts/core'
import { CustomChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, GridComponent,
  LegendComponent, DataZoomComponent,
  ToolboxComponent, MarkLineComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import 'echarts/theme/dark'
import 'echarts/theme/vintage'
import 'echarts/theme/macarons'
import 'echarts/theme/shine'
import 'echarts/theme/roma'
import 'echarts/theme/infographic'
import { getThemeProfile, getEchartsRuntimeThemeName } from '@/utils/echartsTheme'

echarts.use([
  CustomChart, LineChart, ScatterChart,
  TitleComponent, TooltipComponent, GridComponent,
  LegendComponent, DataZoomComponent,
  ToolboxComponent, MarkLineComponent,
  CanvasRenderer,
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

export interface GanttOptions {
  showTaskDetails?: boolean
  showDuration?: boolean
  sortByStart?: boolean
  autoNumber?: boolean
  darkTheme?: boolean
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
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
  theme?: string
  options?: GanttOptions
}>()

const chartEl = ref<HTMLDivElement>()
let instance: echarts.ECharts | null = null
let ro: ResizeObserver | null = null
let appliedTheme: string | undefined

const DAY_MS = 24 * 3600 * 1000
const NOW_TS = Date.now()

// ── time helpers ──────────────────────────────────────────────
function floorToDay(ts: number) { const d = new Date(ts); return +new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function ceilToDay(ts: number) { const d = new Date(ts); return +new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) }
function floorToWeek(ts: number) { const d = new Date(floorToDay(ts)); const day = d.getDay(); return d.setDate(d.getDate() - day), +d }
function ceilToWeek(ts: number) { const d = new Date(floorToDay(ts)); const day = d.getDay(); return d.setDate(d.getDate() + (day === 0 ? 0 : 7 - day)), +d }
function floorToMonth(ts: number) { const d = new Date(ts); return +new Date(d.getFullYear(), d.getMonth(), 1) }
function ceilToMonth(ts: number) { const d = new Date(ts); return +new Date(d.getFullYear(), d.getMonth() + 1, 1) }
function floorToQuarter(ts: number) { const d = new Date(ts); const q = Math.floor(d.getMonth() / 3); return +new Date(d.getFullYear(), q * 3, 1) }
function ceilToQuarter(ts: number) { const d = new Date(ts); const q = Math.floor(d.getMonth() / 3); return +new Date(d.getFullYear(), (q + 1) * 3, 1) }
function floorToYear(ts: number) { return +new Date(new Date(ts).getFullYear(), 0, 1) }
function ceilToYear(ts: number) { return +new Date(new Date(ts).getFullYear() + 1, 0, 1) }

function floorTo(ts: number, gran: string) {
  switch (gran) {
    case 'day': return floorToDay(ts)
    case 'week': return floorToWeek(ts)
    case 'quarter': return floorToQuarter(ts)
    case 'year': return floorToYear(ts)
    default: return floorToMonth(ts)
  }
}
function ceilTo(ts: number, gran: string) {
  switch (gran) {
    case 'day': return ceilToDay(ts)
    case 'week': return ceilToWeek(ts)
    case 'quarter': return ceilToQuarter(ts)
    case 'year': return ceilToYear(ts)
    default: return ceilToMonth(ts)
  }
}
function minIntervalFor(gran: string) {
  switch (gran) {
    case 'day': return DAY_MS
    case 'week': return 7 * DAY_MS
    case 'quarter': return 89 * DAY_MS
    case 'year': return 365 * DAY_MS
    default: return 28 * DAY_MS
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function isoWeekNo(d: Date) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
  return Math.ceil((((dt.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7)
}

function formatTimelineLabel(ts: number, gran: string) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  if (gran === 'day') return `${m}-${day}`
  if (gran === 'month') return `${y}-${m}`
  if (gran === 'week') return `${y}-W${pad2(isoWeekNo(d))}`
  if (gran === 'quarter') return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`
  if (gran === 'year') return String(y)
  return `${y}-${m}`
}

function buildGanttDataViewTable(rows: any[]): string {
  const esc = (v: any) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const style = `
    <style>
      .dv-wrap{padding:12px 16px;font-family:sans-serif;font-size:13px;color:#1a1a2e}
      .dv-table{border-collapse:collapse;width:100%;min-width:640px}
      .dv-table th{background:#eef3ff;color:#334155;font-weight:600;padding:7px 10px;border:1px solid #cfd8ea;text-align:left;white-space:nowrap}
      .dv-table td{padding:6px 10px;border:1px solid #d9e2f2;vertical-align:top;background:#ffffff}
      .dv-table tr:nth-child(even) td{background:#f7faff}
      .dv-table tr:hover td{background:#eaf1ff}
    </style>`
  const fmt = (ts: any) => {
    const n = Number(ts)
    if (!Number.isFinite(n)) return ''
    return new Date(n).toLocaleDateString()
  }

  const body = rows
    .filter(r => r.rowType === 'task')
    .map(r => `<tr><td>${esc(r.project)}</td><td>${esc(r.task)}</td><td>${esc(fmt(r.start))}</td><td>${esc(fmt(r.end))}</td><td>${esc(r.duration)}</td><td>${esc(r.description || '')}</td></tr>`)
    .join('')

  return `${style}<div class="dv-wrap"><table class="dv-table"><thead><tr><th>项目</th><th>任务</th><th>开始</th><th>结束</th><th>周期(天)</th><th>描述</th></tr></thead><tbody>${body}</tbody></table></div>`
}

// ── bar geometry helpers (matches reference) ──────────────────
function barHeightForRow(rowType: string) {
  return rowType === 'project' ? 36 : 24
}
function visualBarHeight(laneHeight: number, preferred: number) {
  const fallback = laneHeight * 0.7
  return Math.min(preferred || fallback, laneHeight * 0.92)
}
function barRadiusForRow(rowType: string) {
  return rowType === 'project' ? 6 : 4
}
function readableTextColor(bgHex: string, isDark: boolean) {
  if (typeof bgHex !== 'string') return isDark ? '#f8fafc' : '#0f172a'
  const hex = bgHex.replace('#', '').trim()
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if (Number.isNaN(r)) return isDark ? '#f8fafc' : '#0f172a'
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return isDark ? (luminance < 145 ? '#f8fafc' : '#0f172a') : (luminance < 150 ? '#f8fafc' : '#0f172a')
}
function planStrokeTheme(isDark: boolean) {
  return isDark
    ? { outer: 'rgba(248,250,252,0.25)', inner: '#dbe7f3' }
    : { outer: 'rgba(51,65,85,0.20)', inner: '#5b6f8a' }
}
function progressForRange(startTs: number, endTs: number) {
  const total = Math.max(1, endTs - startTs)
  const passed = Math.min(Math.max(NOW_TS - startTs, 0), total)
  return passed / total
}

// ── hierarchical row builder (matches reference) ──────────────
function buildHierRows(tasks: GanttTask[], opts?: GanttOptions) {
  const grouped: Record<string, { items: GanttTask[]; minStart: number; maxEnd: number }> = {}
  tasks.forEach(t => {
    const p = t.project || '未分组'
    if (!grouped[p]) grouped[p] = { items: [], minStart: Infinity, maxEnd: -Infinity }
    grouped[p].items.push(t)
    const s = +new Date(t.startISO)
    const e = +new Date(t.endISO)
    grouped[p].minStart = Math.min(grouped[p].minStart, s)
    grouped[p].maxEnd = Math.max(grouped[p].maxEnd, e)
  })

  const projectOrder = Object.keys(grouped).sort((a, b) => {
    const ga = grouped[a]!, gb = grouped[b]!
    if (ga.minStart !== gb.minStart) return ga.minStart - gb.minStart
    return a.localeCompare(b, 'zh-CN')
  })

  const rows: any[] = []
  projectOrder.forEach(project => {
    const grp = grouped[project]!
    const sortByStart = opts?.sortByStart !== false
    const list = grp.items.slice().sort((a, b) => {
      if (sortByStart) {
        const sa = +new Date(a.startISO), sb = +new Date(b.startISO)
        if (sa !== sb) return sa - sb
      }
      return (a.taskName || '').localeCompare(b.taskName || '', 'zh-CN')
    })
    const { minStart, maxEnd } = grp
    const owner = (list.find(x => x.owner) || {}).owner || ''
    rows.push({
      rowLabel: project,
      rowType: 'project',
      start: minStart,
      end: maxEnd,
      project,
      colorGroup: (list[0]?.colorGroup) || project,
      task: project,
      duration: Math.round((maxEnd - minStart) / DAY_MS) + 1,
      description: owner,
      progress: progressForRange(minStart, maxEnd)
    })
    let taskNum = 0
    list.forEach(t => {
      taskNum++
      const numPrefix = opts?.autoNumber ? String(taskNum).padStart(2, '0') + '  ' : '  '
      rows.push({
        rowLabel: numPrefix + t.taskName,
        rowType: 'task',
        start: +new Date(t.startISO),
        end: +new Date(t.endISO),
        project: t.project,
        colorGroup: t.colorGroup || t.project,
        task: t.taskName,
        duration: t.durationDays,
        description: t.description || '',
        progress: progressForRange(+new Date(t.startISO), +new Date(t.endISO)),
        planStart: t.planStartISO ? +new Date(t.planStartISO) : null,
        planEnd: t.planEndISO ? +new Date(t.planEndISO) : null,
        milestoneName: t.milestoneName || '',
        milestone: t.milestoneISO ? +new Date(t.milestoneISO) : null
      })
    })
  })
  return rows
}

function buildOption(tasks: GanttTask[], themeName?: string, opts?: GanttOptions): Record<string, any> {
  if (!tasks.length) return {}

  const profile = getThemeProfile(themeName)
  const dark = opts?.darkTheme !== undefined ? opts.darkTheme : profile.isDark
  const palette = profile.palette

  const canvasBg = dark ? '#10213b' : (profile.backgroundColor || '#ffffff')
  const milestoneColor = palette[Math.max(0, palette.length - 1)] || '#c62828'

  const surfaceTheme = {
    panelBg: dark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.98)',
    panelBorder: dark ? 'rgba(148,163,184,0.30)' : profile.splitLineColor,
    panelText: dark ? '#e2e8f0' : profile.textColor,
    panelShadow: dark ? '0 14px 28px rgba(2,8,23,0.34)' : '0 12px 24px rgba(15,23,42,0.16)',
    toolHintBg: dark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.94)',
    toolHintText: dark ? '#e2e8f0' : profile.textColor,
  }

  const gran = opts?.granularity || 'month'
  const rows = buildHierRows(tasks, opts)

  const groups = [...new Set(tasks.map(t => t.colorGroup || t.project || '未分组'))]
  const colorMap: Record<string, string> = {}
  groups.forEach((g, i) => { colorMap[g] = palette[i % palette.length] ?? '#1677ff' })

  // axis range
  const minTime = Math.min(...rows.map(r => r.start))
  const maxTime = Math.max(...rows.map(r => r.end))
  const axisMin = floorTo(minTime, gran)
  const axisMax = ceilTo(maxTime, gran)

  const yAxisData = rows.map(r => r.rowLabel)

  // series data arrays
  const barData = rows.map((r, idx) => ({
    value: [idx, r.start, r.end, colorMap[r.colorGroup] || '#1976d2', r.project, r.task,
            barHeightForRow(r.rowType), r.duration, r.description, r.progress || 0, r.rowType],
    rowType: r.rowType
  }))

  const planData = rows
    .map((r, idx) => ({ idx, start: r.planStart, end: r.planEnd, task: r.task, rowType: r.rowType }))
    .filter(r => r.start && r.end)
    .map(r => ({ value: [r.idx, r.start, r.end, barHeightForRow(r.rowType), r.rowType], task: r.task }))

  const milestoneData = rows
    .map((r, idx) => ({ idx, date: r.milestone, name: r.milestoneName, task: r.task }))
    .filter(m => m.date && m.name)
    .map(m => ({ name: m.name, value: [m.date, m.idx], task: m.task }))

  // ── renderItem: main bars ─────────────────────────────────
  const barRender = (params: any, api: any) => {
    const y = api.value(0)
    const s = api.coord([api.value(1), y])
    const e = api.coord([api.value(2), y])
    const laneHeight = api.size([0, 1])[1]
    const preferred = api.value(6)
    const h = visualBarHeight(laneHeight, preferred)
    const rect = echarts.graphic.clipRectByRect(
      { x: s[0], y: s[1] - h / 2, width: e[0] - s[0], height: h },
      { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
    )
    if (!rect) return null

    const progress = Math.max(0, Math.min(1, Number(api.value(9)) || 0))
    const rowType = api.value(10)
    const radius = barRadiusForRow(rowType)
    const detail = api.value(8) || ''
    const progressWidth = Math.max(2, rect.width * progress)
    const barFill = api.value(3)
    const textColor = readableTextColor(barFill, dark)

    const children: any[] = [
      {
        type: 'rect',
        shape: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, r: radius },
        style: api.style({ fill: barFill, opacity: rowType === 'project' ? 0.95 : 0.86 })
      },
      {
        type: 'rect',
        shape: { x: rect.x, y: rect.y, width: progressWidth, height: rect.height, r: radius },
        style: { fill: dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.32)' }
      }
    ]

    const showDetail = opts?.showTaskDetails !== false
    if (showDetail && rowType === 'task' && detail && rect.width > 36) {
      children.push({
        type: 'text',
        style: {
          x: rect.x + 6, y: rect.y + rect.height / 2,
          text: detail, width: Math.max(24, rect.width - 12), overflow: 'truncate',
          fill: textColor, fontSize: 12, fontWeight: 600,
          textVerticalAlign: 'middle', textAlign: 'left'
        },
        silent: true
      })
    }
    return { type: 'group', children }
  }

  // ── renderItem: plan baseline ─────────────────────────────
  const planRender = (params: any, api: any) => {
    const y = api.value(0)
    const s = api.coord([api.value(1), y])
    const e = api.coord([api.value(2), y])
    const laneHeight = api.size([0, 1])[1]
    const rowType = api.value(4)
    const h = visualBarHeight(laneHeight, api.value(3))
    const radius = barRadiusForRow(rowType)
    const rect = echarts.graphic.clipRectByRect(
      { x: s[0], y: s[1] - h / 2, width: e[0] - s[0], height: h },
      { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
    )
    if (!rect) return null

    const strokeTheme = planStrokeTheme(dark)
    const outerLineWidth = 3
    const innerLineWidth = 1.5
    const dashPattern = rowType === 'project' ? [7, 4] : [4, 3]
    const inset = outerLineWidth / 2
    const insetRect = {
      x: rect.x + inset, y: rect.y + inset,
      width: Math.max(1, rect.width - outerLineWidth),
      height: Math.max(1, rect.height - outerLineWidth)
    }
    return {
      type: 'group',
      children: [
        {
          type: 'rect',
          shape: { ...insetRect, r: radius },
          style: { fill: 'transparent', stroke: strokeTheme.outer, lineWidth: outerLineWidth, opacity: rowType === 'project' ? 0.62 : 1 },
          silent: true
        },
        {
          type: 'rect',
          shape: { ...insetRect, r: radius },
          style: { fill: 'transparent', stroke: strokeTheme.inner, lineDash: dashPattern, lineWidth: innerLineWidth, opacity: rowType === 'project' ? 0.74 : 1 },
          silent: true
        }
      ]
    }
  }

  // ── tooltip formatter ─────────────────────────────────────
  const tooltipFormatter = (params: any) => {
    const p = Array.isArray(params) ? params.find((x: any) => x.seriesName !== '任务详情') : params
    if (!p) return ''
    if (p.seriesName === '里程碑') {
      return `${p.name}<br/>任务: ${p.data.task}<br/>日期: ${new Date(p.value[0]).toLocaleDateString()}`
    }
    if (p.seriesName === '计划基准线') {
      return `任务: ${p.data.task}<br/>计划开始: ${new Date(p.value[1]).toLocaleDateString()}<br/>计划结束: ${new Date(p.value[2]).toLocaleDateString()}`
    }
    const v = p.value
    const showDur = opts?.showDuration !== false
    return `${v[5]}<br/>项目: ${v[4]}<br/>开始: ${new Date(v[1]).toLocaleDateString()}<br/>结束: ${new Date(v[2]).toLocaleDateString()}${showDur ? '<br/>周期(天): ' + v[7] : ''}${v[8] ? '<br/>' + v[8] : ''}`
  }

  const series: any[] = [
    {
      name: '任务',
      type: 'custom',
      renderItem: barRender,
      encode: { x: [1, 2], y: 0 },
      data: barData,
      itemStyle: { opacity: 0.9 }
    }
  ]

  if (planData.length) {
    series.push({
      name: '计划基准线',
      type: 'custom',
      renderItem: planRender,
      encode: { x: [1, 2], y: 0 },
      data: planData,
      z: 8
    })
  }

  if (milestoneData.length) {
    series.push({
      name: '里程碑',
      type: 'scatter',
      data: milestoneData,
      symbol: 'diamond',
      symbolSize: 11,
      itemStyle: { color: milestoneColor },
      z: 10
    })
  }

  series.push({
    name: '今天',
    type: 'line',
    markLine: {
      symbol: ['none', 'none'],
      label: {
        show: true, formatter: 'Today',
        color: dark ? '#fecaca' : '#b91c1c',
        backgroundColor: dark ? 'rgba(127,29,29,0.18)' : 'rgba(254,202,202,0.7)',
        padding: [2, 6], borderRadius: 8
      },
      lineStyle: { color: dark ? '#ef4444' : '#dc2626', type: 'dashed', width: 1.2 },
      data: [{ xAxis: NOW_TS }]
    },
    data: []
  })

  return {
    animationDuration: 700,
    color: palette,
    backgroundColor: canvasBg,
    grid: { left: 10, right: 20, top: 44, bottom: 80, containLabel: true },
    toolbox: {
      show: true, right: 14, top: 6, itemSize: 16, itemGap: 12,
      iconStyle: {
        color: 'none',
        borderColor: dark ? '#94a3b8' : profile.toolboxColor,
        borderWidth: 1.5
      },
      emphasis: {
        iconStyle: {
          color: dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.06)',
          borderColor: dark ? '#e2e8f0' : profile.toolboxEmphasisColor,
          borderWidth: 2,
          textFill: surfaceTheme.toolHintText,
          textBackgroundColor: surfaceTheme.toolHintBg,
          textBorderRadius: 8, textPadding: [5, 8],
          textBorderColor: surfaceTheme.panelBorder, textBorderWidth: 1
        }
      },
      feature: {
        dataZoom: { yAxisIndex: 'none', title: { zoom: '区域缩放', back: '缩放还原' } },
        restore: { title: '还原' },
        dataView: {
          title: '数据视图',
          lang: ['数据视图', '关闭', '刷新'],
          readOnly: true,
          optionToContent: () => buildGanttDataViewTable(rows),
        },
        saveAsImage: { title: '下载 PNG', name: 'gantt', pixelRatio: 2, backgroundColor: canvasBg }
      }
    },
    xAxis: {
      type: 'time',
      min: axisMin,
      max: axisMax,
      minInterval: minIntervalFor(gran),
      axisLabel: {
        formatter: (v: number) => formatTimelineLabel(v, gran),
        color: dark ? '#d8e0ea' : profile.axisLabelColor,
        showMinLabel: true, showMaxLabel: true,
        hideOverlap: true, margin: 14
      },
      axisTick: { show: true },
      axisLine: { show: true, lineStyle: { color: dark ? 'rgba(255,255,255,0.22)' : profile.axisLineColor } },
      splitLine: { show: true, lineStyle: { color: dark ? 'rgba(255,255,255,0.12)' : profile.splitLineColor, width: 1 } }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: yAxisData,
      splitArea: {
        show: true,
        areaStyle: {
          color: dark ? ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.045)'] : ['#fbfdff', '#f5f9fe']
        }
      },
      axisLabel: {
        color: dark ? '#d8e0ea' : profile.axisLabelColor,
        width: 150, overflow: 'truncate'
      },
      axisLine: { show: true, lineStyle: { color: dark ? 'rgba(255,255,255,0.18)' : profile.axisLineColor } }
    },
    tooltip: {
      show: true,
      trigger: 'axis',
      axisPointer: { type: 'line', snap: false, label: { show: true } },
      backgroundColor: surfaceTheme.panelBg,
      borderColor: surfaceTheme.panelBorder,
      borderWidth: 1,
      padding: [12, 14],
      extraCssText: `box-shadow: ${surfaceTheme.panelShadow}; border-radius: 12px;`,
      textStyle: { color: surfaceTheme.panelText },
      formatter: tooltipFormatter
    },
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        start: 0, end: 100,
        height: 22, bottom: 14,
        borderColor: dark ? 'rgba(148,163,184,0.30)' : '#d6deea',
        backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(230,238,250,0.60)',
        fillerColor: dark ? 'rgba(99,179,237,0.18)' : 'rgba(59,130,246,0.12)',
        handleStyle: { color: dark ? '#63b3ed' : '#3b82f6', borderColor: dark ? '#63b3ed' : '#3b82f6' },
        moveHandleStyle: { color: '#94a3b8' },
        labelFormatter: (v: number) => formatTimelineLabel(v, gran),
        textStyle: { color: dark ? '#94a3b8' : '#64748b', fontSize: 11 }
      },
      {
        type: 'inside',
        xAxisIndex: 0,
        start: 0, end: 100,
        zoomOnMouseWheel: false,
        moveOnMouseMove: false
      }
    ],
    series
  }
}

const chartOption = computed(() => buildOption(props.tasks, props.theme, props.options))


function exportPNG() {
  if (!instance) return
  const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const a = document.createElement('a')
  a.href = url
  a.download = 'gantt.png'
  a.click()
}

function exportSVG() {
  if (!instance) return
  // Get PNG data URL from canvas
  const pngUrl = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const chartDom = instance.getDom()
  const width = chartDom?.clientWidth || 800
  const height = chartDom?.clientHeight || 600
  
  // Create SVG with embedded PNG image
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <image href="${pngUrl}" width="${width}" height="${height}"/>
</svg>`
  
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'gantt.svg'
  a.click()
  URL.revokeObjectURL(url)
}

function exportHTML() {
  const optionJSON = JSON.stringify(chartOption.value, null, 2)
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gantt Preview</title>
  <style>html,body,#chart{height:100%;margin:0}body{background:#fff}</style>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"><\/script>
</head>
<body>
  <div id="chart"></div>
  <script>
    const chart = echarts.init(document.getElementById('chart'));
    const option = ${optionJSON};
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
  <\/script>
</body>
</html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'gantt.html'
  a.click()
  URL.revokeObjectURL(url)
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

defineExpose({ exportPNG, exportSVG, exportHTML, exportJSON, enterFullscreen })

function resolvedTheme(): string | undefined {
  return getEchartsRuntimeThemeName(props.theme)
}

function ensureInstance() {
  if (!chartEl.value) return
  const rTheme = resolvedTheme()
  if (!instance) {
    instance = echarts.init(chartEl.value, rTheme)
    appliedTheme = rTheme
    return
  }
  if (appliedTheme !== rTheme) {
    ro?.unobserve(chartEl.value)
    instance.dispose()
    instance = echarts.init(chartEl.value, rTheme)
    appliedTheme = rTheme
    ro?.observe(chartEl.value)
  }
}

onMounted(() => {
  if (!chartEl.value) return
  ensureInstance()
  instance!.setOption(chartOption.value)
  ro = new ResizeObserver(() => instance?.resize())
  ro.observe(chartEl.value)
})

onUnmounted(() => {
  ro?.disconnect()
  instance?.dispose()
  instance = null
  appliedTheme = undefined
})

watch([chartOption, () => props.theme], () => {
  ensureInstance()
  if (instance) instance.setOption(chartOption.value, true)
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
  min-height: 560px;
  background: #ffffff;
}
.gantt-chart-wrap:fullscreen,
.gantt-chart-wrap:-webkit-full-screen {
  background: #ffffff;
}
.gantt-el {
  flex: 1;
  width: 100%;
  min-height: 520px;
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
