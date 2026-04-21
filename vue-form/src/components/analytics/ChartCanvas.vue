<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts/core'
import {
  BarChart, LineChart, PieChart, ScatterChart, RadarChart,
  FunnelChart, GaugeChart, TreeChart, TreemapChart, SankeyChart, GraphChart, ChordChart
} from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, GridComponent,
  LegendComponent, DataZoomComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart, LineChart, PieChart, ScatterChart, RadarChart,
  FunnelChart, GaugeChart, TreeChart, TreemapChart, SankeyChart, GraphChart, ChordChart,
  TitleComponent, TooltipComponent, GridComponent,
  LegendComponent, DataZoomComponent,
  CanvasRenderer
])

const props = defineProps<{
  option: Record<string, any> | null
  loading?: boolean
}>()

const chartEl = ref<HTMLDivElement>()
let instance: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

function toEChartsOption(raw: Record<string, any> | null): Record<string, any> | null {
  if (!raw) return null

  const kind = raw.kind as string | undefined
  // Payloads from backend builders include `kind`; they must be adapted.
  if (kind) {
    // continue to payload mapping branches below
  } else {
    // If it already looks like an ECharts option, use it directly.
    if (raw.xAxis?.type || raw.yAxis?.type || raw.radar?.indicator || raw.series?.[0]?.type) {
      return raw
    }
  }

  const title = raw.title ?? {}
  if (!kind) return raw

  if (kind === 'bar' || kind === 'line' || kind === 'area' || kind === 'stack_bar' || kind === 'stack_area') {
    const isLine = kind === 'line' || kind === 'area' || kind === 'stack_area'
    const isArea = kind === 'area' || kind === 'stack_area'
    const isStack = kind === 'stack_bar' || kind === 'stack_area'
    const swapAxis = !!raw.swapAxis
    const series = (raw.series ?? []).map((s: any) => ({
      name: s.name,
      type: isLine ? 'line' : 'bar',
      data: s.data ?? [],
      smooth: !!s.smooth,
      stack: isStack ? 'total' : undefined,
      areaStyle: isArea ? {} : undefined,
    }))
    return {
      title,
      tooltip: { trigger: 'axis' },
      legend: { type: 'scroll' },
      grid: { left: 40, right: 20, top: 60, bottom: 40, containLabel: true },
      xAxis: swapAxis
        ? { type: 'value' }
        : { type: 'category', data: raw.xAxis ?? [] },
      yAxis: swapAxis
        ? { type: 'category', data: raw.xAxis ?? [] }
        : { type: 'value' },
      series,
    }
  }

  if (kind === 'scatter') {
    return {
      title,
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: raw.xName || '' },
      yAxis: { type: 'value', name: raw.yName || '' },
      series: [
        {
          name: raw.seriesName || 'Scatter',
          type: 'scatter',
          data: raw.points ?? [],
          symbolSize: (v: any) => Array.isArray(v) && v.length > 2 ? Number(v[2]) : 12,
        },
      ],
    }
  }

  if (kind === 'pie' || kind === 'donut' || kind === 'funnel') {
    const items = raw.items ?? []
    const base: Record<string, any> = {
      title,
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll', orient: 'vertical', right: 10, top: 20, bottom: 20 },
    }
    if (kind === 'funnel') {
      base.series = [{ name: raw.seriesName || 'Funnel', type: 'funnel', data: items }]
    } else {
      base.series = [{
        name: raw.seriesName || 'Pie',
        type: 'pie',
        radius: kind === 'donut' ? ['40%', '70%'] : '60%',
        center: ['40%', '55%'],
        data: items,
      }]
    }
    return base
  }

  if (kind === 'gauge') {
    return {
      title,
      tooltip: { formatter: '{a}<br/>{b}: {c}' },
      series: [
        {
          name: raw.seriesName || 'Gauge',
          type: 'gauge',
          max: Number(raw.max ?? 100),
          data: [{ value: Number(raw.value ?? 0), name: raw.seriesName || 'Value' }],
        },
      ],
    }
  }

  if (kind === 'radar') {
    return {
      title,
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll' },
      radar: { indicator: raw.indicators ?? [] },
      series: raw.series ?? [],
    }
  }

  if (kind === 'sankey') {
    return {
      title,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'sankey',
          data: raw.nodes ?? [],
          links: raw.links ?? [],
          emphasis: { focus: 'adjacency' },
        },
      ],
    }
  }

  if (kind === 'chord') {
    return {
      title,
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll' },
      series: [
        {
          type: 'chord',
          coordinateSystem: 'none',
          roam: true,
          data: raw.nodes ?? [],
          links: raw.links ?? [],
          label: { show: true },
          lineStyle: { opacity: 0.75, curveness: 0.5 },
          emphasis: { focus: 'adjacency' },
        },
      ],
    }
  }

  if (kind === 'graph') {
    return {
      title,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          label: { show: true },
          data: raw.nodes ?? [],
          links: raw.links ?? [],
          force: { repulsion: 120 },
        },
      ],
    }
  }

  if (kind === 'tree') {
    return {
      title,
      tooltip: { trigger: 'item', triggerOn: 'mousemove' },
      series: [
        {
          type: 'tree',
          data: raw.tree ? [raw.tree] : [],
          top: '5%',
          left: '7%',
          bottom: '5%',
          right: '20%',
          symbolSize: 9,
          label: { position: 'left', verticalAlign: 'middle', align: 'right' },
        },
      ],
    }
  }

  if (kind === 'treemap') {
    return {
      title,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'treemap',
          data: raw.tree?.children ?? (raw.tree ? [raw.tree] : []),
        },
      ],
    }
  }

  return raw
}

function exportPNG() {
  if (!instance) return
  const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const a = document.createElement('a')
  a.href = url
  a.download = 'chart.png'
  a.click()
}

function exportJSON() {
  const normalized = toEChartsOption(props.option)
  if (!normalized) return
  const json = JSON.stringify(normalized, null, 2)
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
  const el = chartEl.value?.closest('.chart-canvas-wrap') as HTMLElement | null ?? chartEl.value
  if (!el) return
  if (el.requestFullscreen) el.requestFullscreen()
}

defineExpose({ exportPNG, exportJSON, enterFullscreen })

onMounted(() => {
  if (!chartEl.value) return
  instance = echarts.init(chartEl.value)
  const normalized = toEChartsOption(props.option)
  if (normalized) instance.setOption(normalized)
  ro = new ResizeObserver(() => instance?.resize())
  ro.observe(chartEl.value)
})

onUnmounted(() => {
  ro?.disconnect()
  instance?.dispose()
  instance = null
})

watch(
  () => props.option,
  (opt) => {
    const normalized = toEChartsOption(opt)
    if (instance && normalized) instance.setOption(normalized, true)
  }
)
</script>

<template>
  <div class="chart-canvas-wrap">
    <div v-if="loading" class="chart-loading">渲染中…</div>
    <div ref="chartEl" class="chart-el" :style="{ visibility: loading ? 'hidden' : 'visible' }" />
  </div>
</template>

<style scoped>
.chart-canvas-wrap {
  position: relative;
  width: 100%;
  height: 420px;
}
.chart-el {
  width: 100%;
  height: 100%;
}
.chart-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  font-size: 14px;
}
</style>
