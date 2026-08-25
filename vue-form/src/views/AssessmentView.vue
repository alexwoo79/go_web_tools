<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, roleLabel } from '../stores/auth'

interface GroupField {
  Name: string
  Label: string
  Type: string
  Required?: boolean
  Options?: string[] | null
  Min?: number | null
  Max?: number | null
}

interface FormField {
  Name: string
  Label: string
  Type: string
  GroupFields?: GroupField[]
  WeightSumField?: string
}

interface MyItem {
  periodId: number
  periodName: string
  formName: string
  status: string
  totalScore: number | null
  recordId?: number
  reviewedBy?: string
  scores?: Record<string, { role: string; username: string; score: number; weight: number }>
}

interface ReviewItem {
  id: number
  username: string
  department: string
  formName: string
  formTitle: string
  status: string
  totalScore: number | null
  reviewedBy: string
  currentRole?: string
  canScore?: boolean
}

interface ResultItem {
  id: number
  username: string
  department: string
  formName: string
  formTitle: string
  status: string
  totalScore: number | null
  reviewedBy: string
  updatedAt: string
  reviewers: ReviewerItem[]
  grade?: string
  gradeLabel?: string
  rank?: number
  hasGrade?: boolean
}

interface ResultSummary {
  total: number
  finalized: number
  grading: number
  avgScore: number
  gradeConfig?: GradeConfig
}

interface PeriodItem {
  ID: number
  Name: string
  FormName: string
  Status: string
  CreatedAt: string
  participantRoles?: string[]
  reviewers?: ReviewerConfig[]
  gradeConfig?: GradeConfig
}

// 考核定义中的评分人配置（role + weight）
interface ReviewerConfig {
  role: string
  weight: number
}

interface GradeRule {
  grade: string
  label: string
  ratio: number
}

interface GradeConfig {
  enabled: boolean
  group_by: string // department | all
  rules: GradeRule[]
}

// 评审详情里展示的评分人进度
interface ReviewerItem {
  id: string
  role: string
  roleLabel: string
  weight: number
  done: boolean
  score: number
  username: string
  details?: Record<string, number[]>
}

interface ScoringConfig {
  mode: string
  group: string
  scoreField: string
  weightField: string
}

interface DetailData {
  record: any
  form: {
    Name: string
    Title: string
    Description: string
    Fields: FormField[]
    Scoring?: ScoringConfig | null
  }
  data: Record<string, any>
  canNext: boolean
  next: string
  scores: Record<string, { role: string; username: string; score: number; weight: number }>
  reviewers: ReviewerItem[]
}

interface FormOption {
  Name: string
  Title: string
}

interface PermissionDept {
  name: string
  participants: number
  deptHead: string
  divisionLeaders: string[]
  topLeaders: string[]
}

interface PermissionLeader {
  username: string
  role: string
  departments: string[]
  scopeEmpty: boolean
}

interface PermissionSummary {
  departments: number
  participants: number
  withHead: number
  divisionLeaders: number
  topLeaders: number
  gaps: number
}

const STATUS_LABELS: Record<string, string> = {
  submitted: '已填报',
  grading: '评分中',
  scored: '已评分',
  approved: '已审核',
  finalized: '已确认',
  none: '未填报',
}

const REVIEW_ROLES = new Set(['dept_head', 'senior_leader', 'division_leader', 'top_leader', 'admin'])
const ROLE_LABELS: Record<string, string> = {
  staff: '职员',
  dept_head: '部门负责人',
  senior_leader: '部门以上领导',
  division_leader: '分管领导',
  top_leader: '主管领导',
  admin: '管理员',
  user: '普通用户',
}

const PARTICIPANT_ROLE_OPTIONS = [
  { value: 'staff', label: '职员' },
  { value: 'dept_head', label: '部门负责人' },
  { value: 'senior_leader', label: '部门以上领导' },
  { value: 'division_leader', label: '分管领导' },
  { value: 'top_leader', label: '主管领导' },
  { value: 'user', label: '普通用户' },
]
const CHAIN_ROLE_OPTIONS = [
  { value: '', label: '无（跳过）' },
  { value: 'dept_head', label: '部门负责人' },
  { value: 'senior_leader', label: '部门以上领导' },
  { value: 'division_leader', label: '分管领导' },
  { value: 'top_leader', label: '主管领导' },
]
const DEFAULT_REVIEWERS = (): ReviewerConfig[] => [
  { role: 'dept_head', weight: 0.4 },
  { role: 'division_leader', weight: 0.3 },
  { role: 'top_leader', weight: 0.3 },
]
const DEFAULT_GRADES = (): GradeConfig => ({
  enabled: false,
  group_by: 'department',
  rules: [
    { grade: 'A', label: '优秀', ratio: 0.2 },
    { grade: 'B', label: '良好', ratio: 0.3 },
    { grade: 'C', label: '合格', ratio: 0.4 },
    { grade: 'D', label: '待改进', ratio: 0.1 },
  ],
})

