<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts/core'
import {
  BarChart, LineChart, PieChart, ScatterChart, RadarChart,
  FunnelChart, GaugeChart, TreeChart, TreemapChart, SankeyChart, GraphChart
} from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, GridComponent,
  LegendComponent, DataZoomComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart, LineChart, PieChart, ScatterChart, RadarChart,
  FunnelChart, GaugeChart, TreeChart, TreemapChart, SankeyChart, GraphChart,
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

function exportPNG() {
  if (!instance) return
  const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const a = document.createElement('a')
  a.href = url
  a.download = 'chart.png'
  a.click()
}
defineExpose({ exportPNG })

onMounted(() => {
  if (!chartEl.value) return
  instance = echarts.init(chartEl.value)
  if (props.option) instance.setOption(props.option)
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
    if (instance && opt) instance.setOption(opt, true)
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
