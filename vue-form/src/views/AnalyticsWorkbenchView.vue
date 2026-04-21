<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import DatasetUpload from '@/components/analytics/DatasetUpload.vue'
import ChartOptionsPanel from '@/components/analytics/ChartOptionsPanel.vue'
import FieldMapper from '@/components/analytics/FieldMapper.vue'
import ChartCanvas from '@/components/analytics/ChartCanvas.vue'
import ChartToolbar from '@/components/analytics/ChartToolbar.vue'
import GanttChart, { type GanttTask, type GanttStats, type GanttOptions } from '@/components/analytics/GanttChart.vue'
import type { UploadedDataset } from '@/components/analytics/DatasetUpload.vue'
import { localizeErrorCode, localizeValidationIssue, type ValidationIssue } from '@/utils/analyticsErrorI18n'
import { analyticsDemoOptions, analyticsDemoPresets, getAnalyticsDemoPreset, isAnalyticsDemoFileName } from '@/utils/analyticsDemoCsv'

interface FieldDef {
  key: string
  label: string
  description?: string
  required?: boolean
  multi?: boolean
  type?: string
  options?: string[]
  aliases?: string[]
}

interface ChartDefinition {
  kind: string
  label: string
  family: string
  description?: string
  hint?: string
  fields: FieldDef[]
}

const GANTT_FIELDS = [
  { key: 'taskCol', label: '任务名列', required: true },
  { key: 'startCol', label: '开始日期列', required: true },
  { key: 'endCol', label: '结束日期列', required: true },
  { key: 'projectCol', label: '项目/分组列', required: false },
  { key: 'ownerCol', label: '负责人列', required: false },
  { key: 'descCol', label: '描述列', required: false },
  { key: 'planStartCol', label: '计划开始列', required: false },
  { key: 'planEndCol', label: '计划结束列', required: false },
  { key: 'milestoneCol', label: '里程碑名列', required: false },
  { key: 'milestoneDateCol', label: '里程碑日期列', required: false },
]

const router = useRouter()

const definitions = ref<ChartDefinition[]>([])
const loadingDefs = ref(true)
const defsError = ref('')

const dataset = ref<UploadedDataset | null>(null)
const chartKind = ref('')
const chartTitle = ref('')
const fieldConfig = ref<Record<string, any>>({})
const optionConfig = ref<Record<string, any>>({})
const ganttConfig = ref<Record<string, string>>({})
const ganttOptions = ref<GanttOptions>({
  showTaskDetails: true,
  showDuration: true,
  sortByStart: false,
  autoNumber: false,
  darkTheme: false,
  granularity: 'month',
})

const building = ref(false)
const buildError = ref('')
const buildFieldErrors = ref<Record<string, string>>({})
const chartOption = ref<Record<string, any> | null>(null)
const ganttData = ref<{ tasks: GanttTask[]; stats: GanttStats } | null>(null)

const chartRef = ref<InstanceType<typeof ChartCanvas>>()
const ganttRef = ref<InstanceType<typeof GanttChart>>()

const isGanttMode = ref(false)
const activeTab = ref<'step1' | 'step2' | 'step3'>('step1')
const previewCollapsed = ref(false)
const demoLoading = ref(false)
const demoError = ref('')
const autoLoadDemo = ref(false)
const demoDatasetLoaded = ref(false)
const activeDemoPresetKey = ref('')
const selectedDemoPresetKey = ref('mixed')

const demoButtonLabel = computed(() => {
  if (demoLoading.value) return '加载中…'
  return autoLoadDemo.value ? '重新加载自动样例' : '加载所选样例'
})

const demoHintText = computed(() => {
  if (autoLoadDemo.value) {
    return '自动模式已开启：切换图形会自动加载匹配样例；下拉仅供查看。'
  }
  return '手动模式：先选择样例类型，再点击「加载所选样例」。'
})

// When isGanttMode changes, set chartKind appropriately
function toggleGanttMode(val: boolean) {
  isGanttMode.value = val
  if (val) {
    chartKind.value = 'gantt'
  } else {
    chartKind.value = definitions.value[0]?.kind ?? ''
  }
  chartOption.value = null
  ganttData.value = null
}

const isGanttModeModel = computed({
  get: () => isGanttMode.value,
  set: (v) => toggleGanttMode(v)
})

