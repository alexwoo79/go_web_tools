<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, roleLabel } from '../stores/auth'
import * as XLSX from 'xlsx'

const ROLE_OPTIONS = [
  { value: 'user', label: '普通用户' },
  { value: 'staff', label: '职员' },
  { value: 'dept_head', label: '部门负责人' },
  { value: 'division_leader', label: '分管领导' },
  { value: 'top_leader', label: '主管领导' },
  { value: 'admin', label: '管理员' },
]
const VALID_ROLES = new Set(ROLE_OPTIONS.map((o) => o.value))

interface DeptItem {
  ID: number
  Name: string
}

interface UserItem {
  id: number
  username: string
  role: string
  department: string
  managedDepartmentIds?: number[]
  managedDepartments?: string[]
  createdAt: string
}

const users = ref<UserItem[]>([])
const departments = ref<DeptItem[]>([])
const newDept = ref('')
const deptSaving = ref(false)
const loading = ref(true)
const error = ref('')
const success = ref('')
const passwordDraft = ref<Record<string, string>>({})
const departmentDraft = ref<Record<string, string>>({})
const managedDraft = ref<Record<string, number[]>>({})
const managedModal = ref<UserItem | null>(null)
const managedModalDraft = ref<number[]>([])
const managedSaving = ref(false)
const passwordSaving = ref<Record<string, boolean>>({})
const deleting = ref<Record<string, boolean>>({})
const creating = ref(false)
const createForm = ref<{ username: string; password: string; role: string; department: string }>({
  username: '',
  password: '',
  role: 'user',
  department: '',
})

interface ImportRow {
  username: string
  password: string
  role: string
  department: string
  _error: string
}
interface ImportFailedItem {
  username: string
  reason: string
}
const importFileInput = ref<HTMLInputElement | null>(null)
const importRows = ref<ImportRow[]>([])
const importPreviewing = ref(false)
const importing = ref(false)
const importResult = ref<{ total: number; success: number; failed: ImportFailedItem[] } | null>(null)

const viewportWidth = ref(9999)
const router = useRouter()
const auth = useAuthStore()

const MOBILE_BREAKPOINT = 430
const COMPACT_BREAKPOINT = 520

const isMobile = computed(() => viewportWidth.value <= MOBILE_BREAKPOINT)
const isCompactPhone = computed(
  () => viewportWidth.value > MOBILE_BREAKPOINT && viewportWidth.value <= COMPACT_BREAKPOINT,
)

function updateViewportMode() {
  viewportWidth.value = window.innerWidth
}

onMounted(async () => {
  updateViewportMode()
  window.addEventListener('resize', updateViewportMode)

  if (!auth.checked) {
    await auth.fetchMe()
  }
  await loadUsers()
  await loadDepartments()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewportMode)
})

async function logout() {
  await fetch('/api/logout', { method: 'POST' })
  auth.setUser(null)
  router.push('/login')
}

async function loadUsers() {
  loading.value = true
  error.value = ''
  success.value = ''
  try {
    const res = await fetch('/api/admin/users')
    if (!res.ok) throw new Error('加载用户失败')
    const payload = await res.json()
    users.value = payload.items ?? []

    const nextDraft: Record<string, string> = {}
    const nextDept: Record<string, string> = {}
    const nextManaged: Record<string, number[]> = {}
    for (const u of users.value) {
      nextDraft[String(u.id)] = ''
      nextDept[String(u.id)] = u.department ?? ''
      nextManaged[String(u.id)] = u.managedDepartmentIds ?? []
    }
    passwordDraft.value = nextDraft
    departmentDraft.value = nextDept
    managedDraft.value = nextManaged
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadDepartments() {
  try {
    const res = await fetch('/api/admin/departments')
    const payload = await res.json().catch(() => ({}))
    if (res.ok) departments.value = payload.items ?? []
  } catch {
    departments.value = []
  }
}

async function addDepartment() {
  const name = newDept.value.trim()
  if (!name) return
  deptSaving.value = true
  error.value = ''
  try {
    const res = await fetch('/api/admin/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '新增部门失败')
    newDept.value = ''
    success.value = `部门「${name}」已添加`
    await loadDepartments()
  } catch (e: any) {
    error.value = e.message || '新增部门失败'
  } finally {
    deptSaving.value = false
  }
}

async function removeDepartment(dep: DeptItem) {
  if (!window.confirm(`确认删除部门「${dep.Name}」吗？员工将保留原部门文本，领导管理范围会被清除。`)) return
  const res = await fetch(`/api/admin/departments/${dep.ID}`, { method: 'DELETE' })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    error.value = payload.error || '删除部门失败'
    return
  }
  success.value = `部门「${dep.Name}」已删除`
  await loadDepartments()
}

function isLeaderRole(role: string): boolean {
  return role === 'division_leader' || role === 'top_leader'
}

async function saveManagedDepartments(item: UserItem, ids: number[]) {
  managedDraft.value[String(item.id)] = ids
  const names = departments.value.filter((d) => ids.includes(d.ID)).map((d) => d.Name)
  item.managedDepartmentIds = ids
  item.managedDepartments = names
  try {
    const res = await fetch('/api/admin/user-departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: item.id, departmentIds: ids }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '更新管理范围失败')
    success.value = `用户 ${item.username} 管理范围已更新`
  } catch (e: any) {
    error.value = e.message || '更新管理范围失败'
  }
}

function openManagedModal(item: UserItem) {
  managedModal.value = item
  managedModalDraft.value = [...(managedDraft.value[String(item.id)] ?? [])]
}

function closeManagedModal() {
  managedModal.value = null
}

function toggleModalDept(depId: number, checked: boolean) {
  const cur = [...managedModalDraft.value]
  const idx = cur.indexOf(depId)
  if (checked && idx === -1) cur.push(depId)
  if (!checked && idx !== -1) cur.splice(idx, 1)
  managedModalDraft.value = cur
}

async function saveManagedModal() {
  if (!managedModal.value) return
  managedSaving.value = true
  try {
    await saveManagedDepartments(managedModal.value, [...managedModalDraft.value])
    success.value = `用户 ${managedModal.value.username} 管理范围已更新`
    closeManagedModal()
  } catch (e: any) {
    error.value = e.message || '保存失败'
  } finally {
    managedSaving.value = false
  }
}

async function createUser() {
  const username = createForm.value.username.trim()
  const password = createForm.value.password.trim()
  const role = createForm.value.role
  const department = createForm.value.department.trim()

  success.value = ''
  error.value = ''

  if (!username.trim()) {
    error.value = '用户名不能为空'
    return
  }
  if (password.length < 6) {
    error.value = '密码至少 6 位'
    return
  }

  creating.value = true
  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, department }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(payload.error || '新增用户失败')
    }

    createForm.value = { username: '', password: '', role: 'user', department: '' }
    success.value = `用户 ${username} 已创建`
    await loadUsers()
  } catch (e: any) {
    error.value = e.message || '新增用户失败'
  } finally {
    creating.value = false
  }
}

