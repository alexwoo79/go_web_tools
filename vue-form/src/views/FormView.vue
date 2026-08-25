<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface Field {
  Name: string
  Label: string
  Type: string
  Placeholder: string
  Required: boolean
  Options: string[] | null
  Min: number | null
  Max: number | null
  Step: number | null
  GroupFields?: Field[]
  DefaultRows?: number
  MinRows?: number
  MaxRows?: number
  WeightSumField?: string
  WeightSumLimit?: number | null
}

interface FormDef {
  Name: string
  Title: string
  Description: string
  Fields: Field[]
  WeightSumTotalLimit?: number | null
  SubmissionStatus?: string
  CurrentUser?: {
    username: string
    role: string
    department: string
  }
}

const route = useRoute()
const router = useRouter()
const formDef = ref<FormDef | null>(null)
const formData = ref<Record<string, any>>({})
const loading = ref(true)
const submitting = ref(false)
const submitted = ref(false)
const error = ref('')
const submitError = ref('')
const runningDistanceHint = ref('支持输入小数，最多 3 位，例如 21.097')
const runningDistanceError = ref('')

// 含 repeated_group 表格的表单需要更宽容器，让表格完整展示
const hasRepeatedGroup = computed(() =>
  (formDef.value?.Fields ?? []).some((f) => f.Type === 'repeated_group'),
)

const submissionLocked = computed(() =>
  ['scored', 'approved', 'finalized'].includes(formDef.value?.SubmissionStatus ?? ''),
)

function isShareMode(): boolean {
  return typeof route.params.token === 'string' && route.params.token.trim() !== ''
}

function getFormFetchPath(): string {
  if (isShareMode()) {
    return `/api/public/forms/${route.params.token}`
  }
  return `/api/forms/${route.params.formName}`
}

function getSubmitPath(): string {
  if (isShareMode()) {
    return `/api/public/submit/${route.params.token}`
  }
  return `/api/submit/${route.params.formName}`
}

function parseDurationToSeconds(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null

  const parts = value.split(':').map((p) => p.trim())
  if (parts.length !== 2 && parts.length !== 3) return null
  if (parts.some((p) => p === '' || !/^\d+$/.test(p))) return null

  if (parts.length === 2) {
    const minutes = Number(parts[0])
    const seconds = Number(parts[1])
    if (seconds >= 60) return null
    return minutes * 60 + seconds
  }

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  const seconds = Number(parts[2])
  if (minutes >= 60 || seconds >= 60) return null
  return hours * 3600 + minutes * 60 + seconds
}

function updateAveragePace() {
  if (!formDef.value) return

  const hasPaceFields = formDef.value.Fields.some((f) => f.Name === 'running_distance')
    && formDef.value.Fields.some((f) => f.Name === 'total_time')
    && formDef.value.Fields.some((f) => f.Name === 'average_pace')
  if (!hasPaceFields) return

  const distanceRaw = formData.value.running_distance
  const distance = typeof distanceRaw === 'number' ? distanceRaw : Number(distanceRaw)
  const totalSeconds = parseDurationToSeconds(formData.value.total_time)

  if (!Number.isFinite(distance) || distance <= 0 || totalSeconds === null || totalSeconds <= 0) {
    formData.value.average_pace = ''
    return
  }

  const paceSeconds = Math.round(totalSeconds / distance)
  const paceMinutes = Math.floor(paceSeconds / 60)
  const remainSeconds = paceSeconds % 60
  formData.value.average_pace = `${paceMinutes}:${String(remainSeconds).padStart(2, '0')}`
}

function isReadonlyField(field: Field): boolean {
  return field.Name === 'average_pace'
}

function isRunningDistanceField(field: Field): boolean {
  return field.Name === 'running_distance'
}

function getNumberStep(field: Field): string | number {
  if (isRunningDistanceField(field)) return '0.001'
  return field.Step ?? 'any'
}

function validateRunningDistance(raw: unknown): string {
  if (raw === '' || raw === null || raw === undefined) return ''
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return '跑步距离必须是有效数字'
  if (value <= 0) return '跑步距离必须大于 0'

  const scaled = value * 1000
  if (Math.abs(scaled-Math.round(scaled)) > 1e-9) {
    return '跑步距离最多保留 3 位小数'
  }
  return ''
}

