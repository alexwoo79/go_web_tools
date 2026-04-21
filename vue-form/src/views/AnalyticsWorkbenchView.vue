<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DatasetUpload from '@/components/analytics/DatasetUpload.vue'
import ChartOptionsPanel from '@/components/analytics/ChartOptionsPanel.vue'
import FieldMapper from '@/components/analytics/FieldMapper.vue'
import ChartCanvas from '@/components/analytics/ChartCanvas.vue'
import ChartToolbar from '@/components/analytics/ChartToolbar.vue'
import GanttChart, { type GanttTask, type GanttStats } from '@/components/analytics/GanttChart.vue'
import type { UploadedDataset } from '@/components/analytics/DatasetUpload.vue'

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
const ganttConfig = ref<Record<string, string>>({})

const building = ref(false)
const buildError = ref('')
const chartOption = ref<Record<string, any> | null>(null)
const ganttData = ref<{ tasks: GanttTask[]; stats: GanttStats } | null>(null)

const chartRef = ref<InstanceType<typeof ChartCanvas>>()
const ganttRef = ref<InstanceType<typeof GanttChart>>()

const isGanttMode = ref(false)

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

onMounted(async () => {
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
})

function onUploaded(payload: UploadedDataset) {
  dataset.value = payload
  fieldConfig.value = {}
  ganttConfig.value = {}
  buildError.value = ''
  chartOption.value = null
  ganttData.value = null
}

async function build() {
  if (!dataset.value || !chartKind.value) return
  building.value = true
  buildError.value = ''
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
      const body = {
        datasetId: dataset.value.id,
        chartKind: chartKind.value,
        schemaVersion: 2,
        configV2: {
          ...fieldConfig.value,
          title: chartTitle.value || undefined,
        },
        // Keep legacy payload for backward compatibility during migration window.
        config: { ...fieldConfig.value, title: chartTitle.value || undefined }
      }
      const res = await fetch('/api/admin/analytics/build', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error((await res.text()) || `构建失败 (${res.status})`)
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
  chartOption.value = null
  ganttData.value = null
  buildError.value = ''
  fieldConfig.value = {}
  ganttConfig.value = {}
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
        <div class="wb-section" :class="{ done: step > 1 }">
          <div class="section-title">
            <span class="step-badge">1</span>
            上传数据
          </div>
          <DatasetUpload @uploaded="onUploaded" />
        </div>

        <div class="wb-section" :class="{ disabled: step < 2, done: step > 2 }">
          <div class="section-title">
            <span class="step-badge">2</span>
            选择图表类型
          </div>
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
          />
          <p v-else class="gantt-hint">甘特图将使用下方字段映射渲染任务时间线</p>
        </div>

        <div class="wb-section" :class="{ disabled: step < 3 }">
          <div class="section-title">
            <span class="step-badge">3</span>
            字段映射
          </div>
          <!-- Regular chart field mapper -->
          <FieldMapper
            v-if="!isGanttMode"
            :headers="dataset?.headers ?? []"
            :chart-kind="chartKind"
            :definitions="definitions"
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

      <section class="wb-chart-area">
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
          />
          <ChartCanvas
            v-else-if="!isGanttMode"
            ref="chartRef"
            :option="chartOption"
            :loading="building"
          />
        </ChartToolbar>
      </section>
    </div>
  </div>
</template>

<style scoped>
.workbench { min-height: 100vh; background: #f5f6fa; display: flex; flex-direction: column; }
.wb-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: #fff; border-bottom: 1px solid #e8e8e8; }
.wb-title { margin: 0; font-size: 20px; font-weight: 600; color: #1a1a1a; }
.btn-back { padding: 6px 16px; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; color: #555; cursor: pointer; font-size: 14px; }
.btn-back:hover { background: #f5f5f5; }
.wb-loading, .wb-error { padding: 60px; text-align: center; color: #888; font-size: 16px; }
.wb-error { color: #e53e3e; }
.wb-body { display: flex; flex: 1; gap: 20px; padding: 24px; align-items: flex-start; }
.wb-panel { width: 380px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; }
.wb-section { background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 16px; transition: opacity 0.2s; }
.wb-section.disabled { opacity: 0.45; pointer-events: none; }
.wb-section.done { border-color: #b7eb8f; background: #fcfff5; }
.section-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 12px; }
.step-badge { width: 22px; height: 22px; border-radius: 50%; background: #1677ff; color: #fff; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
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
.gantt-toggle { margin-bottom: 10px; font-size: 14px; color: #333; }
.gantt-hint { font-size: 13px; color: #888; margin: 0; }
.gantt-field-mapper { display: flex; flex-direction: column; gap: 8px; }
.gantt-field-row { display: flex; align-items: center; gap: 8px; }
.gf-label { width: 100px; font-size: 13px; color: #333; flex-shrink: 0; }
.req { color: #e53e3e; }
.gf-select { flex: 1; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px; }
.wb-chart-area { flex: 1; background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; min-height: 460px; display: flex; align-items: center; justify-content: center; padding: 24px; }
.chart-placeholder { color: #bbb; font-size: 15px; text-align: center; }
@media (max-width: 860px) {
  .wb-body { flex-direction: column; padding: 16px; }
  .wb-panel { width: 100%; }
  .wb-chart-area { min-height: 320px; width: 100%; }
}
</style>