const step = computed(() => {
  if (!dataset.value) return 1
  if (!chartKind.value) return 2
  return 3
})

const currentDef = computed(() =>
  definitions.value.find(d => d.kind === chartKind.value)
)

const canBuild = computed(() => {
  if (!dataset.value || !chartKind.value) return false
  if (isGanttMode.value) {
    return !!(ganttConfig.value['taskCol'] && ganttConfig.value['startCol'] && ganttConfig.value['endCol'])
  }
  const required = currentDef.value?.fields.filter(f => f.required) ?? []
  return required.every(f => fieldConfig.value[f.key])
})

const yCountSupportedKinds = new Set(['bar', 'line', 'area', 'stack_bar', 'stack_area', 'radar'])

function normalizeYCount(raw: any): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(8, Math.max(1, Math.floor(parsed)))
}

function inferYCountFromConfig(config: Record<string, any>): number {
  const hasY2 = typeof config.y2Col === 'string' && config.y2Col.trim() !== ''
  const hasY3 = typeof config.y3Col === 'string' && config.y3Col.trim() !== ''
  const extras = Array.isArray(config.yExtraCols)
    ? config.yExtraCols.filter(v => typeof v === 'string' && v.trim() !== '')
    : []
  if (extras.length > 0) return Math.min(8, 3 + extras.length)
  if (hasY3) return 3
  if (hasY2) return 2
  return 1
}

function sanitizeYSeriesConfig(kind: string, config: Record<string, any>): Record<string, any> {
  if (!yCountSupportedKinds.has(kind)) return config

  const next = { ...config }
  const hasExplicitYCount = !(config.yMetricCount === undefined || config.yMetricCount === null || String(config.yMetricCount).trim() === '')
  const yCount = hasExplicitYCount ? normalizeYCount(config.yMetricCount) : inferYCountFromConfig(config)
  next.yMetricCount = yCount

  if (yCount < 2) next.y2Col = ''
  if (yCount < 3) next.y3Col = ''

  const extras = Array.isArray(config.yExtraCols)
    ? config.yExtraCols.filter(v => typeof v === 'string' && v.trim() !== '')
    : []
  next.yExtraCols = extras.slice(0, Math.max(0, yCount - 3))

  return next
}

const previewHeaders = computed(() => dataset.value?.headers ?? [])
const previewRows = computed(() => dataset.value?.preview ?? [])
const chartTheme = computed(() => String(optionConfig.value.theme || chartOption.value?.theme || 'default'))

function inferHeader(headers: string[], ...keys: string[]): string {
  const lowered = headers.map(header => header.toLowerCase())
  for (const key of keys) {
    const needle = key.toLowerCase()
    const matchIndex = lowered.findIndex(header => header.includes(needle))
    if (matchIndex >= 0) return headers[matchIndex] ?? ''
  }
  return ''
}

function inferDatasetDefaults(headers: string[]) {
  const xCol = inferHeader(headers, 'month', 'date', 'category', 'name', 'x')
  const yCol = inferHeader(headers, 'revenue', 'value', 'profit', 'amount', 'y')
  const y2Col = inferHeader(headers, 'cost', 'share', 'value2', 'y2')
  const y3Col = inferHeader(headers, 'profit', 'value3', 'y3')
  const yCount = [yCol, y2Col, y3Col].filter(Boolean).length || 1

  return {
    xCol,
    yCol,
    y2Col,
    y3Col,
    yMetricCount: yCount,
    nameCol: inferHeader(headers, 'category', 'name', 'label'),
    valueCol: inferHeader(headers, 'share', 'revenue', 'value', 'amount'),
    value2Col: inferHeader(headers, 'cost', 'profit', 'value2'),
    sizeCol: inferHeader(headers, 'scattersize', 'size', 'bubble'),
    sourceCol: inferHeader(headers, 'source', 'from'),
    targetCol: inferHeader(headers, 'target', 'to'),
    linkValueCol: inferHeader(headers, 'linkvalue', 'weight', 'flow', 'value'),
    nodeIDCol: inferHeader(headers, 'nodeid', 'id'),
    parentIDCol: inferHeader(headers, 'parentid', 'parent'),
    nodeValueCol: inferHeader(headers, 'nodevalue', 'value', 'amount'),
    seriesName: yCol || '指标A',
    series2Name: y2Col || '指标B',
    series3Name: y3Col || '指标C',
    gaugeMode: 'avg',
    sortMode: 'none',
  }
}