function canDeleteUser(item: UserItem): boolean {
  if (isProtectedAdmin(item)) return false
  return item.id !== auth.user?.id
}

async function deleteUser(item: UserItem) {
  if (!canDeleteUser(item)) {
    error.value = isProtectedAdmin(item) ? 'admin用户不可删除' : '不能删除当前登录用户'
    return
  }

  const confirmed = window.confirm(`确认删除用户 ${item.username} 吗？删除后不可恢复。`)
  if (!confirmed) {
    return
  }

  success.value = ''
  error.value = ''
  const key = String(item.id)
  deleting.value[key] = true

  try {
    const res = await fetch(`/api/admin/users/${item.id}`, { method: 'DELETE' })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(payload.error || '删除用户失败')
    }
    success.value = `用户 ${item.username} 已删除`
    await loadUsers()
  } catch (e: any) {
    error.value = e.message || '删除用户失败'
  } finally {
    deleting.value[key] = false
  }
}

async function updateUserRole(item: UserItem, role: string) {
  success.value = ''
  if (isProtectedAdmin(item)) {
    error.value = 'admin用户角色不可修改'
    return
  }
  if (item.id === auth.user?.id && role !== 'admin') {
    error.value = '当前登录管理员不能将自己降级为普通用户'
    return
  }

  error.value = ''
  const oldRole = item.role
  item.role = role

  try {
    const res = await fetch('/api/admin/user-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: item.id, role }),
    })
    if (!res.ok) {
      const payload = await res.json()
      throw new Error(payload.error || '更新角色失败')
    }
    success.value = `用户 ${item.username} 角色已更新`
  } catch (e: any) {
    item.role = oldRole
    error.value = e.message || '更新失败'
  }
}

async function saveUserDepartment(item: UserItem) {
  const department = (departmentDraft.value[String(item.id)] ?? '').trim()
  if (department === (item.department ?? '')) return
  if (isProtectedAdmin(item)) return
  const old = item.department
  item.department = department
  try {
    const res = await fetch('/api/admin/user-department', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: item.id, department }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(payload.error || '更新部门失败')
    }
    success.value = `用户 ${item.username} 部门已更新`
  } catch (e: any) {
    item.department = old
    error.value = e.message || '更新部门失败'
  }
}

async function updateUserPassword(item: UserItem) {
	if (!canEditPassword(item)) {
		error.value = 'admin密码仅允许admin账户本人修改'
		return
	}

  const key = String(item.id)
  const newPassword = (passwordDraft.value[key] ?? '').trim()
  if (newPassword === '') {
    return
  }

  success.value = ''
  error.value = ''
  if (newPassword.length < 6) {
    error.value = '新密码至少 6 位'
    return
  }

  passwordSaving.value[key] = true
  try {
    const res = await fetch('/api/admin/user-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: item.id, newPassword }),
    })
    if (!res.ok) {
      const payload = await res.json()
      throw new Error(payload.error || '修改密码失败')
    }
    passwordDraft.value[key] = ''
    success.value = `用户 ${item.username} 密码已更新`
  } catch (e: any) {
    error.value = e.message || '修改密码失败'
  } finally {
    passwordSaving.value[key] = false
  }
}

function canSavePassword(userID: number): boolean {
  const key = String(userID)
  return (passwordDraft.value[key] ?? '').trim().length > 0
}

function canEditPassword(item: UserItem): boolean {
  if (!isProtectedAdmin(item)) {
    return true
  }
  return auth.user?.username.trim().toLowerCase() === 'admin'
}

function isProtectedAdmin(item: UserItem): boolean {
  return item.username.trim().toLowerCase() === 'admin'
}

// ---------- 批量导入 ----------
const HEADER_KEYWORDS = ['username', '用户名', 'name', 'user', 'account']

function isHeaderRow(row: unknown[]): boolean {
  const first = String(row[0] ?? '').trim().toLowerCase()
  return HEADER_KEYWORDS.some((k) => first === k)
}