const auth = useAuthStore()
const router = useRouter()
const tab = ref<'mine' | 'review' | 'results' | 'periods' | 'permission'>('mine')
const mine = ref<MyItem[]>([])
const review = ref<ReviewItem[]>([])
const results = ref<ResultItem[]>([])
const resultsSummary = ref<ResultSummary | null>(null)
const resultsSort = ref<{ key: string; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' })
const resultsFilter = ref<{ dept: string; status: string; grade: string }>({ dept: '', status: '', grade: '' })
const periodName = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

const periods = ref<PeriodItem[]>([])
const forms = ref<FormOption[]>([])
const periodForm = ref<{ name: string; formName: string; participantRoles: string[]; reviewers: ReviewerConfig[]; gradeConfig: GradeConfig }>({
  name: '',
  formName: '',
  participantRoles: [],
  reviewers: DEFAULT_REVIEWERS(),
  gradeConfig: DEFAULT_GRADES(),
})
const periodLoading = ref(false)
const periodSaving = ref(false)
const editingId = ref<number | null>(null)

const permission = ref<{
  summary: PermissionSummary
  departments: PermissionDept[]
  divisionLeaders: PermissionLeader[]
  topLeaders: PermissionLeader[]
  gaps: string[]
} | null>(null)
const permissionLoading = ref(false)

const showDetail = ref(false)
const detailLoading = ref(false)
const detail = ref<DetailData | null>(null)
const detailError = ref('')
const saving = ref(false)
const formTitle = ref('')
const detailScore = ref<number | null>(null)
const itemScores = ref<Record<string, any>>({})

const isReviewer = computed(() => REVIEW_ROLES.has(auth.user?.role ?? ''))
const isMineTab = computed(() => tab.value === 'mine')
const isAdmin = computed(() => auth.user?.role === 'admin')

// 评审详情：按已评分的评分人计算加权汇总
const reviewSummary = computed(() => {
  if (!detail.value) return null
  const rs = detail.value.reviewers ?? []
  const terms: { label: string; weight: number; score: number; weighted: number }[] = []
  let num = 0
  let den = 0
  for (const r of rs) {
    if (!r.done) continue
    const w = Number(r.weight) || 0
    const s = Number(r.score) || 0
    num += s * w
    den += w
    terms.push({ label: r.roleLabel, weight: w, score: s, weighted: s * w })
  }
  const total = den > 0 ? num / den : null
  return { terms, total, den }
})

const isItemMode = computed(() => {
  const m = detail.value?.form.Scoring?.mode
  return m === 'item_avg' || m === 'item_weighted'
})

const scoringGroups = computed<FormField[]>(() => {
  if (!detail.value || !isItemMode.value) return []
  const s = detail.value.form.Scoring
  if (!s?.scoreField) return []
  return (detail.value.form.Fields ?? []).filter(
    (f) =>
      f.Type === 'repeated_group' &&
      (!s.group || f.Name === s.group) &&
      (f.GroupFields ?? []).some((g) => g.Name === s.scoreField),
  )
})

const sortedResults = computed(() => {
  const f = resultsFilter.value
  const arr = results.value.filter((it) => {
    if (f.dept && it.department !== f.dept) return false
    if (f.status && it.status !== f.status) return false
    if (f.grade && it.grade !== f.grade) return false
    return true
  })
  const { key, dir } = resultsSort.value
  return arr.slice().sort((a, b) => {
    let cmp = 0
    if (key === 'score') cmp = (a.totalScore ?? -1) - (b.totalScore ?? -1)
    else if (key === 'name') cmp = a.username.localeCompare(b.username)
    else if (key === 'dept') cmp = a.department.localeCompare(b.department)
    else if (key === 'status') cmp = a.status.localeCompare(b.status)
    else if (key === 'grade') cmp = (a.grade || 'Z').localeCompare(b.grade || 'Z')
    else cmp = (a.rank ?? 0) - (b.rank ?? 0)
    return dir === 'asc' ? cmp : -cmp
  })
})

const gradeSummary = computed(() => {
  const out: { grade: string; label: string; count: number; ratio: number }[] = []
  const cfg = resultsSummary.value?.gradeConfig as GradeConfig | undefined
  const rules = cfg?.rules ?? []
  const finalized = results.value.filter((it) => it.hasGrade)
  for (const rule of rules) {
    const count = finalized.filter((it) => it.grade === rule.grade).length
    out.push({ grade: rule.grade, label: rule.label, count, ratio: finalized.length ? count / finalized.length : 0 })
  }
  return out
})

const deptOptions = computed(() => Array.from(new Set(results.value.map((i) => i.department).filter(Boolean))))

function toggleResultsSort(key: string) {
  if (resultsSort.value.key === key) {
    resultsSort.value.dir = resultsSort.value.dir === 'asc' ? 'desc' : 'asc'
  } else {
    resultsSort.value = { key, dir: key === 'name' || key === 'dept' ? 'asc' : 'desc' }
  }
}

function sortIcon(key: string) {
  if (resultsSort.value.key !== key) return ''
  return resultsSort.value.dir === 'asc' ? '▲' : '▼'
}

async function exportResults() {
  try {
    const res = await fetch('/api/assessment/results/export')
    if (!res.ok) throw new Error('导出失败')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '考核结果.csv'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    error.value = e.message || '导出失败'
  }
}

async function loadMine() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/assessment/me')
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '加载失败')
    mine.value = payload.items ?? []
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadReview() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/assessment/review')
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '加载失败')
    review.value = payload.items ?? []
    periodName.value = payload.period?.name ?? ''
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadResults() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/assessment/results')
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '加载失败')
    results.value = payload.items ?? []
    resultsSummary.value = payload.summary ?? null
    periodName.value = payload.period?.name ?? ''
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadPeriods() {
  periodLoading.value = true
  try {
    const res = await fetch('/api/admin/assessment-periods')
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '加载失败')
    periods.value = payload.items ?? []
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    periodLoading.value = false
  }
}

async function loadFormOptions() {
  try {
    const res = await fetch('/api/forms')
    const payload = await res.json().catch(() => ({}))
    if (res.ok && Array.isArray(payload)) {
      forms.value = payload
    }
  } catch {
    forms.value = []
  }
}

async function savePeriod() {
  if (!periodForm.value.name.trim() || !periodForm.value.formName) {
    error.value = '请填写考核定义名称并选择自评表单'
    return
  }
  periodSaving.value = true
  error.value = ''
  success.value = ''
  try {
    const isEdit = editingId.value != null
    const url = isEdit ? `/api/admin/assessment-periods/${editingId.value}` : '/api/admin/assessment-periods'
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: periodForm.value.name.trim(),
        formName: periodForm.value.formName,
        participantRoles: periodForm.value.participantRoles,
        reviewers: periodForm.value.reviewers,
        gradeConfig: periodForm.value.gradeConfig,
      }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '创建失败')
    success.value = isEdit
      ? `考核定义「${periodForm.value.name.trim()}」已更新`
      : `考核定义「${periodForm.value.name.trim()}」已创建并启用`
    periodForm.value = { name: '', formName: '', participantRoles: [], reviewers: DEFAULT_REVIEWERS(), gradeConfig: DEFAULT_GRADES() }
    editingId.value = null
    loadPeriods()
  } catch (e: any) {
    error.value = e.message || '创建失败'
  } finally {
    periodSaving.value = false
  }
}

function editPeriod(p: PeriodItem) {
  editingId.value = p.ID
  periodForm.value = {
    name: p.Name,
    formName: p.FormName,
    participantRoles: p.participantRoles ?? [],
    reviewers: p.reviewers ?? DEFAULT_REVIEWERS(),
    gradeConfig: p.gradeConfig ?? DEFAULT_GRADES(),
  }
  success.value = ''
  error.value = ''
}

function cancelEdit() {
  editingId.value = null
  periodForm.value = { name: '', formName: '', participantRoles: [], reviewers: DEFAULT_REVIEWERS(), gradeConfig: DEFAULT_GRADES() }
}

function toggleParticipant(role: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const cur = [...periodForm.value.participantRoles]
  const i = cur.indexOf(role)
  if (checked && i === -1) cur.push(role)
  if (!checked && i !== -1) cur.splice(i, 1)
  periodForm.value.participantRoles = cur
}

function addReviewer() {
  periodForm.value.reviewers.push({ role: '', weight: 0.3 })
}

function removeReviewer(idx: number) {
  if (periodForm.value.reviewers.length <= 1) return
  periodForm.value.reviewers.splice(idx, 1)
}

function addGradeRule() {
  periodForm.value.gradeConfig.rules.push({ grade: '', label: '', ratio: 0 })
}

function removeGradeRule(idx: number) {
  periodForm.value.gradeConfig.rules.splice(idx, 1)
}

async function deletePeriod(p: PeriodItem) {
  if (!window.confirm(`确认删除考核定义「${p.Name}」吗？该定义下的考核记录会一并删除，且不可恢复。`)) return
  error.value = ''
  success.value = ''
  const res = await fetch(`/api/admin/assessment-periods/${p.ID}`, { method: 'DELETE' })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    error.value = payload.error || '删除失败'
    return
  }
  success.value = `考核定义「${p.Name}」已删除`
  if (editingId.value === p.ID) cancelEdit()
  loadPeriods()
}

async function resetRecord(item: ReviewItem) {
  if (!window.confirm(`确认重置「${item.username}」的考核记录吗？将恢复为已填报状态，员工可重新提交。`)) return
  error.value = ''
  success.value = ''
  const res = await fetch(`/api/admin/assessment-records/${item.id}/reset`, { method: 'POST' })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    error.value = payload.error || '重置失败'
    return
  }
  success.value = `已恢复「${item.username}」为已填报状态`
  loadReview()
  loadMine()
}

