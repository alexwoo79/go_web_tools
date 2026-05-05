<script setup lang="ts">
// src/components/BiChart.vue
// 封装的通用图表组件 (Generic Chart Component)
//
// 这是对 vue-echarts 的薄封装，提供：
//   • 统一的加载状态显示
//   • 统一的空数据占位符
//   • 响应式容器（ResizeObserver 自动更新图表尺寸）
//   • 通过 `option` prop 接受任意 ECharts 配置对象
//
// Usage:
//   <BiChart :option="chartOption" :loading="isLoading" height="400px" />

import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { ElMessage } from 'element-plus'

interface Props {
  /** ECharts option 配置对象 */
  option: EChartsOption | null
  /** 是否显示加载动画 */
  loading?: boolean
  /** 图表容器高度（CSS 值，如 "400px" 或 "60vh"） */
  height?: string
  /** 图表主题：'dark' | 'light'（留空使用全局主题） */
  theme?: string
  /** 是否自动调整尺寸（默认 true） */
  autoresize?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  height: '420px',
  theme: 'dark',
  autoresize: true,
})

const chartRef = ref<InstanceType<typeof VChart> | null>(null)

// 空状态判断：option 为 null 或没有 series
const isEmpty = computed(() => {
  if (!props.option) return true
  const series = (props.option as any).series
  if (!series) return true
  if (Array.isArray(series) && series.length === 0) return true
  return false
})

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function sanitizeOptionForHtml(option: EChartsOption): EChartsOption {
  const raw = JSON.parse(
    JSON.stringify(option, (_key, value) => (typeof value === 'function' ? undefined : value))
  ) as any

  if (raw.toolbox?.feature) {
    delete raw.toolbox.feature.mySaveAsImage
    delete raw.toolbox.feature.mySaveAsHtml
    raw.toolbox.feature.saveAsImage = raw.toolbox.feature.saveAsImage ?? { title: '保存图片' }
  }

  return raw
}

function buildStandaloneHtml(option: EChartsOption): string {
  const safeOptionJson = JSON.stringify(sanitizeOptionForHtml(option)).replace(/<\//g, '<\\/')
  const backgroundColor = (option as any)?.backgroundColor ?? '#1f1f1f'
  const scriptOpen = '<script'
  const scriptClose = '</' + 'script>'

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ECharts Export</title>
  <style>
    html, body, #chart {
      width: 100%;
      height: 100%;
      margin: 0;
      background: ${backgroundColor};
    }
  </style>
  ${scriptOpen} src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js">${scriptClose}
</head>
<body>
  <div id="chart"></div>
  ${scriptOpen}>
    const chart = echarts.init(document.getElementById('chart'), '${props.theme}');
    const option = ${safeOptionJson};
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
  ${scriptClose}
</body>
</html>`
}

async function exportChartAsPng() {
  const chart = (chartRef.value as any)?.chart ?? (chartRef.value as any)?.getEchartsInstance?.()
  if (!chart) {
    ElMessage.error('图表尚未准备好，暂时无法导出')
    return
  }

  try {
    const savePath = await saveDialog({
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      defaultPath: 'chart-export.png',
    })
    if (!savePath) return

    const dataUrl = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: (props.option as any)?.backgroundColor ?? '#1f1f1f',
    })
    await writeFile(savePath, dataUrlToBytes(dataUrl))
    ElMessage.success('图表图片已保存')
  } catch (error) {
    ElMessage.error(`保存图片失败: ${String(error)}`)
  }
}

async function exportChartAsHtml() {
  if (!props.option) {
    ElMessage.error('图表尚未准备好，暂时无法导出 HTML')
    return
  }

  try {
    const savePath = await saveDialog({
      filters: [{ name: 'HTML 文件', extensions: ['html'] }],
      defaultPath: 'chart-export.html',
    })
    if (!savePath) return

    const html = buildStandaloneHtml(props.option)
    await writeFile(savePath, textToBytes(html))
    ElMessage.success('图表 HTML 已保存')
  } catch (error) {
    ElMessage.error(`保存 HTML 失败: ${String(error)}`)
  }
}

const mergedOption = computed<EChartsOption | null>(() => {
  if (!props.option) return null

  const option = props.option as any
  const toolbox = option.toolbox
  if (!toolbox) return props.option

  const feature = toolbox.feature ?? {}
  const { saveAsImage: _saveAsImage, ...restFeatures } = feature

  return {
    ...option,
    toolbox: {
      ...toolbox,
      feature: {
        mySaveAsImage: {
          show: true,
          title: '保存图片',
          icon: 'path://M512 64c17.7 0 32 14.3 32 32v256h118.1c28.5 0 42.8 34.5 22.6 54.6l-160 160c-12.5 12.5-32.8 12.5-45.3 0l-160-160C299.1 386.5 313.4 352 341.9 352H480V96c0-17.7 14.3-32 32-32zm-288 512c-17.7 0-32-14.3-32-32V432c0-17.7-14.3-32-32-32s-32 14.3-32 32v112c0 53 43 96 96 96h576c53 0 96-43 96-96V432c0-17.7-14.3-32-32-32s-32 14.3-32 32v112c0 17.7-14.3 32-32 32H224z',
          onclick: exportChartAsPng,
        },
        mySaveAsHtml: {
          show: true,
          title: '导出 HTML',
          icon: 'path://M160 128c0-35.3 28.7-64 64-64h277.5c17 0 33.3 6.7 45.3 18.7l108.5 108.5c12 12 18.7 28.3 18.7 45.3V704c0 35.3-28.7 64-64 64H224c-35.3 0-64-28.7-64-64V128zm64 0V704h386V256H480c-17.7 0-32-14.3-32-32V128H224zm288 45.3V192l45.3 45.3H512zM304 384c-17.7 0-32 14.3-32 32v192c0 17.7 14.3 32 32 32s32-14.3 32-32V544h112v64c0 17.7 14.3 32 32 32s32-14.3 32-32V416c0-17.7-14.3-32-32-32s-32 14.3-32 32v64H336v-64c0-17.7-14.3-32-32-32z',
          onclick: exportChartAsHtml,
        },
        ...restFeatures,
      },
    },
  }
})
</script>

<template>
  <div class="bi-chart-wrapper" :style="{ height: props.height }">
    <!-- 加载状态 -->
    <div v-if="props.loading" class="chart-overlay">
      <el-icon class="is-loading" :size="32">
        <Loading />
      </el-icon>
      <span>数据加载中…</span>
    </div>

    <!-- 空状态 -->
    <el-empty v-else-if="isEmpty" description="暂无数据，请先配置图表参数" :image-size="80" />

    <!-- ECharts 图表 -->
    <VChart ref="chartRef" v-else :option="mergedOption!" :theme="props.theme" :loading="props.loading"
      :autoresize="props.autoresize" style="width: 100%; height: 100%;" />
  </div>
</template>

<style scoped>
.bi-chart-wrapper {
  position: relative;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color-overlay);
}

.chart-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.4);
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
