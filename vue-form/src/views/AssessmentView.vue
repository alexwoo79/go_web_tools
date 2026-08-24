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
}

interface PeriodItem {
  ID: number
  Name: string
  FormName: string
  Status: string
  CreatedAt: string
}

interface FormOption {
  Name: string
  Title: string
}

const STATUS_LABELS: Record<string, string> = {
  submitted: '已填报',
  scored: '已评分',
  approved: '已审核',
  finalized: '已确认',
  none: '未填报',
}

const REVIEW_ROLES = new Set(['dept_head', 'division_leader', 'top_leader', 'admin'])
const ROLE_ACTION_STATUS: Record<string, string> = {
  dept_head: 'submitted',
  division_leader: 'scored',
  top_leader: 'approved',
  admin: '',
}

const auth = useAuthStore()
const router = useRouter()
const tab = ref<'mine' | 'review' | 'periods'>('mine')
const mine = ref<MyItem[]>([])
const review = ref<ReviewItem[]>([])
const periodName = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

const periods = ref<PeriodItem[]>([])
const forms = ref<FormOption[]>([])
const periodForm = ref({ name: '', formName: '' })
const periodLoading = ref(false)
const periodSaving = ref(false)

const showDetail = ref(false)
const detailLoading = ref(false)
const detail = ref<{ record: any; form: any; data: Record<string, any>; canNext: boolean } | null>(null)
const detailError = ref('')
const saving = ref(false)
const formTitle = ref('')

const isReviewer = computed(() => REVIEW_ROLES.has(auth.user?.role ?? ''))
const isMineTab = computed(() => tab.value === 'mine')
const isAdmin = computed(() => auth.user?.role === 'admin')

function actionStatus(role: string, itemStatus: string): boolean {
  const target = ROLE_ACTION_STATUS[role] ?? ''
  if (role === 'admin') return itemStatus !== 'finalized'
  return target === itemStatus
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

async function createPeriod() {
  if (!periodForm.value.name.trim() || !periodForm.value.formName) {
    error.value = '请填写周期名称并选择自评表单'
    return
  }
  periodSaving.value = true
  error.value = ''
  success.value = ''
  try {
    const res = await fetch('/api/admin/assessment-periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: periodForm.value.name.trim(), formName: periodForm.value.formName }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '创建失败')
    success.value = `考核周期「${periodForm.value.name.trim()}」已创建并启用`
    periodForm.value = { name: '', formName: '' }
    loadPeriods()
  } catch (e: any) {
    error.value = e.message || '创建失败'
  } finally {
    periodSaving.value = false
  }
}

function switchTab(t: 'mine' | 'review' | 'periods') {
  tab.value = t
  if (t === 'mine') loadMine()
  else if (t === 'review') loadReview()
  else {
    loadPeriods()
    loadFormOptions()
  }
}

function isScoreField(gf: GroupField): boolean {
  return gf.Type === 'number' && (gf.Name === 'de_fen' || gf.Label.includes('得分') || gf.Label.includes('评分'))
}

function isRemarkField(gf: GroupField): boolean {
  return gf.Name === 'bei_zhu' || gf.Label.includes('备注')
}

function editable(gf: GroupField): boolean {
  return isScoreField(gf) || isRemarkField(gf)
}

function rowData(row: Record<string, any>, gf: GroupField): any {
  return row[gf.Name] ?? ''
}

async function openDetail(item: ReviewItem) {
  showDetail.value = true
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  formTitle.value = item.formTitle
  try {
    const res = await fetch(`/api/assessment/records/${item.id}`)
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '加载失败')
    detail.value = payload
  } catch (e: any) {
    detailError.value = e.message || '加载失败'
  } finally {
    detailLoading.value = false
  }
}

async function saveReview() {
  if (!detail.value) return
  saving.value = true
  detailError.value = ''
  try {
    const res = await fetch(`/api/assessment/records/${detail.value.record.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: detail.value.data }),
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
        <button v-if="isAdmin" class="tab" :class="{ active: tab === 'periods' }" @click="switchTab('periods')">
          周期管理
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
                  <span v-if="!actionStatus(auth.user?.role ?? '', item.status)" class="hint-inline">当前状态不可处理</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 周期管理（管理员） -->
      <div v-else-if="tab === 'periods'">
        <section class="period-create">
          <h3>新建考核周期</h3>
          <div class="period-form">
            <input v-model="periodForm.name" class="create-input" type="text" placeholder="周期名称（如：2026Q3）" />
            <select v-model="periodForm.formName" class="role-select">
              <option value="">选择自评表单…</option>
              <option v-for="f in forms" :key="f.Name" :value="f.Name">{{ f.Title }}（{{ f.Name }}）</option>
            </select>
            <button class="btn-primary" :disabled="periodSaving" @click="createPeriod">
              {{ periodSaving ? '创建中…' : '创建并启用' }}
            </button>
          </div>
          <p class="period-tip">创建后即生效：员工在「我的考核」去填报该表单，提交后自动生成考核记录进入评审流程。</p>
        </section>

        <section class="period-list">
          <h3>考核周期</h3>
          <div v-if="periodLoading" class="state-msg">加载中…</div>
          <div v-else-if="periods.length === 0" class="state-msg">暂无考核周期</div>
          <table v-else>
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>自评表单</th>
                <th>状态</th>
                <th>创建时间</th>
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
              </tr>
            </tbody>
          </table>
        </section>
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

            <div v-for="f in detail.form.Fields.filter((x: FormField) => x.Type === 'repeated_group')" :key="f.Name" class="rg-block">
              <div class="rg-title">{{ f.Label }}</div>
              <div class="rg-wrap">
                <table class="rg-table">
                  <thead>
                    <tr>
                      <th v-for="gf in f.GroupFields" :key="gf.Name">{{ gf.Label }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, ri) in (detail.data[f.Name] as any[])" :key="ri">
                      <td v-for="gf in f.GroupFields" :key="gf.Name">
                        <input
                          v-if="editable(gf)"
                          :type="gf.Type === 'number' ? 'number' : 'text'"
                          v-model="row[gf.Name]"
                          :step="gf.Type === 'number' ? 'any' : undefined"
                        />
                        <textarea
                          v-else-if="gf.Type === 'textarea'"
                          v-model="row[gf.Name]"
                          rows="2"
                          readonly
                        />
                        <span v-else class="cell-text">{{ rowData(row, gf) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="rg-sum">
                <template v-if="f.WeightSumField">
                  权重合计：
                  {{
                    ((detail.data[f.Name] as any[] || []).reduce((s: number, r: any) => s + (Number(r[f.WeightSumField]) || 0), 0)).toFixed(3)
                  }}
                </template>
              </div>
            </div>

            <p v-if="detailError" class="msg error">{{ detailError }}</p>
            <footer class="detail-actions">
              <button class="btn-close" @click="showDetail = false">取消</button>
              <button
                v-if="detail.canNext"
                class="btn-primary"
                :disabled="saving"
                @click="saveReview"
              >
                {{ saving ? '保存中…' : '确认提交（推进下一步）' }}
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
.period-name { font-weight: 600; }

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
.cell-text { font-size: .82rem; line-height: 1.4; }
.rg-sum { margin-top: .3rem; font-size: .8rem; color: #475569; }
.detail-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1rem; }
</style>