function applyAutoMappingForCurrentChart() {
  if (!dataset.value || isGanttMode.value || !chartKind.value || !demoDatasetLoaded.value) return

  const def = definitions.value.find(item => item.kind === chartKind.value)
  if (!def) return

  const inferred = inferDatasetDefaults(dataset.value.headers)
  const nextFieldConfig: Record<string, any> = {}
  const nextOptionConfig = { ...optionConfig.value }

  for (const field of def.fields) {
    const inferredValue = inferred[field.key as keyof typeof inferred]
    if (field.type === 'column') {
      if (field.key === 'yExtraCols') {
        nextFieldConfig[field.key] = []
      } else if (typeof inferredValue === 'string' && inferredValue) {
        nextFieldConfig[field.key] = inferredValue
      }
      continue
    }

    if (field.key === 'yMetricCount') {
      nextOptionConfig[field.key] = inferred.yMetricCount
      continue
    }
    if (typeof inferredValue === 'string' && inferredValue) {
      nextOptionConfig[field.key] = inferredValue
    }
  }

  fieldConfig.value = nextFieldConfig
  optionConfig.value = nextOptionConfig
  buildFieldErrors.value = {}
  if (!chartTitle.value) {
    chartTitle.value = `${def.label}预览`
  }
}

async function loadDemoDataset(kind = chartKind.value) {
  const preset = getAnalyticsDemoPreset(kind)
  await loadDemoDatasetByPreset(preset.key)
}

async function loadSelectedDemoDataset() {
  const preset = analyticsDemoPresets[selectedDemoPresetKey.value] ?? getAnalyticsDemoPreset(chartKind.value)
  await loadDemoDatasetByPreset(preset.key)
}