function updateRunningDistanceFeedback() {
  const validationError = validateRunningDistance(formData.value.running_distance)
  runningDistanceError.value = validationError

  if (validationError) {
    runningDistanceHint.value = '示例：21.097（公里）'
    return
  }

  const raw = formData.value.running_distance
  if (raw === '' || raw === null || raw === undefined) {
    runningDistanceHint.value = '支持输入小数，最多 3 位，例如 21.097'
    return
  }

  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    runningDistanceHint.value = '示例：21.097（公里）'
    return
  }
  runningDistanceHint.value = `当前距离：${value.toFixed(3)} 公里`
}

onMounted(async () => {
  try {
    const res = await fetch(getFormFetchPath())
    if (!res.ok) {
      if (res.status === 410) {
        const data = await res.json()
        throw new Error(data.error || '该表单已到期，停止收集')
      }
      if (res.status === 404) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '分享链接无效或表单不存在')
      }
      throw new Error('表单不存在')
    }
    formDef.value = await res.json()
    // 初始化表单数据
    for (const f of formDef.value!.Fields) {
      if (f.Type === 'checkbox') {
        formData.value[f.Name] = []
      } else if (f.Type === 'range') {
        // slider 默认取最小值，确保初始就显示动态分值
        formData.value[f.Name] = f.Min ?? 0
      } else if (f.Type === 'repeated_group') {
        formData.value[f.Name] = createGroupRows(f)
      } else {
        formData.value[f.Name] = ''
      }
    }
    prefillFromCurrentUser()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

watch(
  () => [formData.value.running_distance, formData.value.total_time, formDef.value?.Name],
  () => {
    updateRunningDistanceFeedback()
    updateAveragePace()
  },
)

async function submit() {
  submitError.value = ''
  updateRunningDistanceFeedback()
  if (runningDistanceError.value) {
    submitError.value = runningDistanceError.value
    return
  }
  const weightError = checkWeightSums()
  if (weightError) {
    submitError.value = weightError
    return
  }
  const status = formDef.value?.SubmissionStatus
  if (submissionLocked.value) {
    submitError.value = '该考核已进行评分/审核，无法重新提交'
    return
  }
  const msg = status === 'submitted'
    ? '您已提交过该表单，再次提交将覆盖上一次（仅保留最后一次），确认覆盖吗？'
    : '确认提交该表单吗？提交后将无法修改。'
  if (!window.confirm(msg)) {
    return
  }
  submitting.value = true
  try {
    const res = await fetch(getSubmitPath(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSubmitPayload()),
    })
    if (res.ok) {
      submitted.value = true
    } else {
      const data = await res.json()
      if (res.status === 410) {
        submitError.value = data.error || '该表单已到期，停止收集'
        return
      }
      if (res.status === 401) {
        submitError.value = data.error || '请先登录'
        if (!isShareMode()) {
          setTimeout(() => router.push('/login'), 700)
        }
        return
      }
      submitError.value = data.error || '提交失败，请重试'
    }
  } catch {
    submitError.value = '网络错误，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function createGroupRows(field: Field): Record<string, any>[] {
  const count = Math.max(1, field.DefaultRows ?? 1)
  return Array.from({ length: count }, () => createGroupRow(field))
}

function createGroupRow(field: Field): Record<string, any> {
  const row: Record<string, any> = {}
  for (const gf of field.GroupFields ?? []) {
    row[gf.Name] = gf.Type === 'checkbox' ? [] : ''
  }
  return row
}

function groupRows(field: Field): Record<string, any>[] {
  const rows = formData.value[field.Name]
  return Array.isArray(rows) ? rows : []
}

function rgColClass(gf: Field): string {
  if (gf.Type === 'number' || gf.Type === 'range' || gf.Type === 'date' || gf.Type === 'time') return 'rg-num'
  if (gf.Type === 'textarea') return 'rg-textarea'
  return ''
}

function addGroupRow(field: Field) {
  const rows = groupRows(field)
  if (field.MaxRows && rows.length >= field.MaxRows) return
  rows.push(createGroupRow(field))
}

function removeGroupRow(field: Field, idx: number) {
  const rows = groupRows(field)
  const min = Math.max(0, field.MinRows ?? 1)
  if (rows.length <= min) return
  rows.splice(idx, 1)
}

// 表格内「单项权重」求和（配置了 WeightSumField 时）
function weightSum(field: Field): number {
  let sum = 0
  for (const row of groupRows(field)) {
    const v = Number(row[field.WeightSumField ?? ''])
    if (Number.isFinite(v)) sum += v
  }
  return sum
}

// 校验各表格权重上限，以及两个表格权重合计 ≤ 1
function checkWeightSums(): string {
  if (!formDef.value) return ''
  const totalLimit = formDef.value.WeightSumTotalLimit ?? 1
  let total = 0
  for (const f of formDef.value.Fields) {
    if (f.Type !== 'repeated_group' || !f.WeightSumField) continue
    const sum = weightSum(f)
    total += sum
    if (f.WeightSumLimit != null && sum > f.WeightSumLimit + 1e-9) {
      return `${f.Label} 权重合计 ${sum.toFixed(3)} 超过上限 ${f.WeightSumLimit}，请调整单项权重`
    }
  }
  if (total > totalLimit + 1e-9) {
    return `两个表格的权重合计 ${total.toFixed(3)} 超过上限 ${totalLimit}，请调整单项权重`
  }
  return ''
}

function hasWeightFields(): boolean {
  return (formDef.value?.Fields ?? []).some((f) => f.Type === 'repeated_group' && !!f.WeightSumField)
}

function totalWeightSum(): number {
  if (!formDef.value) return 0
  let total = 0
  for (const f of formDef.value.Fields) {
    if (f.Type !== 'repeated_group' || !f.WeightSumField) continue
    total += weightSum(f)
  }
  return total
}

function groupRowEmpty(row: Record<string, any>): boolean {
  return Object.values(row).every((v) =>
    v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0),
  )
}

