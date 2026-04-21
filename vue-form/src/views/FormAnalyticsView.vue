<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChartCanvas from '@/components/analytics/ChartCanvas.vue'
import ChartOptionsPanel from '@/components/analytics/ChartOptionsPanel.vue'
import FieldMapper from '@/components/analytics/FieldMapper.vue'
import ChartToolbar from '@/components/analytics/ChartToolbar.vue'
import GanttChart, { type GanttTask, type GanttStats } from '@/components/analytics/GanttChart.vue'

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

interface SchemaField {
  name: string
  label: string
  type: string
  required?: boolean
  system?: boolean
}

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref('')
const formTitle = ref('')
const headers = ref<string[]>([])
const fields = ref<SchemaField[]>([])
const definitions = ref<ChartDefinition[]>([])
const recommendedKinds = ref<string[]>([])

const chartKind = ref('')
const chartTitle = ref('')
const fieldConfig = ref<Record<string, any>>({})
const optionConfig = ref<Record<string, any>>({})
const ganttConfig = ref<Record<string, string>>({})
const isGanttMode = ref(false)

const building = ref(false)
const buildError = ref('')
const chartOption = ref<Record<string, any> | null>(null)
const ganttData = ref<{ tasks: GanttTask[]; stats: GanttStats } | null>(null)
const chartRef = ref<InstanceType<typeof ChartCanvas>>()
const ganttRef = ref<InstanceType<typeof GanttChart>>()

const formName = computed(() => String(route.params.formName ?? ''))