async function loadDemoDatasetByPreset(presetKey: string) {
  const preset = analyticsDemoPresets[presetKey] ?? getAnalyticsDemoPreset(chartKind.value)
  if (demoLoading.value) return
  demoLoading.value = true
  demoError.value = ''
  try {
    activeDemoPresetKey.value = preset.key
    selectedDemoPresetKey.value = preset.key
    const file = new File([preset.csv], preset.fileName, { type: 'text/csv' })
    const fd = new FormData()
    fd.append('file', file)

    const uploadRes = await fetch('/api/admin/analytics/datasets/upload', {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
    if (!uploadRes.ok) {
      let msg = `上传测试数据失败 (${uploadRes.status})`
      try {
        const payload = await uploadRes.json()
        msg = payload?.error || msg
      } catch {
        msg = (await uploadRes.text()) || msg
      }
      throw new Error(msg)
    }
    const payload = await uploadRes.json()
    demoDatasetLoaded.value = true
    onUploaded(payload)
  } catch (e: any) {
    demoError.value = e?.message ?? '测试数据加载失败'
    demoDatasetLoaded.value = false
  } finally {
    demoLoading.value = false
  }
}

function onToggleAutoDemo() {
  localStorage.setItem('analytics:autoDemoLoad', autoLoadDemo.value ? '1' : '0')
  if (autoLoadDemo.value) {
    loadDemoDataset(chartKind.value)
  }
}

function onDemoPresetChange(nextPresetKey: string) {
  selectedDemoPresetKey.value = nextPresetKey
}

async function onLoadDemoClick() {
  if (autoLoadDemo.value) {
    await loadDemoDataset(chartKind.value)
    return
  }
  await loadSelectedDemoDataset()
}

onMounted(async () => {
  autoLoadDemo.value = localStorage.getItem('analytics:autoDemoLoad') === '1'
  try {
    const res = await fetch('/api/admin/analytics/definitions', {
      credentials: 'include'
    })
    if (!res.ok) throw new Error(`获取图表定义失败 (${res.status})`)
    const data = await res.json()
    definitions.value = Array.isArray(data) ? data : (Array.isArray(data?.definitions) ? data.definitions : [])
    if (definitions.value.length > 0) chartKind.value = definitions.value[0]!.kind
  } catch (e: any) {
    defsError.value = e.message ?? '未知错误'
  } finally {
    loadingDefs.value = false
  }
  if (autoLoadDemo.value && !dataset.value) {
    await loadDemoDataset(chartKind.value)
  }
})

function onUploaded(payload: UploadedDataset) {
  dataset.value = payload
  demoDatasetLoaded.value = isAnalyticsDemoFileName(payload.name)
  if (demoDatasetLoaded.value && activeDemoPresetKey.value) {
    selectedDemoPresetKey.value = activeDemoPresetKey.value
  }
  fieldConfig.value = {}
  optionConfig.value = {}
  ganttConfig.value = {}
  buildError.value = ''
  buildFieldErrors.value = {}
  chartOption.value = null
  ganttData.value = null
}

watch([dataset, chartKind, isGanttMode], () => {
  applyAutoMappingForCurrentChart()
})

watch(chartKind, async (kind) => {
  if (!kind || isGanttMode.value || !autoLoadDemo.value) return
  const preset = getAnalyticsDemoPreset(kind)
  if (demoDatasetLoaded.value && dataset.value && preset.key === activeDemoPresetKey.value) {
    applyAutoMappingForCurrentChart()
    return
  }
  await loadDemoDataset(kind)
})

function toLegacyConfig(v2: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {}
  const set = (k: string, v: any) => {
    if (typeof v === 'string' && v.trim() !== '') out[k] = v
  }
  set('title', v2.title)
  set('subTitle', v2.subTitle)
  set('seriesName', v2.seriesName)
  set('xAxis', v2.xCol)
  set('yAxis', v2.yCol)
  set('y2Axis', v2.y2Col)
  set('y3Axis', v2.y3Col)
  set('nameField', v2.nameCol)
  set('valueField', v2.valueCol)
  set('size', v2.sizeCol)
  set('sourceCol', v2.sourceCol)
  set('targetCol', v2.targetCol)
  set('linkValueCol', v2.linkValueCol)
  set('nodeIDCol', v2.nodeIDCol)
  set('parentIDCol', v2.parentIDCol)
  set('nodeValueCol', v2.nodeValueCol)
  return out
}

async function build() {
  if (!dataset.value || !chartKind.value) return
  building.value = true
  buildError.value = ''
  buildFieldErrors.value = {}
  chartOption.value = null
  ganttData.value = null
  try {
    if (isGanttMode.value) {
      const body = { datasetId: dataset.value.id, config: ganttConfig.value }
      const res = await fetch('/api/admin/analytics/gantt/build', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error((await res.text()) || `构建失败 (${res.status})`)
      const data = await res.json()
      ganttData.value = data.gantt
    } else {
      const mergedV2Config = sanitizeYSeriesConfig(chartKind.value, {
        ...fieldConfig.value,
        ...optionConfig.value,
        title: chartTitle.value || undefined,
      })
      const body = {
        datasetId: dataset.value.id,
        chartKind: chartKind.value,
        schemaVersion: 2,
        configV2: mergedV2Config,
        // Keep legacy payload for backward compatibility during migration window.
        config: toLegacyConfig(mergedV2Config)
      }
      const res = await fetch('/api/admin/analytics/build', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        let msg = `构建失败 (${res.status})`
        try {
          const payload = await res.json()
          msg = localizeErrorCode(payload?.code, payload?.error || msg)
          if (Array.isArray(payload?.details)) {
            const map: Record<string, string> = {}
            for (const item of payload.details as ValidationIssue[]) {
              if (item?.field) {
                map[item.field] = localizeValidationIssue(item, item.message || '配置有误')
              }
            }
            buildFieldErrors.value = map
          }
        } catch {
          msg = (await res.text()) || msg
        }
        throw new Error(msg)
      }
      const data = await res.json()
      chartOption.value = data.option
    }
  } catch (e: any) {
    buildError.value = e.message ?? '构建出错'
  } finally {
    building.value = false
  }
}

function exportPNG() {
  if (isGanttMode.value) ganttRef.value?.exportPNG()
  else chartRef.value?.exportPNG()
}

function reset() {
  dataset.value = null
  demoDatasetLoaded.value = false
  activeDemoPresetKey.value = ''
  chartOption.value = null
  ganttData.value = null
  buildError.value = ''
  fieldConfig.value = {}
  optionConfig.value = {}
  ganttConfig.value = {}
  ganttOptions.value = { showTaskDetails: true, showDuration: true, sortByStart: false, autoNumber: false, darkTheme: false, granularity: 'month' }
  buildFieldErrors.value = {}
}
</script>

<template>
  <div class="workbench">
    <header class="wb-header">
      <h1 class="wb-title">数据分析工作台</h1>
      <button class="btn-back" @click="router.push('/admin')">← 返回管理后台</button>
    </header>

    <div v-if="loadingDefs" class="wb-loading">加载图表定义中…</div>
    <div v-else-if="defsError" class="wb-error">{{ defsError }}</div>

    <div v-else class="wb-body">
      <section class="wb-panel">
        <!-- Tab Navigation -->
        <div class="wb-tabs">
          <button class="wb-tab" :class="{ active: activeTab === 'step1' }" @click="activeTab = 'step1'">
            1. 上传数据
          </button>
          <button class="wb-tab" :class="{ active: activeTab === 'step2', disabled: step < 2 }" @click="step >= 2 && (activeTab = 'step2')">
            2. 图表类型
          </button>
          <button class="wb-tab" :class="{ active: activeTab === 'step3', disabled: step < 3 }" @click="step >= 3 && (activeTab = 'step3')">
            3. 字段映射
          </button>
        </div>

        <!-- Tab Content -->
        <div v-if="activeTab === 'step1'" class="wb-section" :class="{ done: step > 1 }">
          <div class="demo-toggle-row">
            <label class="demo-toggle-label">
              <input type="checkbox" v-model="autoLoadDemo" @change="onToggleAutoDemo" />
              自动加载测试数据
            </label>
            <select
              class="demo-select"
              :value="selectedDemoPresetKey"
              :disabled="autoLoadDemo"
              @change="onDemoPresetChange(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="item in analyticsDemoOptions" :key="item.key" :value="item.key">
                {{ item.label }}
              </option>
            </select>
            <button class="btn-load-demo" :disabled="demoLoading" @click="onLoadDemoClick">
              {{ demoButtonLabel }}
            </button>
          </div>
          <p class="demo-hint">{{ demoHintText }}</p>
          <p v-if="demoError" class="demo-error">{{ demoError }}</p>
          <DatasetUpload @uploaded="onUploaded" />
        </div>

        <div v-else-if="activeTab === 'step2'" class="wb-section" :class="{ disabled: step < 2, done: step > 2 }">
          <div class="gantt-toggle">
            <label>
              <input type="checkbox" v-model="isGanttModeModel" />
              &nbsp;甘特图模式
            </label>
          </div>
          <ChartOptionsPanel
            v-if="!isGanttMode"
            :definitions="definitions"
            v-model="chartKind"
            v-model:title="chartTitle"
            v-model:config="optionConfig"
            :field-errors="buildFieldErrors"
          />
          <p v-else class="gantt-hint">甘特图将使用下方字段映射渲染任务时间线</p>
        </div>

        <div v-else-if="activeTab === 'step3'" class="wb-section" :class="{ disabled: step < 3, done: canBuild }">
          <!-- Regular chart field mapper -->
          <FieldMapper
            v-if="!isGanttMode"
            :headers="dataset?.headers ?? []"
            :chart-kind="chartKind"
            :definitions="definitions"
            :context-config="optionConfig"
            :field-errors="buildFieldErrors"
            v-model="fieldConfig"
          />
          <!-- Gantt field mapper -->
          <div v-else class="gantt-field-mapper">
            <div v-for="f in GANTT_FIELDS" :key="f.key" class="gantt-field-row">
              <label class="gf-label">
                {{ f.label }}
                <span v-if="f.required" class="req">*</span>
              </label>
              <select class="gf-select" v-model="ganttConfig[f.key]">
                <option value="">— 不映射 —</option>
                <option v-for="h in (dataset?.headers ?? [])" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
            <div class="gantt-opts-divider">显示选项</div>
            <label class="gantt-opt-row"><input type="checkbox" v-model="ganttOptions.showTaskDetails" /> 显示任务详情</label>
            <label class="gantt-opt-row"><input type="checkbox" v-model="ganttOptions.showDuration" /> 显示周期</label>
            <label class="gantt-opt-row"><input type="checkbox" v-model="ganttOptions.sortByStart" /> 按开始时间排序</label>
            <label class="gantt-opt-row"><input type="checkbox" v-model="ganttOptions.autoNumber" /> 自动编号</label>
            <label class="gantt-opt-row"><input type="checkbox" v-model="ganttOptions.darkTheme" /> 深色主题</label>
            <div class="gantt-field-row">
              <label class="gf-label">时间粒度</label>
              <select class="gf-select" v-model="ganttOptions.granularity">
                <option value="day">日</option>
                <option value="week">周</option>
                <option value="month">月</option>
                <option value="quarter">季度</option>
                <option value="year">年</option>
              </select>
            </div>
          </div>
        </div>

        <div class="wb-actions">
          <p v-if="buildError" class="build-error">{{ buildError }}</p>
          <div class="btn-row">
            <button
              class="btn-build"
              :disabled="!canBuild || building"
              @click="build"
            >
              {{ building ? '构建中…' : '生成图表' }}
            </button>
            <button v-if="dataset" class="btn-reset" @click="reset">重置</button>
            <button v-if="chartOption || ganttData" class="btn-export" @click="exportPNG">导出 PNG</button>
          </div>
        </div>
      </section>

      <section class="wb-chart-area" :class="isGanttMode ? 'gantt-mode' : 'normal-mode'">
        <div v-if="dataset" class="preview-panel">
          <div class="preview-head">
            <div>
              <div class="preview-title">数据预览</div>
              <div class="preview-sub">展示前 {{ previewRows.length }} 行，共 {{ dataset.rowCount }} 行</div>
            </div>
            <button class="btn-fold" @click="previewCollapsed = !previewCollapsed">
              {{ previewCollapsed ? '展开' : '收起' }}
            </button>
          </div>
          <div v-if="!previewCollapsed" class="preview-table-wrap">
            <table class="preview-table">
              <thead>
                <tr>
                  <th v-for="h in previewHeaders" :key="h">{{ h }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in previewRows" :key="i">
                  <td v-for="(cell, j) in row" :key="j">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="chart-stage">
          <div v-if="!chartOption && !ganttData && !building" class="chart-placeholder">
            完成配置后点击「生成图表」
          </div>
          <ChartToolbar
            v-else
            :chart-ref="isGanttMode ? (ganttRef as any) : (chartRef as any)"
          >
            <GanttChart
              v-if="isGanttMode && ganttData"
              ref="ganttRef"
              :tasks="ganttData.tasks"
              :stats="ganttData.stats"
              :theme="chartTheme"
              :options="ganttOptions"
            />
            <ChartCanvas
              v-else-if="!isGanttMode"
              ref="chartRef"
              :option="chartOption"
              :loading="building"
              :theme="chartTheme"
            />
          </ChartToolbar>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.workbench { min-height: 100vh; background: #f5f6fa; display: flex; flex-direction: column; }
.wb-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: #fff; border-bottom: 1px solid #e8e8e8; max-width: 1200px; margin: 0 auto; width: 100%; }
.wb-title { margin: 0; font-size: 20px; font-weight: 600; color: #1a1a1a; }
.btn-back { padding: 6px 16px; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; color: #555; cursor: pointer; font-size: 14px; }
.btn-back:hover { background: #f5f5f5; }
.wb-loading, .wb-error { padding: 60px; text-align: center; color: #888; font-size: 16px; }
.wb-error { color: #e53e3e; }
.wb-body { display: flex; flex: 1; gap: 20px; padding: 24px; align-items: flex-start; min-height: 0; max-width: 1200px; margin: 0 auto; width: 100%; }
.wb-panel { width: 380px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; }
.wb-section { background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 16px; transition: opacity 0.2s; }
.wb-section.disabled { opacity: 0.45; pointer-events: none; }
.wb-section.done { border-color: #b7eb8f; background: #fcfff5; }
.section-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 12px; }
.section-head-left { display: flex; align-items: center; gap: 8px; }
.step-badge { width: 22px; height: 22px; border-radius: 50%; background: #1677ff; color: #fff; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-fold {
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #4a4a4a;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.btn-fold:hover { background: #f7f7f7; }
.wb-tabs {
  display: flex;
  gap: 4px;
  padding: 0 0 12px;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 12px;
}
.wb-tab {
  flex: 1;
  padding: 10px 12px;
  background: #f5f5f5;
  border: 1px solid #e8e8e8;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}
.wb-tab:hover:not(.disabled) {
  background: #fff;
  color: #1677ff;
}
.wb-tab.active {
  background: #fff;
  color: #1677ff;
  border-color: #1677ff;
  border-bottom: 2px solid #1677ff;
}
.wb-tab.disabled {
  opacity: 1;
  background: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}
.wb-actions { background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 16px; }
.build-error { color: #e53e3e; font-size: 13px; margin: 0 0 10px; }
.btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-build { flex: 1; padding: 9px 20px; background: #1677ff; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-build:hover:not(:disabled) { background: #0958d9; }
.btn-build:disabled { background: #b0c4de; cursor: default; }
.btn-reset { padding: 9px 16px; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; color: #555; cursor: pointer; font-size: 14px; }
.btn-reset:hover { background: #f5f5f5; }
.btn-export { padding: 9px 16px; border: 1px solid #52c41a; border-radius: 6px; background: #f6ffed; color: #389e0d; cursor: pointer; font-size: 14px; }
.btn-export:hover { background: #d9f7be; }
.demo-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 10px;
  background: #f7fbff;
  border: 1px solid #d9ebff;
  border-radius: 6px;
}
.demo-toggle-label {
  font-size: 13px;
  color: #23415e;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.demo-select {
  min-width: 132px;
  flex: 1;
  max-width: 180px;
  padding: 6px 10px;
  border: 1px solid #b8d8ff;
  border-radius: 6px;
  background: #fff;
  color: #23415e;
  font-size: 12px;
}
.demo-select:focus {
  outline: none;
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}
.demo-select:disabled {
  background: #f3f4f7;
  color: #8c97a4;
  border-color: #d8dde7;
  cursor: not-allowed;
}
.btn-load-demo {
  border: 1px solid #1677ff;
  border-radius: 6px;
  background: #1677ff;
  color: #fff;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.btn-load-demo:disabled {
  opacity: 0.6;
  cursor: default;
}
.demo-error {
  margin: 0 0 8px;
  color: #d93025;
  font-size: 12px;
}
.demo-hint {
  margin: 0 0 8px;
  color: #5d6b7b;
  font-size: 12px;
}
.gantt-toggle { margin-bottom: 10px; font-size: 14px; color: #333; }
.gantt-hint { font-size: 13px; color: #888; margin: 0; }
.gantt-field-mapper { display: flex; flex-direction: column; gap: 8px; }
.gantt-opts-divider { font-size: 12px; color: #888; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb; }
.gantt-opt-row { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; user-select: none; }
.gantt-field-row { display: flex; align-items: center; gap: 8px; }
.gf-label { width: 100px; font-size: 13px; color: #333; flex-shrink: 0; }
.req { color: #e53e3e; }
.gf-select { flex: 1; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px; }
.wb-chart-area {
  flex: 1;
  min-width: 0;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: 16px;
  gap: 12px;
}
.wb-chart-area.gantt-mode {
  min-height: 560px;
}
.wb-chart-area.normal-mode {
  min-height: 560px;
}
.preview-panel {
  border: 1px solid #d8e5f3;
  border-radius: 8px;
  background: #fbfdff;
  flex-shrink: 0;
  min-width: 0;
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e7eef6;
}
.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: #253445;
}
.preview-sub {
  font-size: 12px;
  color: #6b7a89;
}
.preview-table-wrap {
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  max-height: 220px;
  overflow-y: auto;
}
.preview-table {
  border-collapse: collapse;
  font-size: 12px;
  min-width: 100%;
}
.preview-table th,
.preview-table td {
  border: 1px solid #d9d9d9;
  padding: 4px 8px;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-table th {
  background: #f5f8fb;
  font-weight: 600;
}
.chart-stage {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  position: relative;
}
.wb-chart-area.gantt-mode .chart-stage {
  min-height: 560px;
}
.wb-chart-area.normal-mode .chart-stage {
  min-height: 560px;
}
.chart-stage > * {
  width: 100%;
  height: 100%;
}
.chart-placeholder { color: #bbb; font-size: 15px; text-align: center; }
@media (max-width: 860px) {
  .wb-body { flex-direction: column; padding: 16px; }
  .wb-panel { width: 100%; }
  .wb-chart-area { width: 100%; }
  .wb-chart-area.gantt-mode { min-height: 560px; }
  .wb-chart-area.normal-mode { min-height: 560px; }
  .demo-toggle-row { flex-direction: column; align-items: stretch; }
}
</style>