// 预填：当前登录用户的姓名/部门自动填入匹配字段
function prefillFromCurrentUser() {
  const cu = formDef.value?.CurrentUser
  if (!cu) return
  for (const f of formDef.value?.Fields ?? []) {
    if (f.Type === 'repeated_group') continue
    const isName = f.Name === 'xing_ming' || f.Name === 'name' || f.Name === 'username' || f.Label.includes('姓名') || f.Label.includes('用户名')
    const isDept = f.Name === 'bu_men' || f.Name === 'department' || f.Label.includes('部门')
    if (isName && !formData.value[f.Name]) formData.value[f.Name] = cu.username
    if (isDept && cu.department && !formData.value[f.Name]) formData.value[f.Name] = cu.department
  }
}

// 提交前过滤：去掉完全为空的表格行，避免空行触发必填校验或写入脏数据
function buildSubmitPayload(): Record<string, any> {
  const payload: Record<string, any> = { ...formData.value }
  for (const f of formDef.value?.Fields ?? []) {
    if (f.Type === 'repeated_group' && Array.isArray(payload[f.Name])) {
      payload[f.Name] = (payload[f.Name] as Record<string, any>[]).filter((r) => !groupRowEmpty(r))
    }
  }
  return payload
}

function getRangeValue(field: Field): number {
  const raw = formData.value[field.Name]
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  if (typeof raw === 'string' && raw !== '') {
    const parsed = Number(raw)
    if (!Number.isNaN(parsed)) return parsed
  }
  return field.Min ?? 0
}

function getRangeBounds(field: Field): { min: number; max: number } {
  const rawMin = Number(field.Min ?? 0)
  const rawMax = Number(field.Max ?? 100)
  const min = Number.isFinite(rawMin) ? rawMin : 0
  const max = Number.isFinite(rawMax) ? rawMax : 100

  if (max <= min) {
    return { min, max: min + 1 }
  }
  return { min, max }
}

function getRangeTicks(field: Field): number[] {
  const { min, max } = getRangeBounds(field)
  const span = max - min
  const segments = span <= 10 && Number.isInteger(span) ? Math.max(1, Math.min(10, span)) : 5
  const step = span / segments

  return Array.from({ length: segments + 1 }, (_, i) => {
    const value = min + step * i
    return Number.isInteger(value) ? value : Number(value.toFixed(1))
  })
}
</script>