const currentDef = computed(() => definitions.value.find(d => d.kind === chartKind.value))
const canBuild = computed(() => {
  if (!chartKind.value && !isGanttMode.value) return false
  if (isGanttMode.value) {
    return !!(ganttConfig.value['taskCol'] && ganttConfig.value['startCol'] && ganttConfig.value['endCol'])
  }
  const required = currentDef.value?.fields.filter(f => f.required) ?? []
  return required.every(f => fieldConfig.value[f.key])
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

async function fetchSchema() {
  loading.value = true
  error.value = ''
  chartOption.value = null
  buildError.value = ''
  try {
    const res = await fetch(`/api/admin/analytics/forms/${encodeURIComponent(formName.value)}/schema`, {
      credentials: 'include'
    })
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(msg || `获取表单 schema 失败 (${res.status})`)
    }
    const data = await res.json()
    formTitle.value = data.formTitle ?? data.formName ?? formName.value
    headers.value = Array.isArray(data.headers) ? data.headers : []
    fields.value = Array.isArray(data.fields) ? data.fields : []
    definitions.value = Array.isArray(data.definitions) ? data.definitions : []
    recommendedKinds.value = Array.isArray(data.recommendedCharts) ? data.recommendedCharts : []

    const firstRecommended = recommendedKinds.value.find(k => definitions.value.some(d => d.kind === k))
    chartKind.value = firstRecommended ?? definitions.value[0]?.kind ?? ''
    fieldConfig.value = {}
    optionConfig.value = {}
    chartTitle.value = formTitle.value
  } catch (e: any) {
    error.value = e.message ?? '加载失败'
  } finally {
    loading.value = false
  }
}

async function buildFromForm() {
  building.value = true
  buildError.value = ''
  chartOption.value = null
  ganttData.value = null
  try {
    if (isGanttMode.value) {
      const body = { config: ganttConfig.value, fields: [] as string[] }
      const res = await fetch(`/api/admin/analytics/forms/${encodeURIComponent(formName.value)}/gantt/build`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error((await res.text()) || `构建失败 (${res.status})`)
      const data = await res.json()
      ganttData.value = data.gantt
    } else {
      const selectedFields = new Set<string>()
      Object.values(fieldConfig.value).forEach(v => {
        if (typeof v === 'string' && v) {
          selectedFields.add(v)
          return
        }
        if (Array.isArray(v)) {
          v.forEach(item => {
            if (typeof item === 'string' && item) selectedFields.add(item)
          })
        }
      })

      const mergedV2Config = {
        ...fieldConfig.value,
        ...optionConfig.value,
        title: chartTitle.value || undefined,
      }

      const body = {
        chartKind: chartKind.value,
        config: toLegacyConfig(mergedV2Config),
        fields: Array.from(selectedFields)
      }

      const res = await fetch(`/api/admin/analytics/forms/${encodeURIComponent(formName.value)}/build`, {
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
    buildError.value = e.message ?? '构建失败'
  } finally {
    building.value = false
  }
}

function exportPNG() {
  if (isGanttMode.value) ganttRef.value?.exportPNG()
  else chartRef.value?.exportPNG()
}

watch(() => route.params.formName, fetchSchema)
onMounted(fetchSchema)
</script>

<template>
  <div class="form-analytics-page">
    <header class="fa-header">
      <div>
        <h1>表单分析：{{ formTitle || formName }}</h1>
        <p class="fa-sub">直接使用 SQLite 已有提交数据建图，无需上传文件</p>
      </div>
      <div class="fa-header-actions">
        <button class="btn-back" @click="router.push('/admin/analytics')">上传分析</button>
        <button class="btn-back" @click="router.push('/admin')">返回后台</button>
      </div>
    </header>

    <div v-if="loading" class="state">加载中…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>

    <div v-else class="fa-body">
      <section class="fa-left">
        <div class="panel">
          <h3>图表配置</h3>
          <label class="gantt-toggle">
            <input type="checkbox" v-model="isGanttMode" @change="() => { chartOption = null; ganttData = null }" />
            &nbsp;甘特图模式
          </label>
          <ChartOptionsPanel
            v-if="!isGanttMode"
            :definitions="definitions"
            v-model="chartKind"
            v-model:title="chartTitle"
            v-model:config="optionConfig"
          />
        </div>

        <div class="panel">
          <h3>字段映射</h3>
          <FieldMapper
            v-if="!isGanttMode"
            :headers="headers"
            :chart-kind="chartKind"
            :definitions="definitions"
            v-model="fieldConfig"
          />
          <div v-else class="gantt-field-mapper">
            <div v-for="f in GANTT_FIELDS" :key="f.key" class="gantt-field-row">
              <label class="gf-label">{{ f.label }}<span v-if="f.required" class="req">*</span></label>
              <select class="gf-select" v-model="ganttConfig[f.key]">
                <option value="">— 不映射 —</option>
                <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>

        <div class="panel">
          <p v-if="buildError" class="error-text">{{ buildError }}</p>
          <div class="actions">
            <button class="btn-build" :disabled="building || !canBuild" @click="buildFromForm">
              {{ building ? '生成中…' : '生成图表' }}
            </button>
            <button v-if="chartOption || ganttData" class="btn-export" @click="exportPNG">导出 PNG</button>
          </div>
        </div>
      </section>

      <section class="fa-right">
        <div v-if="!chartOption && !ganttData && !building" class="placeholder">选择映射后点击「生成图表」</div>
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
.form-analytics-page {
  min-height: 100vh;
  background: #f6f8fb;
  padding: 20px;
}

.fa-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.fa-header h1 {
  margin: 0;
  font-size: 22px;
}

.fa-sub {
  margin: 6px 0 0;
  color: #666;
  font-size: 14px;
}

.fa-header-actions {
  display: flex;
  gap: 10px;
}

.btn-back {
  border: 1px solid #d9d9d9;
  background: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}

.state {
  text-align: center;
  color: #666;
  margin-top: 50px;
}

.state.error {
  color: #d33;
}

.fa-body {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
}

.fa-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel {
  background: #fff;
  border: 1px solid #e7e9ef;
  border-radius: 12px;
  padding: 14px;
}

.panel h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.actions {
  display: flex;
  gap: 10px;
}

.btn-build {
  flex: 1;
  border: none;
  background: #1777ff;
  color: #fff;
  border-radius: 8px;
  padding: 10px;
  font-weight: 600;
  cursor: pointer;
}

.btn-build:disabled {
  background: #adc8ff;
  cursor: not-allowed;
}

.btn-export {
  border: 1px solid #52c41a;
  background: #f6ffed;
  color: #237804;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
}

.error-text {
  color: #d4380d;
  margin: 0 0 10px;
  font-size: 13px;
}

.fa-right {
  background: #fff;
  border: 1px solid #e7e9ef;
  border-radius: 12px;
  padding: 16px;
  min-height: 480px;
}

.placeholder {
  text-align: center;
  color: #9aa2b1;
  margin-top: 180px;
}

.gantt-toggle {
  display: block;
  margin-bottom: 10px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
}
.gantt-field-mapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gantt-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gf-label {
  width: 90px;
  font-size: 13px;
  color: #333;
  flex-shrink: 0;
}
.req { color: #e53e3e; }
.gf-select {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
}

@media (max-width: 980px) {
  .fa-body {
    grid-template-columns: 1fr;
  }
}
</style>