async function loadPermission() {
  permissionLoading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/assessment/permission-overview')
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '加载失败')
    permission.value = {
      summary: {
        departments: Number(payload.summary?.departments ?? 0),
        participants: Number(payload.summary?.participants ?? 0),
        withHead: Number(payload.summary?.withHead ?? 0),
        divisionLeaders: Number(payload.summary?.divisionLeaders ?? 0),
        topLeaders: Number(payload.summary?.topLeaders ?? 0),
        gaps: Number(payload.summary?.gaps ?? 0),
      },
      departments: Array.isArray(payload.departments)
        ? payload.departments.map((d: any) => ({
            name: String(d?.name ?? ''),
            participants: Number(d?.participants ?? 0),
            deptHead: String(d?.deptHead ?? ''),
            divisionLeaders: Array.isArray(d?.divisionLeaders) ? d.divisionLeaders : [],
            topLeaders: Array.isArray(d?.topLeaders) ? d.topLeaders : [],
          }))
        : [],
      divisionLeaders: normalizePermissionLeaders(payload.divisionLeaders),
      topLeaders: normalizePermissionLeaders(payload.topLeaders),
      gaps: Array.isArray(payload.gaps) ? payload.gaps.map(String) : [],
    }
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    permissionLoading.value = false
  }
}

function normalizePermissionLeaders(value: unknown): PermissionLeader[] {
  if (!Array.isArray(value)) return []
  return value.map((leader: any) => ({
    username: String(leader?.username ?? ''),
    role: String(leader?.role ?? ''),
    departments: Array.isArray(leader?.departments) ? leader.departments.map(String) : [],
    scopeEmpty: Boolean(leader?.scopeEmpty),
  }))
}

function switchTab(t: 'mine' | 'review' | 'results' | 'periods' | 'permission') {
  tab.value = t
  if (t === 'mine') loadMine()
  else if (t === 'review') loadReview()
  else if (t === 'results') loadResults()
  else if (t === 'periods') {
    loadPeriods()
    loadFormOptions()
  } else loadPermission()
}

function rowData(row: Record<string, any>, gf: GroupField): any {
  return row[gf.Name] ?? ''
}

// 我的考核：按已评分人计算加权汇总
function mineSummary(item: MyItem) {
  const sc = (item.scores ?? {}) as Record<string, { role: string; score: number; weight: number }>
  const terms = Object.values(sc).filter((s) => s && typeof s.score === 'number')
  let num = 0
  let den = 0
  for (const s of terms) {
    const w = Number(s.weight) || 0
    const v = Number(s.score) || 0
    num += v * w
    den += w
  }
  const total = den > 0 ? num / den : null
  return { terms, total }
}

async function openDetail(item: ReviewItem) {
  showDetail.value = true
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  detailScore.value = null
  formTitle.value = item.formTitle
  try {
    const res = await fetch(`/api/assessment/records/${item.id}`)
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '加载失败')
    detail.value = payload
    // 初始化逐项打分输入（item 模式）
    itemScores.value = {}
    for (const g of scoringGroups.value) {
      const rows = (payload.data[g.Name] as any[]) || []
      itemScores.value[g.Name] = rows.map(() => '')
    }
    // 若当前用户已评分，回填分数便于查看/微调展示
    const stage = (payload.reviewers ?? []).find((r: ReviewerItem) => r.role === auth.user?.role)
    if (stage?.done) detailScore.value = stage.score
  } catch (e: any) {
    detailError.value = e.message || '加载失败'
  } finally {
    detailLoading.value = false
  }
}