<template>
  <div class="page">
    <header class="site-header">
      <a href="/" @click.prevent="router.push('/')">← 返回首页</a>
    </header>

    <main class="container" :class="{ 'container-wide': hasRepeatedGroup }">
      <div v-if="loading" class="state-msg">加载中…</div>
      <div v-else-if="error" class="state-msg error">{{ error }}</div>

      <!-- 提交成功 -->
      <div v-else-if="submitted" class="success-card">
        <div class="success-icon">✓</div>
        <h2>提交成功！</h2>
        <p>感谢您的填写，数据已保存。</p>
        <button @click="router.push(isShareMode() ? '/login' : '/')">{{ isShareMode() ? '返回登录页' : '返回首页' }}</button>
      </div>

      <!-- 表单 -->
      <div v-else-if="formDef" class="form-card">
        <h1>{{ formDef.Title }}</h1>
        <p v-if="formDef.Description" class="desc">{{ formDef.Description }}</p>
        <div v-if="formDef.SubmissionStatus === 'submitted'" class="submit-banner info">
          您已提交过该表单。再次提交将覆盖上一次提交，仅保留最后一次。
        </div>
        <div v-else-if="submissionLocked" class="submit-banner warn">
          该考核已进行评分 / 审核，无法重新提交。
        </div>

        <form @submit.prevent="submit">
          <div
            v-for="field in formDef.Fields"
            :key="field.Name"
            class="field"
          >
            <label :for="field.Name">
              {{ field.Label }}
              <span v-if="field.Required" class="required">*</span>
              <span v-if="field.Type === 'range'" class="range-inline-value">
                {{ getRangeValue(field) }} / {{ getRangeBounds(field).max }}
              </span>
            </label>

            <!-- textarea -->
            <textarea
              v-if="field.Type === 'textarea'"
              :id="field.Name"
              v-model="formData[field.Name]"
              :placeholder="field.Placeholder"
              :required="field.Required"
              rows="4"
            />

            <!-- select -->
            <select
              v-else-if="field.Type === 'select'"
              :id="field.Name"
              v-model="formData[field.Name]"
              :required="field.Required"
            >
              <option value="">请选择…</option>
              <option v-for="opt in field.Options" :key="opt" :value="opt">{{ opt }}</option>
            </select>

            <!-- radio -->
            <div v-else-if="field.Type === 'radio'" class="option-group">
              <label v-for="opt in field.Options" :key="opt" class="option-label">
                <input type="radio" :name="field.Name" :value="opt" v-model="formData[field.Name]" :required="field.Required" />
                {{ opt }}
              </label>
            </div>

            <!-- checkbox -->
            <div v-else-if="field.Type === 'checkbox'" class="option-group">
              <label v-for="opt in field.Options" :key="opt" class="option-label">
                <input type="checkbox" :value="opt" v-model="formData[field.Name]" />
                {{ opt }}
              </label>
            </div>

            <!-- number -->
            <template v-else-if="field.Type === 'number'">
              <input
                :id="field.Name"
                type="number"
                v-model.number="formData[field.Name]"
                :placeholder="field.Placeholder"
                :required="field.Required"
                :min="field.Min ?? undefined"
                :max="field.Max ?? undefined"
                :step="getNumberStep(field)"
                :readonly="isReadonlyField(field)"
                :class="{ 'input-invalid': isRunningDistanceField(field) && !!runningDistanceError }"
              />
              <p v-if="isRunningDistanceField(field) && runningDistanceError" class="field-inline-error">
                {{ runningDistanceError }}
              </p>
              <p v-else-if="isRunningDistanceField(field)" class="field-inline-hint">
                {{ runningDistanceHint }}
              </p>
            </template>

            <!-- range slider -->
            <div v-else-if="field.Type === 'range'" class="range-wrap">
              <input
                :id="field.Name"
                type="range"
                v-model.number="formData[field.Name]"
                :required="field.Required"
                :min="getRangeBounds(field).min"
                :max="getRangeBounds(field).max"
              />

              <div class="range-ticks" aria-hidden="true">
                <span v-for="tick in getRangeTicks(field)" :key="`${field.Name}-${tick}`">{{ tick }}</span>
              </div>
            </div>

            <!-- repeated_group 可增删行表格 -->
            <div v-else-if="field.Type === 'repeated_group'" class="repeated-group">
              <div class="rg-table-wrap">
                <table class="rg-table">
                  <thead>
                    <tr>
                      <th v-for="gf in field.GroupFields" :key="gf.Name" :class="rgColClass(gf)">
                        {{ gf.Label }}<span v-if="gf.Required" class="required">*</span>
                      </th>
                      <th class="rg-op-col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, ri) in groupRows(field)" :key="ri">
                      <td v-for="gf in field.GroupFields" :key="gf.Name" :class="rgColClass(gf)">
                        <textarea
                          v-if="gf.Type === 'textarea'"
                          v-model="row[gf.Name]"
                          rows="2"
                        />
                        <select
                          v-else-if="gf.Type === 'select'"
                          v-model="row[gf.Name]"
                        >
                          <option value="">请选择…</option>
                          <option v-for="opt in gf.Options" :key="opt" :value="opt">{{ opt }}</option>
                        </select>
                        <div v-else-if="gf.Type === 'checkbox'" class="option-group rg-checkbox">
                          <label v-for="opt in gf.Options" :key="opt" class="option-label">
                            <input type="checkbox" :value="opt" v-model="row[gf.Name]" />
                            {{ opt }}
                          </label>
                        </div>
                        <input
                          v-else
                          :type="gf.Type || 'text'"
                          v-model="row[gf.Name]"
                          :min="gf.Min ?? undefined"
                          :max="gf.Max ?? undefined"
                          :step="gf.Step ?? (gf.Type === 'number' ? 'any' : undefined)"
                        />
                      </td>
                      <td class="rg-op-col">
                        <button type="button" class="rg-btn-remove" @click="removeGroupRow(field, ri)">删除</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="rg-actions">
                <button
                  type="button"
                  class="rg-btn-add"
                  :disabled="!!field.MaxRows && groupRows(field).length >= field.MaxRows"
                  @click="addGroupRow(field)"
                >
                  ＋ 添加一行
                </button>
              </div>
              <div
                v-if="field.WeightSumField"
                class="rg-weight-sum"
                :class="{ 'over': weightSum(field) > (field.WeightSumLimit ?? Infinity) + 1e-9 }"
              >
                权重合计：{{ weightSum(field).toFixed(3) }}
                <template v-if="field.WeightSumLimit != null">（上限 {{ field.WeightSumLimit }}）</template>
              </div>
            </div>

            <!-- email / tel / date / default text -->
            <input
              v-else
              :id="field.Name"
              :type="field.Type || 'text'"
              v-model="formData[field.Name]"
              :placeholder="field.Placeholder"
              :required="field.Required"
              :readonly="isReadonlyField(field)"
            />
          </div>

          <div
            v-if="hasWeightFields()"
            class="total-weight"
            :class="{ over: totalWeightSum() > (formDef.WeightSumTotalLimit ?? 1) + 1e-9 }"
          >
            权重合计（全部表格）：{{ totalWeightSum().toFixed(3) }} / 上限
            {{ formDef.WeightSumTotalLimit ?? 1 }}
          </div>

          <p v-if="submitError" class="error-msg">{{ submitError }}</p>

          <div class="actions">
            <button type="submit" :disabled="submitting || submissionLocked" class="btn-submit">
              {{ submitting ? '提交中…' : (submissionLocked ? '已锁定' : '提交') }}
            </button>
          </div>
        </form>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; background: transparent; }