function validateImportRow(row: unknown[]): ImportRow {
  const username = String(row[0] ?? '').trim()
  const password = String(row[1] ?? '').trim()
  const rawRole = String(row[2] ?? '').trim().toLowerCase()
  const department = String(row[3] ?? '').trim()
  const role = rawRole || 'user'
  let _error = ''
  if (!username) _error = '用户名为空'
  else if (!password) _error = '密码为空'
  else if (password.length < 6) _error = '密码至少6位'
  else if (!VALID_ROLES.has(role)) _error = `角色不合法（${ROLE_OPTIONS.map((o) => o.value).join('/')}）`
  return { username, password, role, department, _error }
}

async function handleImportFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  importRows.value = []
  importResult.value = null
  importPreviewing.value = true
  try {
    const buffer = await file.arrayBuffer()
    // CSV 可能是 UTF-8 或 GBK/GB2312（中文 Excel/WPS 导出的默认编码），自动识别
    let wb: XLSX.WorkBook
    if (/\.csv$/i.test(file.name)) {
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      } catch {
        text = new TextDecoder('gbk').decode(buffer)
      }
      text = text.replace(/^\uFEFF/, '')
      wb = XLSX.read(text, { type: 'string' })
    } else {
      wb = XLSX.read(buffer, { type: 'array' })
    }
    const firstSheetName = wb.SheetNames[0]
    if (!firstSheetName) {
      throw new Error('未找到工作表')
    }
    const sheet = wb.Sheets[firstSheetName]
    if (!sheet) {
      throw new Error('工作表读取失败')
    }
    const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    const firstRow = raw[0]
    const startIdx = firstRow && isHeaderRow(firstRow) ? 1 : 0
    importRows.value = raw
      .slice(startIdx)
      .filter((r) => r.some((c) => String(c).trim()))
      .map(validateImportRow)
  } catch {
    error.value = '文件解析失败，请检查格式是否正确'
  } finally {
    importPreviewing.value = false
  }
}

const validImportRows = computed(() => importRows.value.filter((r) => !r._error))
const invalidImportRows = computed(() => importRows.value.filter((r) => r._error))

async function doImport() {
  if (!validImportRows.value.length) return
  importing.value = true
  error.value = ''
  success.value = ''
  try {
    const res = await fetch('/api/admin/users/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        users: validImportRows.value.map(({ username, password, role, department }) => ({ username, password, role, department })),
      }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || '导入失败')
    importResult.value = payload
    if (payload.success > 0) {
      await loadUsers()
      if (payload.failed?.length === 0) {
        importRows.value = []
        if (importFileInput.value) importFileInput.value.value = ''
      }
    }
  } catch (e: any) {
    error.value = e.message || '导入失败'
  } finally {
    importing.value = false
  }
}

function clearImport() {
  importRows.value = []
  importResult.value = null
  if (importFileInput.value) importFileInput.value.value = ''
}

function downloadTemplate() {
  const csv = 'username,password,role,department\nalice,password123,staff,设计部\nbob,password456,dept_head,设计部\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'users_template.csv'
  a.click()
  nextTick(() => URL.revokeObjectURL(url))
}