async function saveReview() {
  if (!detail.value) return
  let body: Record<string, any>
  if (isItemMode.value) {
    const items: Record<string, number[]> = {}
    for (const g of scoringGroups.value) {
      const rows = (detail.value.data[g.Name] as any[]) || []
      const vals = itemScores.value[g.Name] || []
      const arr: number[] = []
      for (let i = 0; i < rows.length; i++) {
        const v = Number(vals[i])
        if (vals[i] === undefined || vals[i] === null || vals[i] === '' || isNaN(v) || v < 0 || v > 100) {
          detailError.value = `请为「${g.Label}」第 ${i + 1} 项填写 0-100 的评分`
          return
        }
        arr.push(v)
      }
      items[g.Name] = arr
    }
    if (Object.keys(items).length === 0) {
      detailError.value = '请为每个评分项填写分数'
      return
    }
    body = { items }
  } else {
    const scoreRaw = detailScore.value
    if (typeof scoreRaw !== 'number' || isNaN(scoreRaw) || scoreRaw < 0 || scoreRaw > 100) {
      detailError.value = '请填写 0-100 的评分'
      return
    }
    body = { score: scoreRaw }
  }
  saving.value = true
  detailError.value = ''
  try {
    const res = await fetch(`/api/assessment/records/${detail.value.record.ID}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '保存失败')
    success.value = `评审成功：${STATUS_LABELS[payload.next] ?? payload.next}（加权总分 ${payload.totalScore ?? '—'}）`
    showDetail.value = false
    loadReview()
    loadMine()
  } catch (e: any) {
    detailError.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadMine()
  if (isReviewer.value) loadReview()
  if (isAdmin.value) {
    loadPeriods()
    loadFormOptions()
  }
})
</script>

<template>
  <div class="page">
    <header class="site-header">
      <a href="/portal" @click.prevent="router.push('/portal')">← 返回主页</a>
      <span v-if="auth.user" class="user-badge">{{ auth.user.username }}（{{ roleLabel(auth.user.role) }}）</span>
    </header>

    <main class="container">
      <h1 class="title">绩效考核</h1>

      <nav class="tabs">
        <button class="tab" :class="{ active: isMineTab }" @click="switchTab('mine')">我的考核</button>
        <button v-if="isReviewer" class="tab" :class="{ active: tab === 'review' }" @click="switchTab('review')">
          待办评审
        </button>
        <button v-if="isAdmin" class="tab" :class="{ active: tab === 'results' }" @click="switchTab('results')">
          考核结果
        </button>
        <button v-if="isAdmin" class="tab" :class="{ active: tab === 'periods' }" @click="switchTab('periods')">
          考核定义
        </button>
        <button v-if="isAdmin" class="tab" :class="{ active: tab === 'permission' }" @click="switchTab('permission')">
          权限总览
        </button>
      </nav>

      <p v-if="error" class="msg error">{{ error }}</p>
      <p v-if="success" class="msg ok">{{ success }}</p>

      <!-- 我的考核 -->
      <div v-if="isMineTab">
        <div v-if="loading" class="state-msg">加载中…</div>
        <div v-else-if="mine.length === 0" class="state-msg">暂无考核周期</div>
        <div v-else class="mine-list">
          <article v-for="item in mine" :key="item.periodId" class="mine-card">
            <div class="mine-main">
              <span class="mine-period">{{ item.periodName }}</span>
              <span class="mine-form">{{ item.formName }}</span>
            </div>
            <div class="mine-meta">
              <span class="status-pill" :class="item.status">{{ STATUS_LABELS[item.status] ?? item.status }}</span>
              <span v-if="item.totalScore != null" class="score">总分：{{ Number(item.totalScore).toFixed(2) }}</span>
              <span v-if="item.reviewedBy" class="reviewer">确认：{{ item.reviewedBy }}</span>
            </div>
            <div v-if="item.scores && Object.keys(item.scores).length" class="mine-scores">
              <span v-for="(s, key) in item.scores" :key="key" class="mine-score-chip">
                {{ ROLE_LABELS[s.role] ?? s.role }} {{ s.score }}分
              </span>
            </div>
            <div v-if="mineSummary(item).total != null" class="mine-summary">
              <span class="mine-sum-title">{{ item.status === 'finalized' ? '最终汇总' : '当前汇总' }}：</span>
              <span v-for="t in mineSummary(item).terms" :key="t.role" class="mine-sum-term">
                {{ ROLE_LABELS[t.role] ?? t.role }} {{ Number(t.score).toFixed(2) }}×{{ Number(t.weight).toFixed(1) }}
              </span>
              <span class="mine-sum-total">＝ {{ mineSummary(item).total?.toFixed(2) }} 分</span>
            </div>
            <div class="mine-actions">
              <button
                v-if="item.status === 'none' || item.status === 'submitted'"
                class="btn-primary"
                @click="router.push(`/forms/${item.formName}`)"
              >
                {{ item.status === 'submitted' ? '重新填报' : '去填报' }}
              </button>
            </div>
          </article>
        </div>
      </div>

      <!-- 待办评审 -->
      <div v-else-if="tab === 'review'">
        <p v-if="periodName" class="period-hint">当前考核周期：{{ periodName }}</p>
        <div v-if="loading" class="state-msg">加载中…</div>
        <div v-else-if="review.length === 0" class="state-msg">暂无考核记录</div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>部门</th>
                <th>状态</th>
                <th>总分</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in review" :key="item.id">
                <td>{{ item.username }}</td>
                <td>{{ item.department || '—' }}</td>
                <td><span class="status-pill" :class="item.status">{{ STATUS_LABELS[item.status] ?? item.status }}</span></td>
                <td>{{ item.totalScore != null ? Number(item.totalScore).toFixed(2) : '—' }}</td>
                <td>
                  <button class="btn-outline" @click="openDetail(item)">查看 / 处理</button>
                  <button v-if="isAdmin" class="btn-reset" @click="resetRecord(item)">重置填报</button>
                  <span v-if="!item.canScore" class="hint-inline">
                    {{ item.status === 'finalized' ? '已确认' : (item.currentRole ? '待' + (ROLE_LABELS[item.currentRole] ?? item.currentRole) + '评分' : '等待评分') }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 考核结果（管理员） -->
      <div v-else-if="tab === 'results'">
        <div class="res-toolbar">
          <p v-if="periodName" class="period-hint">当前考核周期：{{ periodName }}</p>
          <div class="res-toolbar-actions">
            <select v-model="resultsFilter.dept" class="filter-select">
              <option value="">全部部门</option>
              <option v-for="d in deptOptions" :key="d" :value="d">{{ d }}</option>
            </select>
            <select v-model="resultsFilter.status" class="filter-select">
              <option value="">全部状态</option>
              <option value="submitted">已填报</option>
              <option value="grading">评分中</option>
              <option value="finalized">已确认</option>
            </select>
            <select v-model="resultsFilter.grade" class="filter-select">
              <option value="">全部等级</option>
              <option v-for="g in gradeSummary" :key="g.grade" :value="g.grade">{{ g.grade }} {{ g.label }}</option>
            </select>
            <button class="btn-primary" @click="exportResults">导出 CSV</button>
          </div>
        </div>
        <div v-if="resultsSummary" class="res-summary">
          <div class="res-card"><span class="res-num">{{ resultsSummary.total }}</span><span class="res-label">参与</span></div>
          <div class="res-card"><span class="res-num">{{ resultsSummary.finalized }}</span><span class="res-label">已确认</span></div>
          <div class="res-card"><span class="res-num">{{ resultsSummary.grading }}</span><span class="res-label">评分中</span></div>
          <div class="res-card"><span class="res-num">{{ Number(resultsSummary.avgScore).toFixed(2) }}</span><span class="res-label">平均分</span></div>
        </div>
        <div v-if="gradeSummary.length && resultsSummary?.gradeConfig?.enabled" class="res-grade-summary">
          <span class="res-grade-title">等级分布</span>
          <span v-for="g in gradeSummary" :key="g.grade" class="res-grade-chip" :class="'g-' + g.grade">
            {{ g.grade }} {{ g.label }} {{ g.count }} 人（{{ (g.ratio * 100).toFixed(0) }}%）
          </span>
        </div>
        <div v-if="loading" class="state-msg">加载中…</div>
        <div v-else-if="sortedResults.length === 0" class="state-msg">暂无匹配记录</div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="sortable" @click="toggleResultsSort('name')">姓名 {{ sortIcon('name') }}</th>
                <th class="sortable" @click="toggleResultsSort('dept')">部门 {{ sortIcon('dept') }}</th>
                <th class="sortable" @click="toggleResultsSort('status')">状态 {{ sortIcon('status') }}</th>
                <th>各评分人</th>
                <th class="sortable" @click="toggleResultsSort('score')">最终得分 {{ sortIcon('score') }}</th>
                <th v-if="resultsSummary?.gradeConfig?.enabled" class="sortable" @click="toggleResultsSort('grade')">等级 {{ sortIcon('grade') }}</th>
                <th v-if="resultsSummary?.gradeConfig?.enabled">名次</th>
                <th class="op-col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in sortedResults" :key="item.id">
                <td class="res-name">{{ item.username }}</td>
                <td>{{ item.department || '—' }}</td>
                <td><span class="status-pill" :class="item.status">{{ STATUS_LABELS[item.status] ?? item.status }}</span></td>
                <td>
                  <div class="res-reviewers">
                    <span v-for="r in item.reviewers" :key="r.id" class="res-chip" :class="{ done: r.done }">
                      {{ r.roleLabel }} {{ r.done ? Number(r.score).toFixed(1) : '未评' }}
                    </span>
                  </div>
                </td>
                <td class="res-total">{{ item.totalScore != null ? Number(item.totalScore).toFixed(2) : '—' }}</td>
                <td v-if="resultsSummary?.gradeConfig?.enabled" class="res-grade">
                  <span v-if="item.hasGrade" class="grade-badge" :class="'g-' + item.grade">{{ item.grade }} {{ item.gradeLabel }}</span>
                  <span v-else class="hint-inline">—</span>
                </td>
                <td v-if="resultsSummary?.gradeConfig?.enabled">{{ item.hasGrade ? item.rank : '—' }}</td>
                <td class="op-col">
                  <button class="btn-outline" @click="openDetail(item as any)">查看</button>
                  <button v-if="isAdmin" class="btn-reset" @click="resetRecord(item as any)">重置</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 考核定义（管理员） -->
      <div v-else-if="tab === 'periods'">
        <section class="period-create">
          <h3>{{ editingId != null ? '编辑考核定义' : '新建考核定义' }}</h3>
          <div class="def-form">
            <label class="def-row">
              <span class="def-label">名称</span>
              <input v-model="periodForm.name" class="create-input" type="text" placeholder="周期名称（如：2026Q3）" />
            </label>
            <label class="def-row">
              <span class="def-label">自评表单</span>
              <select v-model="periodForm.formName" class="role-select def-select">
                <option value="">选择自评表单…</option>
                <option v-for="f in forms" :key="f.Name" :value="f.Name">{{ f.Title }}（{{ f.Name }}）</option>
              </select>
            </label>
            <div class="def-row">
              <span class="def-label">参与角色</span>
              <div class="mgmt-checkbox-list">
                <label v-for="r in PARTICIPANT_ROLE_OPTIONS" :key="r.value" class="mgmt-check">
                  <input type="checkbox" :checked="periodForm.participantRoles.includes(r.value)" @change="toggleParticipant(r.value, $event)" />{{ r.label }}
                </label>
              </div>
              <p class="def-hint">留空 = 全员（非管理员）参与本次考核</p>
            </div>
            <div class="def-row">
              <span class="def-label">评分人</span>
              <div class="chain-row">
                <div v-for="(rv, idx) in periodForm.reviewers" :key="idx" class="chain-item">
                  <select v-model="rv.role"><option v-for="r in CHAIN_ROLE_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option></select>
                  <input v-model.number="rv.weight" type="number" min="0" max="1" step="0.05" class="weight-input" />
                  <button v-if="periodForm.reviewers.length > 1" class="btn-remove" @click="removeReviewer(idx)">删除</button>
                </div>
                <button class="btn-add-reviewer" @click="addReviewer">＋ 添加评分人</button>
              </div>
              <p class="def-hint">按顺序评分：每行是一个评分人（角色 + 权重，默认 0.4/0.3/0.3）。提交人若正好是某行角色，会自动跳过该行并由其余人归一化汇总；列表为空则该记录提交后直接完成。</p>
            </div>
            <div class="def-row">
              <span class="def-label">等级分布</span>
              <div class="grade-editor">
                <label class="grade-toggle">
                  <input type="checkbox" v-model="periodForm.gradeConfig.enabled" /> 启用 A/B/C/D 强制分布
                </label>
                <label class="grade-group">
                  比较组
                  <select v-model="periodForm.gradeConfig.group_by">
                    <option value="department">按部门</option>
                    <option value="all">全员</option>
                  </select>
                </label>
                <div v-if="periodForm.gradeConfig.enabled" class="grade-rules">
                  <div v-for="(rule, idx) in periodForm.gradeConfig.rules" :key="idx" class="grade-rule">
                    <input v-model="rule.grade" class="grade-code" placeholder="A" />
                    <input v-model="rule.label" class="grade-label-input" placeholder="优秀" />
                    <input v-model.number="rule.ratio" type="number" min="0" max="1" step="0.01" class="weight-input" />
                    <span class="grade-pct">{{ ((Number(rule.ratio) || 0) * 100).toFixed(0) }}%</span>
                    <button class="btn-remove" @click="removeGradeRule(idx)">删除</button>
                  </div>
                  <button class="btn-add-reviewer" @click="addGradeRule">＋ 添加等级</button>
                  <p class="def-hint">依次填等级/名称/比例（如 A 优秀 0.2、B 良好 0.3…）。系统按“已确认”记录的最终得分在比较组内排序后，按比例强制分布；未确认的先不参与。</p>
                </div>
              </div>
            </div>
          </div>
          <div class="create-actions">
            <button v-if="editingId != null" class="btn-close" :disabled="periodSaving" @click="cancelEdit">取消编辑</button>
            <button class="btn-primary" :disabled="periodSaving" @click="savePeriod">
              {{ periodSaving ? '保存中…' : (editingId != null ? '保存修改' : '创建并启用') }}
            </button>
          </div>
        </section>

        <section class="period-list">
          <h3>考核定义列表</h3>
          <div v-if="periodLoading" class="state-msg">加载中…</div>
          <div v-else-if="periods.length === 0" class="state-msg">暂无考核定义</div>
          <table v-else>
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>自评表单</th>
                <th>状态</th>
                <th>创建时间</th>
                <th class="op-col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in periods" :key="p.ID">
                <td>{{ p.ID }}</td>
                <td class="period-name">{{ p.Name }}</td>
                <td>{{ p.FormName }}</td>
                <td>
                  <span class="status-pill" :class="p.Status">{{ p.Status === 'active' ? '进行中' : p.Status }}</span>
                </td>
                <td>{{ p.CreatedAt }}</td>
                <td class="op-col">
                  <button class="btn-edit" @click="editPeriod(p)">编辑</button>
                  <button class="btn-delete" @click="deletePeriod(p)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <!-- 权限总览（管理员） -->
      <div v-else-if="tab === 'permission'">
        <p class="period-hint">由「用户管理的 角色 / 部门 / 管理范围」自动推导，用于校验职责与评分权限。</p>
        <div v-if="permissionLoading" class="state-msg">加载中…</div>
        <div v-else-if="permission">
          <section class="perm-summary">
            <div class="perm-card"><span class="perm-num">{{ permission.summary.departments }}</span><span class="perm-label">部门</span></div>
            <div class="perm-card"><span class="perm-num">{{ permission.summary.participants }}</span><span class="perm-label">参与员工</span></div>
            <div class="perm-card"><span class="perm-num">{{ permission.summary.withHead }}</span><span class="perm-label">已配负责人</span></div>
            <div class="perm-card"><span class="perm-num">{{ permission.summary.divisionLeaders }}</span><span class="perm-label">分管领导</span></div>
            <div class="perm-card"><span class="perm-num">{{ permission.summary.topLeaders }}</span><span class="perm-label">主管领导</span></div>
            <div class="perm-card" :class="{ 'warn': permission.summary.gaps > 0 }"><span class="perm-num">{{ permission.summary.gaps }}</span><span class="perm-label">待处理</span></div>
          </section>

          <section class="perm-block">
            <h3>部门职责</h3>
            <table class="perm-table">
              <thead>
                <tr>
                  <th>部门</th>
                  <th>参与员工</th>
                  <th>部门负责人</th>
                  <th>分管领导</th>
                  <th>主管领导</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in permission.departments" :key="d.name">
                  <td class="perm-name">{{ d.name }}</td>
                  <td class="perm-num-cell">{{ d.participants }}</td>
                  <td><span v-if="d.deptHead" class="perm-person">{{ d.deptHead }}</span><span v-else class="perm-missing">未配置</span></td>
                  <td>{{ d.divisionLeaders.join('、') || '—' }}</td>
                  <td>{{ d.topLeaders.join('、') || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="perm-block">
            <h3>领导管理范围</h3>
            <div class="perm-leaders">
              <div v-for="leader in permission.divisionLeaders" :key="'d-'+leader.username" class="perm-leader">
                <span class="perm-leader-role">分管</span>
                <span class="perm-leader-name">{{ leader.username }}</span>
                <span class="perm-leader-scope" :class="{ 'warn': leader.scopeEmpty }">
                  {{ leader.scopeEmpty ? '未设置（全部部门）' : leader.departments.join('、') }}
                </span>
              </div>
              <div v-for="leader in permission.topLeaders" :key="'t-'+leader.username" class="perm-leader">
                <span class="perm-leader-role">主管</span>
                <span class="perm-leader-name">{{ leader.username }}</span>
                <span class="perm-leader-scope" :class="{ 'warn': leader.scopeEmpty }">
                  {{ leader.scopeEmpty ? '未设置（全部部门）' : leader.departments.join('、') }}
                </span>
              </div>
              <p v-if="!permission.divisionLeaders.length && !permission.topLeaders.length" class="state-msg">暂无分管/主管领导</p>
            </div>
          </section>

          <section v-if="permission.gaps.length" class="perm-block">
            <h3>待处理</h3>
            <ul class="perm-gaps">
              <li v-for="(g, i) in permission.gaps" :key="i">{{ g }}</li>
            </ul>
          </section>
        </div>
      </div>
    </main>

    <!-- 评审详情 -->
    <div v-if="showDetail" class="modal-mask" @click.self="showDetail = false">
      <div class="modal-panel detail-panel">
        <header class="modal-header">
          <h3>{{ formTitle }} - 评审</h3>
          <button class="btn-close" @click="showDetail = false">关闭</button>
        </header>
        <div class="modal-body">
          <div v-if="detailLoading" class="state-msg">加载中…</div>
          <div v-else-if="detailError" class="msg error">{{ detailError }}</div>
          <div v-else-if="detail">
            <div class="info-grid">
              <div v-for="f in detail.form.Fields.filter((x: FormField) => x.Type !== 'repeated_group')" :key="f.Name" class="info-item">
                <label>{{ f.Label }}</label>
                <input :value="detail.data[f.Name] ?? ''" readonly />
              </div>
            </div>
            <p v-if="detail.form.Scoring && detail.form.Scoring.mode" class="scoring-hint">
              评分模式：{{ detail.form.Scoring.mode === 'single' ? '每个领导打一个总分' : (detail.form.Scoring.mode === 'item_weighted' ? '逐项打分（按权重汇总）' : '逐项打分（简单平均）') }}
              <template v-if="detail.form.Scoring.group">（评分项：{{ detail.form.Scoring.group }}）</template>
            </p>

            <div v-for="f in detail.form.Fields.filter((x: FormField) => x.Type === 'repeated_group')" :key="f.Name" class="rg-block">
              <div class="rg-title">{{ f.Label }}</div>
              <div class="rg-wrap">
                <table class="rg-table">
                  <thead>
                    <tr>
                      <th v-for="gf in f.GroupFields" :key="gf.Name">{{ gf.Label }}</th>
                      <th v-if="scoringGroups.includes(f)">评分</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, ri) in (detail.data[f.Name] as any[])" :key="ri">
                      <td v-for="gf in f.GroupFields" :key="gf.Name">
                        <textarea v-if="gf.Type === 'textarea'" :value="rowData(row, gf)" rows="2" readonly />
                        <span v-else class="cell-text">{{ rowData(row, gf) }}</span>
                      </td>
                      <td v-if="scoringGroups.includes(f)" class="score-cell">
                        <input
                          v-if="detail.canNext"
                          v-model="itemScores[f.Name][ri]"
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          class="rg-score-input"
                        />
                        <span v-else class="cell-text">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="rg-sum">
                <template v-if="f.WeightSumField">
                  权重合计：
                  {{
                    ((detail.data[f.Name] as any[] || []).reduce((s: number, r: any) => s + (Number(r[(f.WeightSumField as any)]) || 0), 0)).toFixed(3)
                  }}
                </template>
              </div>
            </div>

            <p v-if="detailError" class="msg error">{{ detailError }}</p>

            <div class="review-panel">
              <h4>评分进度</h4>
              <div class="reviewer-list">
                <div v-for="r in detail.reviewers" :key="r.id" class="reviewer-item">
                  <span class="rev-role">{{ r.roleLabel }}</span>
                  <span class="rev-weight">权重 {{ Number(r.weight).toFixed(1) }}</span>
                  <span v-if="r.done" class="rev-score">得分 {{ Number(r.score).toFixed(2) }}</span>
                  <span v-else class="rev-pending">未评分</span>
                  <span v-if="r.done && r.username" class="rev-user">（{{ r.username }}）</span>
                </div>
              </div>
              <div v-if="reviewSummary && reviewSummary.terms.length" class="rev-summary">
                <div class="rev-sum-title">
                  {{ detail.record.Status === 'finalized' ? '最终汇总' : '当前汇总' }}结果
                </div>
                <div v-for="t in reviewSummary.terms" :key="t.label" class="rev-sum-row">
                  <span class="rs-label">{{ t.label }}</span>
                  <span class="rs-expr">{{ Number(t.score).toFixed(2) }} × {{ Number(t.weight).toFixed(1) }} = {{ Number(t.weighted).toFixed(2) }}</span>
                </div>
                <div class="rev-sum-total">
                  ＝ Σ(得分×权重) ÷ Σ(权重) ＝ <strong>{{ reviewSummary.total?.toFixed(2) }}</strong> 分
                </div>
                <p v-if="reviewSummary.den < 1" class="rev-sum-tip">（按已评分人的权重归一化，未含被跳过的自评层）</p>
              </div>
              <div v-if="detail.canNext && !isItemMode" class="rev-input-row">
                <label for="rev-score">您的总分</label>
                <input id="rev-score" v-model.number="detailScore" type="number" min="0" max="100" step="any" class="score-input" />
                <span class="rev-tip">0-100</span>
              </div>
              <p v-else-if="detail.canNext && isItemMode" class="rev-wait">
                请在下方为每个评分项填写 0-100 的分数，系统将按配置汇总。
              </p>
              <p v-else class="rev-wait">
                当前状态“{{ STATUS_LABELS[detail.record.Status] ?? detail.record.Status }}”，您暂无可操作项。
              </p>
            </div>

            <footer class="detail-actions">
              <button class="btn-close" @click="showDetail = false">取消</button>
              <button
                v-if="detail.canNext"
                class="btn-primary"
                :disabled="saving"
                @click="saveReview"
              >
                {{ saving ? '保存中…' : '提交评分' }}
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; }
.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, .92);
  border-bottom: 1px solid #e5e7eb;
  padding: .8rem 1.4rem;
}
.site-header a { color: var(--brand-600); text-decoration: none; font-size: .9rem; }
.user-badge { font-size: .85rem; color: #475569; }
.container { max-width: 980px; margin: 1.5rem auto; padding: 0 1rem; }
.title { font-size: 1.4rem; margin: 0 0 1rem; }
.tabs { display: flex; gap: .4rem; margin-bottom: 1rem; }
.tab {
  padding: .5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  cursor: pointer;
  font-size: .9rem;
}
.tab.active { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
.msg { font-size: .85rem; margin: .5rem 0; }
.msg.error { color: #dc2626; }
.msg.ok { color: #16a34a; }
.state-msg { text-align: center; color: #94a3b8; padding: 3rem 0; }
.period-hint { color: #64748b; font-size: .85rem; margin-bottom: .6rem; }

.period-create, .period-list {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: .9rem 1rem;
  margin-bottom: .8rem;
}
.period-create h3, .period-list h3 { margin: 0 0 .6rem; font-size: .95rem; }
.period-form { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
.create-input, .role-select {
  height: 34px;
  border-radius: 8px;
  border: 1px solid #d8dff1;
  padding: 0 .6rem;
  font-size: .84rem;
  color: #334155;
  background: #fff;
  outline: none;
}
.period-form .create-input { flex: 1 1 180px; }
.period-form .role-select { flex: 1 1 260px; }
.period-tip { margin: .5rem 0 0; font-size: .78rem; color: #7c89a3; }
.def-form { display: flex; flex-direction: column; gap: .6rem; }
.def-row { display: flex; align-items: flex-start; gap: .6rem; }
.def-label { flex: 0 0 60px; font-size: .8rem; color: #475569; font-weight: 600; padding-top: .5rem; }
.def-select { flex: 1; }
.def-hint { margin: .3rem 0 0; font-size: .74rem; color: #7c89a3; }
.chain-row { display: flex; flex-wrap: wrap; gap: .5rem; }
.chain-item { display: inline-flex; align-items: center; gap: .3rem; font-size: .8rem; color: #334155; }
.chain-item select { height: 32px; border: 1px solid #d8dff1; border-radius: 8px; padding: 0 .4rem; font-size: .8rem; color: #334155; background: #fff; }
.chain-item .weight-input {
  width: 74px; height: 32px; box-sizing: border-box;
  border: 1px solid #d8dff1; border-radius: 8px; padding: 0 .4rem;
  font-size: .8rem; color: #334155; background: #fff;
}
.btn-remove {
  height: 30px; padding: 0 .5rem; border-radius: 6px;
  border: 1px solid #fecaca; background: #fff; color: #dc2626;
  font-size: .76rem; cursor: pointer; white-space: nowrap;
}
.btn-add-reviewer {
  height: 32px; padding: 0 .7rem; border-radius: 8px;
  border: 1px dashed #93aee8; background: #f6f8fd; color: #2250bb;
  font-size: .82rem; cursor: pointer;
}
.btn-add-reviewer:hover { background: #eef3ff; }
.grade-editor { display: flex; flex-direction: column; gap: .5rem; }
.grade-toggle, .grade-group {
  display: inline-flex; align-items: center; gap: .4rem; font-size: .82rem; color: #334155;
}
.grade-group select {
  height: 30px; border: 1px solid #d8dff1; border-radius: 8px; padding: 0 .5rem; font-size: .8rem; color: #334155; background: #fff;
}
.grade-rules { display: flex; flex-direction: column; gap: .4rem; }
.grade-rule { display: flex; align-items: center; gap: .4rem; }
.grade-code, .grade-label-input {
  height: 30px; border: 1px solid #d8dff1; border-radius: 8px; padding: 0 .4rem; font-size: .8rem; color: #334155; background: #fff;
}
.grade-code { width: 52px; text-align: center; }
.grade-label-input { width: 96px; }
.grade-pct { font-size: .76rem; color: #64748b; min-width: 34px; }
.mgmt-checkbox-list { display: flex; flex-wrap: wrap; gap: .3rem .5rem; }
.mgmt-check {
  display: inline-flex; align-items: center; gap: .28rem;
  font-size: .8rem; color: #475569; cursor: pointer;
  background: #f6f8fd; border: 1px solid #e2e8f0; border-radius: 6px;
  padding: .22rem .45rem; user-select: none;
}
.mgmt-check:has(input:checked) { background: #eef3ff; border-color: #93aee8; color: #2250bb; font-weight: 600; }
.mgmt-check input { accent-color: #2250bb; margin: 0; }
.create-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: .7rem; }
.period-name { font-weight: 600; }

.perm-summary {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: .5rem;
  margin-bottom: .8rem;
}
.perm-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .15rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: .7rem .5rem;
}
.perm-card.warn { border-color: #fca5a5; background: #fff5f5; }
.perm-num { font-size: 1.3rem; font-weight: 700; color: #1f2a44; }
.perm-card.warn .perm-num { color: #dc2626; }
.perm-label { font-size: .74rem; color: #64748b; }
.perm-block {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: .8rem 1rem;
  margin-bottom: .8rem;
}
.perm-block h3 { margin: 0 0 .6rem; font-size: .95rem; }
.perm-table { width: 100%; font-size: .84rem; border-collapse: collapse; }
.perm-table th, .perm-table td {
  border-bottom: 1px solid #edf1f8; padding: .5rem .5rem; text-align: left;
}
.perm-table th { background: #f8fafc; color: #475569; white-space: nowrap; }
.perm-name { font-weight: 600; }
.perm-num-cell { text-align: center; }
.perm-person { font-weight: 600; color: #1d4ed8; }
.perm-missing { color: #dc2626; font-weight: 600; }
.perm-leaders { display: flex; flex-direction: column; gap: .4rem; }
.perm-leader { display: flex; align-items: center; gap: .5rem; font-size: .84rem; }
.perm-leader-role {
  flex-shrink: 0;
  padding: .12rem .45rem;
  border-radius: 6px;
  background: #eef3ff;
  color: #2250bb;
  font-size: .74rem;
  font-weight: 600;
}
.perm-leader-name { font-weight: 600; min-width: 72px; }
.perm-leader-scope { color: #475569; }
.perm-leader-scope.warn { color: #dc2626; font-weight: 600; }
.perm-gaps { margin: 0; padding-left: 1.1rem; font-size: .84rem; color: #b91c1c; }
.perm-gaps li { margin: .2rem 0; }
.res-summary {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; margin-bottom: .8rem;
}
.res-toolbar {
  display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap; margin-bottom: .6rem;
}
.res-toolbar .period-hint { margin: 0; }
.res-toolbar-actions { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
.filter-select {
  height: 32px; border: 1px solid #d8dff1; border-radius: 8px; padding: 0 .5rem;
  font-size: .82rem; color: #334155; background: #fff;
}
.res-card {
  display: flex; flex-direction: column; align-items: center; gap: .15rem;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: .7rem .5rem;
}
.res-num { font-size: 1.3rem; font-weight: 700; color: #1f2a44; }
.res-label { font-size: .74rem; color: #64748b; }
.res-name { font-weight: 600; }
.res-reviewers { display: flex; flex-wrap: wrap; gap: .3rem; }
.res-chip {
  padding: .14rem .45rem; border-radius: 6px; font-size: .74rem;
  background: #f6f8fd; color: #64748b; border: 1px solid #e2e8f0;
}
.res-chip.done { background: #eef3ff; color: #2250bb; border-color: #bfdbfe; }
.res-total { font-weight: 700; color: #1d4ed8; white-space: nowrap; }
.res-grade-summary {
  display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
  margin-bottom: .8rem; padding: .5rem .7rem;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
}
.res-grade-title { font-size: .82rem; font-weight: 700; color: #1f2a44; }
.res-grade-chip {
  padding: .18rem .55rem; border-radius: 999px; font-size: .78rem; font-weight: 600;
}
.res-grade-chip.g-A, .grade-badge.g-A { background: #dcfce7; color: #166534; }
.res-grade-chip.g-B, .grade-badge.g-B { background: #dbeafe; color: #1e40af; }
.res-grade-chip.g-C, .grade-badge.g-C { background: #fef3c7; color: #92400e; }
.res-grade-chip.g-D, .grade-badge.g-D { background: #fee2e2; color: #b91c1c; }
.sortable { cursor: pointer; user-select: none; }
.sortable:hover { color: var(--brand-600); }
.res-grade { text-align: center; }
.grade-badge {
  display: inline-block; padding: .14rem .5rem; border-radius: 999px;
  font-size: .76rem; font-weight: 700;
}
.op-col { text-align: center; white-space: nowrap; }
.btn-edit,
.btn-delete {
  height: 26px;
  padding: 0 .6rem;
  border-radius: 6px;
  font-size: .78rem;
  font-weight: 600;
  cursor: pointer;
  margin: .1rem .2rem;
}
.btn-edit {
  border: 1px solid #bfdbfe;
  background: #fff;
  color: var(--brand-600);
}
.btn-edit:hover { background: #eef3ff; }
.btn-delete {
  border: 1px solid #fecaca;
  background: #fff;
  color: #dc2626;
}
.btn-delete:hover { background: #fef2f2; }
.btn-reset {
  height: 26px;
  margin: .1rem .2rem;
  padding: 0 .6rem;
  border-radius: 6px;
  border: 1px solid #fde68a;
  background: #fff;
  color: #b45309;
  font-size: .78rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-reset:hover { background: #fffbeb; }

.mine-list { display: flex; flex-direction: column; gap: .7rem; }
.mine-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .8rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: .9rem 1rem;
  flex-wrap: wrap;
}
.mine-main { display: flex; flex-direction: column; gap: .2rem; }
.mine-period { font-weight: 700; font-size: 1rem; }
.mine-form { color: #64748b; font-size: .8rem; }
.mine-meta { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; }
.score { font-weight: 600; color: #1d4ed8; }
.reviewer { color: #64748b; font-size: .82rem; }
.mine-scores { display: flex; gap: .4rem; flex-wrap: wrap; }
.mine-score-chip {
  padding: .16rem .5rem; border-radius: 6px;
  background: #eef3ff; color: #2250bb; font-size: .76rem;
}
.mine-summary {
  display: flex; align-items: center; gap: .45rem; flex-wrap: wrap;
  font-size: .8rem; color: #475569; margin-top: .2rem;
}
.mine-sum-title { font-weight: 700; color: #1f2a44; }
.mine-sum-term { padding: .1rem .4rem; border-radius: 5px; background: #f6f8fd; color: #334155; font-variant-numeric: tabular-nums; }
.mine-sum-total { font-weight: 700; color: #1d4ed8; }
.mine-actions { display: flex; gap: .5rem; }

.status-pill {
  display: inline-block;
  padding: .18rem .55rem;
  border-radius: 999px;
  font-size: .78rem;
}
.status-pill.submitted { background: #dbeafe; color: #1e40af; }
.status-pill.scored { background: #fef3c7; color: #92400e; }
.status-pill.approved { background: #ede9fe; color: #5b21b6; }
.status-pill.finalized { background: #dcfce7; color: #166534; }
.status-pill.none { background: #f1f5f9; color: #475569; }

.table-wrap { overflow-x: auto; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; }
table { width: 100%; border-collapse: collapse; font-size: .86rem; }
th, td { border-bottom: 1px solid #edf2f7; padding: .6rem .7rem; text-align: left; }
th { background: #f8fafc; color: #475569; white-space: nowrap; }

.btn-primary {
  background: var(--brand-600);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: .5rem .9rem;
  cursor: pointer;
  font-size: .85rem;
}
.btn-primary:disabled { opacity: .55; cursor: not-allowed; }
.btn-outline {
  background: #fff;
  color: var(--brand-600);
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: .4rem .7rem;
  cursor: pointer;
  font-size: .82rem;
}
.hint-inline { color: #94a3b8; font-size: .76rem; margin-left: .4rem; }

.modal-mask {
  position: fixed; inset: 0; z-index: 80;
  display: flex; align-items: center; justify-content: center;
  background: rgba(15, 23, 42, .45); padding: 1rem;
}
.modal-panel {
  width: min(1000px, 96vw); max-height: 90vh;
  display: flex; flex-direction: column;
  background: #fff; border-radius: 12px; overflow: hidden;
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: .9rem 1.1rem; border-bottom: 1px solid #e5e7eb;
}
.modal-header h3 { margin: 0; font-size: 1rem; }
.modal-body { padding: 1rem 1.1rem 1.2rem; overflow-y: auto; }
.btn-close {
  background: #fff; border: 1px solid #d1d5db; border-radius: 8px;
  padding: .4rem .8rem; cursor: pointer; font-size: .84rem;
}

.info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .7rem; margin-bottom: 1rem; }
.scoring-hint { margin: 0 0 .6rem; font-size: .78rem; color: #7c89a3; }
.info-item label { display: block; font-size: .78rem; color: #64748b; margin-bottom: .2rem; }
.info-item input {
  width: 100%; padding: .5rem .6rem; border: 1px solid #e2e8f0;
  border-radius: 8px; background: #f8fafc; font-size: .88rem;
}
.rg-block { margin-bottom: 1rem; }
.rg-title { font-weight: 700; margin-bottom: .4rem; }
.rg-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
.rg-table { min-width: 720px; font-size: .82rem; }
.rg-table th, .rg-table td { padding: .4rem .45rem; }
.rg-table input, .rg-table textarea {
  width: 100%; min-width: 90px; box-sizing: border-box;
  padding: .35rem .4rem; border: 1px solid #bfdbfe; border-radius: 6px;
  font-size: .82rem; background: #fff;
}
.rg-table textarea { resize: vertical; }
.score-cell { text-align: center; min-width: 92px; }
.rg-score-input {
  width: 76px; height: 30px; box-sizing: border-box; text-align: center;
  border: 1px solid #93aee8; border-radius: 6px; font-size: .82rem; color: #1f2a44;
}
.cell-text { font-size: .82rem; line-height: 1.4; }
.rg-sum { margin-top: .3rem; font-size: .8rem; color: #475569; }
.detail-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1rem; }
.review-panel {
  margin-top: 1rem; padding: .8rem 1rem;
  border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc;
}
.review-panel h4 { margin: 0 0 .6rem; font-size: .9rem; color: #1f2a44; }
.reviewer-list { display: flex; flex-direction: column; gap: .4rem; }
.reviewer-item {
  display: flex; align-items: center; gap: .6rem; flex-wrap: wrap;
  font-size: .84rem; color: #334155;
}
.rev-role {
  flex-shrink: 0; padding: .12rem .5rem; border-radius: 6px;
  background: #eef3ff; color: #2250bb; font-weight: 600; font-size: .76rem;
}
.rev-weight { color: #64748b; }
.rev-score { font-weight: 700; color: #166534; }
.rev-pending { color: #b45309; font-weight: 600; }
.rev-user { color: #64748b; font-size: .78rem; }
.rev-summary {
  margin-top: .7rem; padding-top: .7rem; border-top: 1px dashed #d8dff1;
  display: flex; flex-direction: column; gap: .28rem;
}
.rev-sum-title { font-size: .84rem; font-weight: 700; color: #1f2a44; }
.rev-sum-row { display: flex; align-items: center; gap: .5rem; font-size: .8rem; color: #334155; }
.rs-label {
  flex-shrink: 0; min-width: 72px;
  font-weight: 600; color: #475569;
}
.rs-expr { color: #64748b; font-variant-numeric: tabular-nums; }
.rev-sum-total {
  margin-top: .2rem; font-size: .92rem; font-weight: 700; color: #1d4ed8;
}
.rev-sum-tip { margin: 0; font-size: .74rem; color: #94a3b8; }
.rev-input-row {
  display: flex; align-items: center; gap: .5rem;
  margin-top: .7rem; padding-top: .7rem; border-top: 1px dashed #d8dff1;
}
.rev-input-row label { font-size: .84rem; color: #334155; font-weight: 600; }
.score-input {
  width: 120px; height: 34px; box-sizing: border-box;
  border: 1px solid #d8dff1; border-radius: 8px; padding: 0 .5rem;
  font-size: .9rem; color: #1f2a44; text-align: center;
}
.rev-tip { font-size: .76rem; color: #94a3b8; }
.rev-wait { margin: .6rem 0 0; font-size: .8rem; color: #64748b; }
</style>