.site-header {
  background: rgba(255, 255, 255, .74);
  border-bottom: 1px solid rgba(209, 213, 219, .7);
  backdrop-filter: blur(8px);
  padding: .9rem 2rem;
}
.site-header a { color: var(--brand-600); text-decoration: none; font-size: .9rem; }

.container { max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
.container-wide { max-width: min(1400px, 96vw); width: 100%; }

.state-msg { text-align: center; color: #888; padding: 4rem 0; }
.state-msg.error { color: #e53e3e; }

.success-card {
  text-align: center;
  background: linear-gradient(180deg, #ffffff 0%, #fcfefe 100%);
  border-radius: 16px;
  padding: 3rem 2rem;
  border: 1px solid #e6edf0;
}
.success-icon {
  width: 64px; height: 64px; border-radius: 50%;
  background: #48bb78; color: #fff; font-size: 2rem;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 1rem;
}
.success-card h2 { margin: 0 0 .5rem; color: #1a1a2e; }
.success-card p { color: #666; margin-bottom: 1.5rem; }
.success-card button {
  background: var(--brand-600); color: #fff; border: none;
  padding: .65rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: .95rem;
}

.form-card {
  background: linear-gradient(180deg, #ffffff 0%, #fcfdff 100%);
  width: 100%;
  border-radius: 16px;
  padding: 2rem;
  border: 1px solid #e6ebf3;
  box-shadow: 0 8px 20px rgba(77, 95, 164, .06);
}
.form-card h1 { margin: 0 0 .4rem; font-size: 1.5rem; color: #1a1a2e; }
.desc { color: #666; margin: 0 0 1.8rem; font-size: .9rem; }
.submit-banner {
  padding: .6rem .8rem;
  border-radius: 8px;
  font-size: .84rem;
  margin: -0.6rem 0 1.2rem;
  line-height: 1.5;
}
.submit-banner.info { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; }
.submit-banner.warn { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }

.field { margin-bottom: 1.2rem; }
.field > label { display: block; font-size: .88rem; font-weight: 500; color: #333; margin-bottom: .45rem; }
.required { color: #e53e3e; margin-left: .15rem; }

.range-inline-value {
  margin-left: .45rem;
  font-size: .8rem;
  color: var(--brand-700);
  background: var(--bg-soft-blue);
  border: 1px solid rgba(107, 124, 255, .2);
  border-radius: 999px;
  padding: .12rem .48rem;
  font-weight: 600;
}

.field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
select,
textarea {
  width: 100%;
  min-height: 44px;
  padding: .65rem .85rem;
  border: 1.5px solid #d9dfeb;
  border-radius: 8px;
  font-size: .95rem;
  box-sizing: border-box;
  transition: border-color .2s;
  font-family: inherit;
  background: #fff;
  line-height: 1.25;
  appearance: none;
}

/* 时间输入在不同浏览器下默认高度差异较大，单独统一内边距 */
.field input[type="time"] {
  padding-top: .6rem;
  padding-bottom: .6rem;
}

.range-wrap {
  padding: .3rem 0 0;
}

.field input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 22px;
  border: none;
  padding: 0;
  margin: 0;
  background: transparent;
  outline: none;
  appearance: none;
  cursor: pointer;
}

.field input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, #dbe3ff, #e8edff);
}

.field input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--brand-600);
  border: 2px solid #fff;
  margin-top: -5px;
  box-shadow: 0 3px 8px rgba(63, 88, 214, .28);
}

.field input[type="range"]::-moz-range-track {
  height: 4px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(90deg, #dbe3ff, #e8edff);
}

.field input[type="range"]::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, #b8c8ff, #d5ddff);
}

.field input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--brand-600);
  border: 2px solid #fff;
  box-shadow: 0 3px 8px rgba(63, 88, 214, .28);
}

.range-ticks {
  display: flex;
  justify-content: space-between;
  margin-top: .2rem;
  padding: 0 1px;
  color: var(--text-muted);
  font-size: .78rem;
}

.range-ticks span {
  position: relative;
  min-width: 2ch;
  text-align: center;
  line-height: 1.1;
}

.range-ticks span::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -9px;
  width: 1px;
  height: 6px;
  background: #c8d2ea;
  transform: translateX(-50%);
}

input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--brand-600);
  box-shadow: 0 0 0 3px rgba(75, 104, 242, .13);
}

.input-invalid {
  border-color: #e53e3e !important;
  box-shadow: 0 0 0 3px rgba(229, 62, 62, .12) !important;
}

.field-inline-hint {
  margin: .35rem 0 0;
  color: #5f6b83;
  font-size: .82rem;
}

.field-inline-error {
  margin: .35rem 0 0;
  color: #e53e3e;
  font-size: .82rem;
}

.option-group { display: flex; flex-wrap: wrap; gap: .6rem; }
.option-label {
  display: flex; align-items: center; gap: .35rem;
  font-size: .9rem; cursor: pointer; color: #333;
}

.error-msg { color: #e53e3e; font-size: .85rem; margin-bottom: .8rem; }

.actions { margin-top: 1.5rem; }
.btn-submit {
  width: 100%;
  padding: .8rem;
  background: var(--brand-600);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background .2s;
}
.btn-submit:hover:not(:disabled) { background: var(--brand-700); }
.btn-submit:disabled { opacity: .6; cursor: not-allowed; }

/* repeated_group 表格 */
.repeated-group { width: 100%; }

.rg-table-wrap {
  overflow-x: auto;
  border: 1px solid #dbe3f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(77, 95, 164, .07);
}

.rg-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: .82rem;
}

.rg-table th,
.rg-table td {
  border-bottom: 1px solid #edf1f8;
  border-right: 1px solid #edf1f8;
  padding: 0;
  text-align: left;
  vertical-align: top;
}

.rg-table th:last-child,
.rg-table td:last-child { border-right: none; }

.rg-table thead th {
  background: #f3f6fd;
  color: #2f3b5b;
  font-weight: 600;
  white-space: nowrap;
  padding: .5rem .6rem;
  letter-spacing: .01em;
  text-align: center;
  vertical-align: middle;
}

.rg-table tbody tr:nth-child(even) { background: #fbfcfe; }
.rg-table tbody tr:hover { background: #f3f7ff; }
.rg-table tbody tr:last-child td { border-bottom: none; }

.rg-table td.rg-num { text-align: center; }
.rg-table td.rg-textarea { vertical-align: top; }

.rg-table input,
.rg-table select,
.rg-table textarea {
  width: 100%;
  min-width: 96px;
  box-sizing: border-box;
  padding: .5rem .55rem !important;
  border: none !important;
  border-radius: 0 !important;
  font-size: .82rem !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  min-height: 30px !important;
  line-height: 1.4 !important;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}

.rg-table td.rg-num input { text-align: center; }
.rg-table textarea { resize: none; min-height: 36px; }

.rg-table td:focus-within {
  background: #eef4ff;
  box-shadow: inset 3px 0 0 rgba(34, 80, 187, .22);
}

.rg-table input[type="number"]::-webkit-inner-spin-button,
.rg-table input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.rg-checkbox {
  display: flex;
  flex-wrap: wrap;
  gap: .25rem .6rem;
  align-items: center;
  padding: .45rem .55rem;
}

.rg-table td.rg-op-col {
  width: 84px;
  text-align: center;
  padding: .4rem .4rem;
  vertical-align: middle;
}

.rg-btn-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .2rem;
  padding: .18rem .55rem;
  border: 1px solid #fecaca;
  border-radius: 999px;
  background: #fff;
  color: #dc2626;
  font-size: .76rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background .15s, color .15s;
}

.rg-btn-remove:hover { background: #fef2f2; }
.rg-btn-remove::before { content: '✕'; font-size: .68rem; line-height: 1; }

.rg-actions { margin-top: .55rem; }

.rg-btn-add {
  width: 100%;
  padding: .5rem;
  border: 1px dashed #b9c7e8;
  border-radius: 10px;
  background: #fbfcff;
  color: #2250bb;
  font-size: .84rem;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}

.rg-btn-add:hover { background: #f0f4ff; border-color: #93aee8; }
.rg-btn-add:disabled { opacity: .5; cursor: not-allowed; }

.rg-weight-sum {
  margin-top: .5rem;
  display: flex;
  justify-content: flex-end;
  gap: .35rem;
  font-size: .8rem;
  color: #475569;
}

.rg-weight-sum.over {
  color: #dc2626;
  font-weight: 600;
}

.total-weight {
  margin-top: .6rem;
  padding: .5rem .7rem;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: .82rem;
  color: #334155;
}

.total-weight.over {
  color: #dc2626;
  font-weight: 600;
  background: #fef2f2;
  border-color: #fecaca;
}
</style>