function exportFailedImportCsv() {
  if (!importResult.value?.failed?.length) {
    return
  }
  const lines = ['username,reason']
  for (const f of importResult.value.failed) {
    const username = `"${String(f.username ?? '').replace(/"/g, '""')}"`
    const reason = `"${String(f.reason ?? '').replace(/"/g, '""')}"`
    lines.push(`${username},${reason}`)
  }
  const csv = `${lines.join('\n')}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  a.href = url
  a.download = `import_failed_${ts}.csv`
  a.click()
  nextTick(() => URL.revokeObjectURL(url))
}
</script>

<template>
  <div class="page">
    <header class="site-header">
      <h1>用户管理</h1>
      <div class="header-right">
        <span v-if="auth.user" class="user-badge">{{ auth.user.username }}</span>
        <button class="btn-logout" @click="logout">退出登录</button>
        <a href="/portal" @click.prevent="router.push('/portal')" class="link">返回主页</a>
      </div>
    </header>

    <main class="container">
      <div v-if="loading" class="state-msg">用户加载中…</div>
      <div v-else-if="error" class="state-msg error">{{ error }}</div>
      <div v-else>
        <div v-if="success" class="inline-msg success">{{ success }}</div>

        <section class="dept-panel">
          <div class="panel-head">
            <h2>部门管理</h2>
            <p class="panel-hint">部门供员工归属与领导管理范围选择</p>
          </div>
          <div class="dept-add-row">
            <input v-model="newDept" class="create-input" type="text" placeholder="输入部门名称，如：设计部" @keyup.enter="addDepartment" />
            <button class="btn-create" :disabled="deptSaving || !newDept.trim()" @click="addDepartment">
              {{ deptSaving ? '添加中…' : '添加部门' }}
            </button>
          </div>
          <div v-if="departments.length" class="dept-chips">
            <span v-for="dep in departments" :key="dep.ID" class="dept-chip">
              {{ dep.Name }}
              <button class="chip-x" title="删除部门" @click="removeDepartment(dep)">×</button>
            </span>
          </div>
          <p v-else class="panel-hint">暂无部门，请先添加。</p>
        </section>

        <section class="create-user-panel">
          <div class="panel-head">
            <h2>新增用户</h2>
            <p class="panel-hint">用户名可使用中文姓名，部门用于绩效考核的查看与评分范围</p>
          </div>
          <div class="create-grid">
            <label class="c-field">
              <span>用户名 <em>*</em></span>
              <input v-model="createForm.username" class="create-input" type="text" placeholder="姓名 / 账号" />
            </label>
            <label class="c-field">
              <span>初始密码 <em>*</em></span>
              <input v-model="createForm.password" class="create-input" type="password" placeholder="至少 6 位" />
            </label>
            <label class="c-field">
              <span>角色</span>
              <select v-model="createForm.role" class="role-select create-role">
                <option v-for="opt in ROLE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
            <label class="c-field">
              <span>部门</span>
              <select v-model="createForm.department" class="role-select create-role">
                <option value="">未设置</option>
                <option v-for="dep in departments" :key="dep.ID" :value="dep.Name">{{ dep.Name }}</option>
              </select>
            </label>
          </div>
          <div class="create-actions">
            <button class="btn-create" :disabled="creating" @click="createUser">
              {{ creating ? '创建中…' : '新增用户' }}
            </button>
          </div>
        </section>

        <section class="import-panel">
          <div class="panel-head">
            <h2>批量导入用户</h2>
            <button class="btn-template" @click="downloadTemplate">下载模板 CSV</button>
          </div>
          <p class="import-hint">
            文件第一列：用户名，第二列：密码，第三列：角色（<code>user/staff/dept_head/division_leader/top_leader/admin</code>，可省略默认 user），第四列：部门（可省略）<br />
            支持 <strong>.csv</strong>、<strong>.xlsx</strong> 格式；CSV 自动识别 UTF-8 / GBK 编码，中文姓名可用；首行为标题行时自动跳过。
          </p>
          <div class="import-file-row">
            <label class="file-label">
              <input
                ref="importFileInput"
                type="file"
                accept=".csv,.xlsx,.xls"
                class="file-input-hidden"
                @change="handleImportFile"
              />
              <span class="btn-choose-file">{{ importRows.length ? '重新选择文件' : '选择文件' }}</span>
              <span v-if="importRows.length" class="chosen-filename">已解析 {{ importRows.length }} 行</span>
            </label>
            <button v-if="importRows.length" class="btn-clear-import" @click="clearImport">清除</button>
          </div>

          <div v-if="importPreviewing" class="state-msg">解析中…</div>

          <div v-if="importRows.length" class="import-preview">
            <p class="preview-stat">
              共 {{ importRows.length }} 行 ·
              <span class="stat-ok">{{ validImportRows.length }} 行有效</span>
              <template v-if="invalidImportRows.length"> · <span class="stat-err">{{ invalidImportRows.length }} 行有误</span></template>
            </p>
            <div class="import-table-wrap">
              <table class="import-table">
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>密码</th>
                    <th>角色</th>
                    <th>部门</th>
                    <th>校验</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in importRows" :key="idx" :class="{ 'irow-err': row._error }">
                    <td>{{ row.username }}</td>
                    <td>{{ row.password ? '••••••' : '' }}</td>
                    <td>{{ roleLabel(row.role) }}</td>
                    <td>{{ row.department || '—' }}</td>
                    <td>
                      <span v-if="row._error" class="tag-err">{{ row._error }}</span>
                      <span v-else class="tag-ok">✓</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="import-actions">
              <button
                class="btn-do-import"
                :disabled="importing || validImportRows.length === 0"
                @click="doImport"
              >
                {{ importing ? '导入中…' : `导入 ${validImportRows.length} 位用户` }}
              </button>
            </div>
          </div>

          <div v-if="importResult" class="import-result">
            <span class="result-ok">✓ 成功导入 {{ importResult.success }} 个用户</span>
            <template v-if="importResult.failed.length">
              <span class="result-fail">，{{ importResult.failed.length }} 个失败</span>
              <button class="btn-export-failed" @click="exportFailedImportCsv">导出失败清单 CSV</button>
              <ul class="failed-list">
                <li v-for="f in importResult.failed" :key="f.username">
                  <em>{{ f.username }}</em>：{{ f.reason }}
                </li>
              </ul>
            </template>
          </div>
        </section>

        <div v-if="!isMobile && !isCompactPhone" class="table-wrap user-table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户</th>
                <th>角色</th>
                <th>部门</th>
                <th>创建时间</th>
                <th>新密码</th>
                <th class="th-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td>
                  <div class="user-cell">
                    <span class="user-id">ID {{ u.id }}</span>
                    <span class="username">{{ u.username }}</span>
                  </div>
                </td>
                <td>
                  <select
                    class="role-select"
                    :value="u.role"
                    :disabled="isProtectedAdmin(u)"
                    :title="isProtectedAdmin(u) ? 'admin用户角色不可修改' : ''"
                    @change="updateUserRole(u, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="opt in ROLE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </td>
                <td>
                  <div class="dept-cell">
                    <select
                      v-model="departmentDraft[String(u.id)]"
                      class="role-select dept-select"
                      :disabled="isProtectedAdmin(u)"
                      :title="isProtectedAdmin(u) ? 'admin用户不可修改部门' : ''"
                      @change="saveUserDepartment(u)"
                    >
                      <option value="">未设置</option>
                      <option v-for="dep in departments" :key="dep.ID" :value="dep.Name">{{ dep.Name }}</option>
                    </select>
                    <template v-if="isLeaderRole(u.role)">
                      <span class="mgmt-label">管理范围</span>
                      <div class="mgmt-summary">
                        <span class="mgmt-summary-text">
                          {{ (u.managedDepartments?.length ?? 0) ? u.managedDepartments!.join('、') : '未设置' }}
                        </span>
                        <button class="btn-edit-scope" @click="openManagedModal(u)">编辑</button>
                      </div>
                    </template>
                  </div>
                </td>
                <td class="td-created">{{ u.createdAt }}</td>
                <td>
                  <div class="pass-cell">
                    <input
                      v-model="passwordDraft[String(u.id)]"
                      class="pass-input"
                      type="password"
                      placeholder="新密码"
                      :disabled="!canEditPassword(u)"
                      :title="!canEditPassword(u) ? 'admin密码仅允许admin账户本人修改' : ''"
                    />
                    <button
                      class="btn-pass"
                      :disabled="passwordSaving[String(u.id)] || !canSavePassword(u.id) || !canEditPassword(u)"
                      :title="!canEditPassword(u) ? 'admin密码仅允许admin账户本人修改' : ''"
                      @click="updateUserPassword(u)"
                    >
                      {{ passwordSaving[String(u.id)] ? '保存中…' : '保存' }}
                    </button>
                  </div>
                </td>
                <td>
                  <button
                    class="btn-delete"
                    :disabled="deleting[String(u.id)] || !canDeleteUser(u)"
                    :title="!canDeleteUser(u) ? (isProtectedAdmin(u) ? 'admin用户不可删除' : '不能删除当前登录用户') : ''"
                    @click="deleteUser(u)"
                  >
                    {{ deleting[String(u.id)] ? '删除中…' : '删除' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="mobile-list" :class="{ 'mobile-list-compact': isCompactPhone }">
          <article v-for="u in users" :key="`mobile-${u.id}`" class="mobile-card">
            <div class="mobile-top">
              <span class="mobile-id">ID {{ u.id }}</span>
              <span class="username">{{ u.username }}</span>
            </div>
            <div class="mobile-row">
              <span class="mobile-label">角色</span>
              <select
                class="role-select"
                :value="u.role"
                :disabled="isProtectedAdmin(u)"
                :title="isProtectedAdmin(u) ? 'admin用户角色不可修改' : ''"
                @change="updateUserRole(u, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="opt in ROLE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="mobile-row">
              <span class="mobile-label">部门</span>
              <select
                v-model="departmentDraft[String(u.id)]"
                class="role-select"
                :disabled="isProtectedAdmin(u)"
                @change="saveUserDepartment(u)"
              >
                <option value="">未设置</option>
                <option v-for="dep in departments" :key="dep.ID" :value="dep.Name">{{ dep.Name }}</option>
              </select>
            </div>
            <div v-if="isLeaderRole(u.role)" class="mobile-row mobile-managed">
              <span class="mobile-label">管理范围</span>
              <div class="mgmt-summary">
                <span class="mgmt-summary-text">
                  {{ (u.managedDepartments?.length ?? 0) ? u.managedDepartments!.join('、') : '未设置' }}
                </span>
                <button class="btn-edit-scope" @click="openManagedModal(u)">编辑</button>
              </div>
            </div>
            <div class="mobile-row mobile-created">
              <span class="mobile-label">创建时间</span>
              <span>{{ u.createdAt }}</span>
            </div>
            <div class="mobile-row mobile-password">
              <span class="mobile-label">新密码</span>
              <input
                v-model="passwordDraft[String(u.id)]"
                class="pass-input"
                type="password"
                placeholder="输入新密码"
                :disabled="!canEditPassword(u)"
                :title="!canEditPassword(u) ? 'admin密码仅允许admin账户本人修改' : ''"
              />
            </div>
            <div class="mobile-row">
              <button
                class="btn-pass"
                :disabled="passwordSaving[String(u.id)] || !canSavePassword(u.id) || !canEditPassword(u)"
                :title="!canEditPassword(u) ? 'admin密码仅允许admin账户本人修改' : ''"
                @click="updateUserPassword(u)"
              >
                {{ passwordSaving[String(u.id)] ? '密码保存中…' : '密码保存' }}
              </button>
              <button
                class="btn-delete"
                :disabled="deleting[String(u.id)] || !canDeleteUser(u)"
                :title="!canDeleteUser(u) ? (isProtectedAdmin(u) ? 'admin用户不可删除' : '不能删除当前登录用户') : ''"
                @click="deleteUser(u)"
              >
                {{ deleting[String(u.id)] ? '删除中…' : '删除用户' }}
              </button>
            </div>
          </article>
        </div>
      </div>
    </main>

    <!-- 管理范围编辑弹窗 -->
    <div v-if="managedModal" class="modal-mask" @click.self="closeManagedModal">
      <div class="modal-panel scope-modal">
        <header class="modal-header">
          <h3>管理范围 - {{ managedModal.username }}</h3>
          <button class="btn-close" @click="closeManagedModal">关闭</button>
        </header>
        <div class="modal-body">
          <p class="scope-hint">勾选该领导需要管理和考核的部门（可多选，空则不限定全部部门）</p>
          <div class="mgmt-checkbox-list scope-list">
            <label v-for="dep in departments" :key="dep.ID" class="mgmt-check">
              <input
                type="checkbox"
                :checked="managedModalDraft.includes(dep.ID)"
                @change="toggleModalDept(dep.ID, ($event.target as HTMLInputElement).checked)"
              />
              {{ dep.Name }}
            </label>
          </div>
          <footer class="scope-actions">
            <button class="btn-close" @click="closeManagedModal">取消</button>
            <button class="btn-primary" :disabled="managedSaving" @click="saveManagedModal">
              {{ managedSaving ? '保存中…' : '保存' }}
            </button>
          </footer>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100dvh;
  background: transparent;
}

.site-header {
  background: linear-gradient(135deg, var(--admin-header-start) 0%, var(--admin-header-end) 100%);
  color: var(--admin-header-text);
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.site-header h1 { margin: 0; font-size: 1.3rem; }
.header-right { display: flex; align-items: center; gap: .9rem; }
.user-badge {
  background: rgba(255,255,255,.18);
  padding: .3rem .7rem;
  border-radius: 20px;
  font-size: .85rem;
}
.btn-logout {
  background: transparent;
  border: 1px solid rgba(255,255,255,.35);
  color: #fff;
  padding: .35rem .8rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: .85rem;
}
.link { color: rgba(255,255,255,.78); text-decoration: none; font-size: .85rem; }

.container { max-width: 980px; margin: 2rem auto; padding: 0 1rem; }
.state-msg { text-align: center; color: #888; padding: 3rem 0; }
.state-msg.error { color: #e53e3e; }

.inline-msg {
  font-size: .84rem;
  color: var(--status-success);
  margin-bottom: .55rem;
}

.dept-panel {
  border: 1px solid var(--surface-card-border);
  background: linear-gradient(180deg, #ffffff 0%, #f8faff 100%);
  border-radius: 12px;
  padding: .72rem;
  margin-bottom: .75rem;
}

.dept-add-row {
  display: flex;
  gap: .5rem;
  max-width: 460px;
}

.dept-add-row .create-input {
  flex: 1;
}

.dept-chips {
  display: flex;
  flex-wrap: wrap;
  gap: .4rem;
  margin-top: .6rem;
}

.dept-chip {
  display: inline-flex;
  align-items: center;
  gap: .3rem;
  background: #eef3ff;
  color: var(--brand-600);
  border-radius: 999px;
  padding: .22rem .55rem .22rem .7rem;
  font-size: .8rem;
  font-weight: 600;
}

.chip-x {
  border: none;
  background: transparent;
  color: #7c89a3;
  cursor: pointer;
  font-size: .95rem;
  line-height: 1;
  padding: 0 .1rem;
}

.chip-x:hover { color: #dc2626; }

.create-user-panel {
  border: 1px solid var(--surface-card-border);
  background: linear-gradient(180deg, #ffffff 0%, #f8faff 100%);
  border-radius: 12px;
  padding: .72rem;
  margin-bottom: .75rem;
}

.create-user-panel h2 {
  margin: 0 0 .54rem;
  font-size: .96rem;
  color: #334155;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: .6rem;
  flex-wrap: wrap;
  margin-bottom: .62rem;
}

.panel-head h2 {
  margin: 0;
  font-size: .96rem;
  color: #334155;
}

.panel-hint {
  margin: 0;
  font-size: .78rem;
  color: #7c89a3;
}

.create-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .62rem .7rem;
}

.c-field {
  display: flex;
  flex-direction: column;
  gap: .28rem;
  min-width: 0;
}

.c-field > span {
  font-size: .78rem;
  color: #64748b;
  font-weight: 600;
}

.c-field em {
  color: #dc2626;
  font-style: normal;
}

.create-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: .62rem;
}

.create-input {
  height: 34px;
  border-radius: 8px;
  border: 1px solid #d8dff1;
  padding: 0 .62rem;
  font-size: .84rem;
  color: #334155;
  background: #fff;
  outline: none;
}

.create-input:focus {
  border-color: var(--brand-600);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.create-role {
  width: 100%;
}

.btn-create {
  height: 34px;
  border: none;
  border-radius: 8px;
  background: #e8efff;
  color: var(--brand-600);
  font-size: .82rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-create:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.table-wrap {
  background: linear-gradient(180deg, var(--surface-card-start) 0%, var(--surface-card-end) 100%);
  border-radius: 12px;
  border: 1px solid var(--surface-card-border);
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  box-shadow: var(--shadow-soft);
}

table {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;
}
th {
  background: #f6f8fd;
  padding: .9rem 1rem;
  text-align: left;
  font-size: .85rem;
  color: #5f6880;
  border-bottom: 1px solid #e6ebf3;
  position: sticky;
  top: 0;
  z-index: 2;
}

td {
  padding: .85rem 1rem;
  border-bottom: 1px solid #edf1f7;
  font-size: .9rem;
  vertical-align: middle;
}

.username {
  font-weight: 600;
  color: #1f2a44;
}

.user-cell {
  display: flex;
  flex-direction: column;
  gap: .12rem;
}

.user-id {
  font-size: .72rem;
  color: #94a3b8;
}

tbody tr:hover {
  background: #f8faff;
}

.role-select,
.pass-input {
  height: 32px;
  border-radius: 8px;
  border: 1px solid #d8dff1;
  padding: 0 .6rem;
  background: #fff;
  color: #334155;
  outline: none;
}

.role-select:focus,
.pass-input:focus {
  border-color: var(--brand-600);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.role-select:disabled {
  background: #f3f4f6;
  color: #94a3b8;
  cursor: not-allowed;
}

.pass-input:disabled {
  background: #f3f4f6;
  color: #94a3b8;
  cursor: not-allowed;
}

.pass-input {
  width: 160px;
}

.dept-input {
  width: 100%;
  min-width: 120px;
}

.dept-cell {
  display: flex;
  flex-direction: column;
  gap: .3rem;
  min-width: 150px;
}

.dept-select {
  width: 100%;
}

.mgmt-label {
  font-size: .72rem;
  color: #7c89a3;
  font-weight: 600;
}

.mobile-managed {
  align-items: flex-start;
}

.mobile-managed .mgmt-checkbox-list {
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
}

.mgmt-summary {
  display: flex;
  align-items: center;
  gap: .4rem;
  max-width: 240px;
  min-width: 150px;
}

.mgmt-summary-text {
  flex: 1;
  min-width: 0;
  font-size: .78rem;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-edit-scope {
  flex-shrink: 0;
  height: 26px;
  padding: 0 .55rem;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  background: #fff;
  color: var(--brand-600);
  font-size: .76rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-edit-scope:hover {
  background: #eef3ff;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, .45);
  padding: 1rem;
}

.modal-panel {
  width: min(520px, 96vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: .9rem 1.1rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  margin: 0;
  font-size: 1rem;
}

.modal-body {
  padding: 1rem 1.1rem 1.2rem;
  overflow-y: auto;
}

.btn-close {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: .4rem .8rem;
  cursor: pointer;
  font-size: .84rem;
}

.scope-hint {
  margin: 0 0 .7rem;
  font-size: .8rem;
  color: #7c89a3;
}

.mgmt-checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: .35rem .5rem;
}

.scope-list {
  max-height: 52vh;
  overflow-y: auto;
  padding: .1rem;
}

.mgmt-check {
  display: inline-flex;
  align-items: center;
  gap: .28rem;
  font-size: .8rem;
  color: #475569;
  cursor: pointer;
  background: #f6f8fd;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: .25rem .5rem;
  user-select: none;
}

.mgmt-check:has(input:checked) {
  background: #eef3ff;
  border-color: var(--brand-600);
  color: var(--brand-600);
  font-weight: 600;
}

.mgmt-check input {
  accent-color: var(--brand-600);
  margin: 0;
}

.scope-actions {
  display: flex;
  justify-content: flex-end;
  gap: .5rem;
  margin-top: 1rem;
}

.btn-primary {
  height: 32px;
  padding: 0 1rem;
  border: none;
  border-radius: 8px;
  background: var(--brand-600);
  color: #fff;
  font-size: .84rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.pass-cell {
  display: flex;
  align-items: center;
  gap: .45rem;
}

.pass-cell .pass-input {
  width: 118px;
}

.td-created {
  color: #64748b;
  font-size: .82rem;
  white-space: nowrap;
}

.th-actions {
  width: 92px;
}

.btn-pass {
  min-width: 78px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: #eef3ff;
  color: var(--brand-600);
  font-size: .8rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-delete {
  min-width: 78px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: #ffecec;
  color: #c24141;
  font-size: .8rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-pass:hover { background: #e0e8ff; }
.btn-delete:hover { background: #ffdede; }
.btn-pass:disabled,
.btn-delete:disabled { opacity: .6; cursor: not-allowed; }

.mobile-list {
  display: grid;
  gap: .7rem;
}

.mobile-card {
  border: 1px solid var(--surface-card-border);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--surface-card-start) 0%, var(--surface-card-end) 100%);
  box-shadow: var(--shadow-soft);
  padding: .72rem;
}

.mobile-top {
  display: flex;
  align-items: center;
  gap: .62rem;
}

.mobile-id {
  color: #64748b;
  font-size: .75rem;
  font-weight: 600;
}

.mobile-row {
  margin-top: .56rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .66rem;
}

.mobile-label {
  color: #64748b;
  font-size: .78rem;
  font-weight: 600;
  flex: 0 0 auto;
}

.mobile-created {
  align-items: flex-start;
}

.mobile-created span:last-child {
  text-align: right;
  font-size: .8rem;
  color: #334155;
}

.mobile-password {
  align-items: flex-start;
}

.mobile-password .pass-input {
  width: 100%;
}

.mobile-row > .pass-input {
  flex: 1;
  width: auto;
  min-width: 0;
}

.mobile-list-compact {
  gap: .56rem;
}

.mobile-list-compact .mobile-card {
  padding: .62rem;
}

.mobile-list-compact .mobile-top {
  gap: .45rem;
}

.mobile-list-compact .mobile-id,
.mobile-list-compact .mobile-label,
.mobile-list-compact .mobile-created span:last-child {
  font-size: .74rem;
}

.mobile-list-compact .username {
  font-size: .86rem;
}

.mobile-list-compact .mobile-row {
  margin-top: .46rem;
}

.mobile-list-compact .role-select,
.mobile-list-compact .pass-input,
.mobile-list-compact .btn-pass {
  height: 28px;
  font-size: .72rem;
}

.mobile-list-compact .btn-pass {
  min-width: 74px;
}

@media (max-width: 768px) {
  .site-header {
    padding: .9rem 1rem;
    flex-direction: column;
    align-items: flex-start;
    gap: .65rem;
  }

  .site-header h1 {
    font-size: 1.12rem;
  }

  .header-right {
    width: 100%;
    flex-wrap: wrap;
    gap: .5rem .7rem;
  }

  .container {
    margin: 1rem auto;
  }

  .create-grid {
    grid-template-columns: 1fr 1fr;
  }

  table {
    min-width: 860px;
  }

  th,
  td {
    padding: .72rem .66rem;
    font-size: .84rem;
  }

  .role-select,
  .pass-input,
  .create-input {
    height: 30px;
    font-size: .78rem;
    padding: 0 .5rem;
  }

  .pass-input {
    width: 122px;
  }

  .pass-cell .pass-input {
    width: 108px;
  }

  .btn-pass,
  .btn-delete,
  .btn-create {
    min-width: 70px;
    height: 28px;
    font-size: .74rem;
  }
}

@media (max-width: 430px) {
  .site-header {
    padding: .78rem .78rem;
  }

  .header-right {
    gap: .45rem .62rem;
  }

  .user-badge,
  .link,
  .btn-logout {
    font-size: .76rem;
  }

  .btn-logout {
    padding: .28rem .62rem;
  }

  .create-grid {
    grid-template-columns: 1fr;
  }

  .pass-input {
    width: 100%;
    min-width: 0;
  }

  .role-select {
    min-width: 96px;
  }

  .btn-pass,
  .btn-delete,
  .btn-create {
    min-width: 86px;
    width: 100%;
    max-width: 180px;
  }
}

@media (max-width: 390px) {
  .mobile-card {
    padding: .62rem;
  }

  .pass-input {
    width: 100%;
  }

  .role-select,
  .pass-input,
  .create-input,
  .btn-pass,
  .btn-delete,
  .btn-create {
    font-size: .72rem;
  }
}

@media (max-width: 375px) {
  .site-header h1 {
    font-size: 1.02rem;
  }
}

  /* ---- 批量导入面板 ---- */
  .import-panel {
    border: 1px solid var(--surface-card-border);
    background: linear-gradient(180deg, #ffffff 0%, #f8faff 100%);
    border-radius: 12px;
    padding: .72rem;
    margin-bottom: .75rem;
  }

  .import-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: .4rem;
  }

  .import-panel-head h2 {
    margin: 0;
    font-size: .96rem;
    color: #334155;
  }

  .btn-template {
    height: 28px;
    padding: 0 .72rem;
    border: 1px solid #c7d3f0;
    border-radius: 8px;
    background: #f0f4ff;
    color: var(--brand-600);
    font-size: .78rem;
    cursor: pointer;
  }
  .btn-template:hover { background: #e0e8ff; }

  .import-hint {
    margin: 0 0 .6rem;
    font-size: .78rem;
    color: #64748b;
    line-height: 1.6;
  }
  .import-hint code {
    background: #eef2ff;
    padding: .05em .3em;
    border-radius: 4px;
    font-family: monospace;
  }

  .import-file-row {
    display: flex;
    align-items: center;
    gap: .6rem;
    flex-wrap: wrap;
  }

  .file-label {
    display: flex;
    align-items: center;
    gap: .5rem;
    cursor: pointer;
  }

  .file-input-hidden {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .btn-choose-file {
    display: inline-flex;
    align-items: center;
    height: 34px;
    padding: 0 .9rem;
    border: 1px dashed #a0aabf;
    border-radius: 8px;
    background: #f8faff;
    color: #475569;
    font-size: .83rem;
    cursor: pointer;
    transition: border-color .15s, background .15s;
  }
  .file-label:hover .btn-choose-file {
    border-color: var(--brand-600);
    background: #eef2ff;
    color: var(--brand-600);
  }

  .chosen-filename {
    font-size: .8rem;
    color: #64748b;
  }

  .btn-clear-import {
    height: 28px;
    padding: 0 .65rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #fff;
    color: #94a3b8;
    font-size: .78rem;
    cursor: pointer;
  }
  .btn-clear-import:hover { color: #e53e3e; border-color: #fca5a5; }

  .import-preview { margin-top: .7rem; }

  .preview-stat {
    font-size: .82rem;
    color: #475569;
    margin: 0 0 .5rem;
  }
  .stat-ok { color: #16a34a; font-weight: 600; }
  .stat-err { color: #dc2626; font-weight: 600; }

  .import-table-wrap {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow-x: auto;
    max-height: 260px;
    overflow-y: auto;
  }

  .import-table {
    width: 100%;
    min-width: 420px;
    border-collapse: collapse;
    font-size: .82rem;
  }

  .import-table th {
    background: #f6f8fd;
    padding: .5rem .75rem;
    text-align: left;
    color: #5f6880;
    font-size: .78rem;
    border-bottom: 1px solid #e6ebf3;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .import-table td {
    padding: .42rem .75rem;
    border-bottom: 1px solid #f0f3f9;
    color: #334155;
  }

  .irow-err td { background: #fff7f7; }

  .tag-ok { color: #16a34a; font-weight: 700; }
  .tag-err { color: #dc2626; font-size: .76rem; }

  .import-actions {
    margin-top: .6rem;
  }

  .btn-do-import {
    height: 34px;
    padding: 0 1.2rem;
    border: none;
    border-radius: 8px;
    background: #e8efff;
    color: var(--brand-600);
    font-size: .84rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-do-import:hover { background: #d5e3ff; }
  .btn-do-import:disabled { opacity: .6; cursor: not-allowed; }

  .import-result {
    margin-top: .6rem;
    font-size: .83rem;
    color: #334155;
  }
  .result-ok { color: #16a34a; font-weight: 600; }
  .result-fail { color: #dc2626; }

  .btn-export-failed {
    margin-left: .55rem;
    height: 26px;
    padding: 0 .6rem;
    border: 1px solid #fca5a5;
    border-radius: 6px;
    background: #fff5f5;
    color: #c24141;
    font-size: .74rem;
    cursor: pointer;
  }
  .btn-export-failed:hover {
    background: #ffe5e5;
  }

  .failed-list {
    margin: .35rem 0 0 1rem;
    padding: 0;
    font-size: .78rem;
    color: #dc2626;
    list-style: disc;
  }
  .failed-list em { font-style: normal; font-weight: 600; }

  @media (max-width: 430px) {
    .import-panel-head {
      flex-direction: column;
      align-items: flex-start;
      gap: .4rem;
    }
  }
</style>
