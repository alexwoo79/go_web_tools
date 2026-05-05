import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import * as XLSX from 'xlsx';
const users = ref([]);
const loading = ref(true);
const error = ref('');
const success = ref('');
const passwordDraft = ref({});
const passwordSaving = ref({});
const deleting = ref({});
const creating = ref(false);
const createForm = ref({
    username: '',
    password: '',
    role: 'user',
});
const importFileInput = ref(null);
const importRows = ref([]);
const importPreviewing = ref(false);
const importing = ref(false);
const importResult = ref(null);
const viewportWidth = ref(9999);
const router = useRouter();
const auth = useAuthStore();
const MOBILE_BREAKPOINT = 430;
const COMPACT_BREAKPOINT = 520;
const isMobile = computed(() => viewportWidth.value <= MOBILE_BREAKPOINT);
const isCompactPhone = computed(() => viewportWidth.value > MOBILE_BREAKPOINT && viewportWidth.value <= COMPACT_BREAKPOINT);
function updateViewportMode() {
    viewportWidth.value = window.innerWidth;
}
onMounted(async () => {
    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    if (!auth.checked) {
        await auth.fetchMe();
    }
    await loadUsers();
});
onBeforeUnmount(() => {
    window.removeEventListener('resize', updateViewportMode);
});
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    auth.setUser(null);
    router.push('/login');
}
async function loadUsers() {
    loading.value = true;
    error.value = '';
    success.value = '';
    try {
        const res = await fetch('/api/admin/users');
        if (!res.ok)
            throw new Error('加载用户失败');
        const payload = await res.json();
        users.value = payload.items ?? [];
        const nextDraft = {};
        for (const u of users.value) {
            nextDraft[String(u.id)] = '';
        }
        passwordDraft.value = nextDraft;
    }
    catch (e) {
        error.value = e.message || '加载失败';
    }
    finally {
        loading.value = false;
    }
}
async function createUser() {
    const username = createForm.value.username.trim();
    const password = createForm.value.password.trim();
    const role = createForm.value.role;
    success.value = '';
    error.value = '';
    if (username.length < 3) {
        error.value = '用户名至少 3 位';
        return;
    }
    if (password.length < 6) {
        error.value = '密码至少 6 位';
        return;
    }
    creating.value = true;
    try {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(payload.error || '新增用户失败');
        }
        createForm.value = { username: '', password: '', role: 'user' };
        success.value = `用户 ${username} 已创建`;
        await loadUsers();
    }
    catch (e) {
        error.value = e.message || '新增用户失败';
    }
    finally {
        creating.value = false;
    }
}
function canDeleteUser(item) {
    if (isProtectedAdmin(item))
        return false;
    return item.id !== auth.user?.id;
}
async function deleteUser(item) {
    if (!canDeleteUser(item)) {
        error.value = isProtectedAdmin(item) ? 'admin用户不可删除' : '不能删除当前登录用户';
        return;
    }
    const confirmed = window.confirm(`确认删除用户 ${item.username} 吗？删除后不可恢复。`);
    if (!confirmed) {
        return;
    }
    const recheck = window.prompt(`请输入用户名 "${item.username}" 以确认删除`)?.trim() ?? '';
    if (recheck !== item.username) {
        error.value = '二次确认失败，已取消删除';
        return;
    }
    success.value = '';
    error.value = '';
    const key = String(item.id);
    deleting.value[key] = true;
    try {
        const res = await fetch(`/api/admin/users/${item.id}`, { method: 'DELETE' });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(payload.error || '删除用户失败');
        }
        success.value = `用户 ${item.username} 已删除`;
        await loadUsers();
    }
    catch (e) {
        error.value = e.message || '删除用户失败';
    }
    finally {
        deleting.value[key] = false;
    }
}
async function updateUserRole(item, role) {
    success.value = '';
    if (isProtectedAdmin(item)) {
        error.value = 'admin用户角色不可修改';
        return;
    }
    if (item.id === auth.user?.id && role !== 'admin') {
        error.value = '当前登录管理员不能将自己降级为普通用户';
        return;
    }
    error.value = '';
    const oldRole = item.role;
    item.role = role;
    try {
        const res = await fetch('/api/admin/user-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: item.id, role }),
        });
        if (!res.ok) {
            const payload = await res.json();
            throw new Error(payload.error || '更新角色失败');
        }
        success.value = `用户 ${item.username} 角色已更新`;
    }
    catch (e) {
        item.role = oldRole;
        error.value = e.message || '更新失败';
    }
}
async function updateUserPassword(item) {
    if (!canEditPassword(item)) {
        error.value = 'admin密码仅允许admin账户本人修改';
        return;
    }
    const key = String(item.id);
    const newPassword = (passwordDraft.value[key] ?? '').trim();
    if (newPassword === '') {
        return;
    }
    success.value = '';
    error.value = '';
    if (newPassword.length < 6) {
        error.value = '新密码至少 6 位';
        return;
    }
    passwordSaving.value[key] = true;
    try {
        const res = await fetch('/api/admin/user-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: item.id, newPassword }),
        });
        if (!res.ok) {
            const payload = await res.json();
            throw new Error(payload.error || '修改密码失败');
        }
        passwordDraft.value[key] = '';
        success.value = `用户 ${item.username} 密码已更新`;
    }
    catch (e) {
        error.value = e.message || '修改密码失败';
    }
    finally {
        passwordSaving.value[key] = false;
    }
}
function canSavePassword(userID) {
    const key = String(userID);
    return (passwordDraft.value[key] ?? '').trim().length > 0;
}
function canEditPassword(item) {
    if (!isProtectedAdmin(item)) {
        return true;
    }
    return auth.user?.username.trim().toLowerCase() === 'admin';
}
function isProtectedAdmin(item) {
    return item.username.trim().toLowerCase() === 'admin';
}
// ---------- 批量导入 ----------
const HEADER_KEYWORDS = ['username', '用户名', 'name', 'user', 'account'];
function isHeaderRow(row) {
    const first = String(row[0] ?? '').trim().toLowerCase();
    return HEADER_KEYWORDS.some((k) => first === k);
}
function validateImportRow(row) {
    const username = String(row[0] ?? '').trim();
    const password = String(row[1] ?? '').trim();
    const rawRole = String(row[2] ?? '').trim().toLowerCase();
    const role = rawRole || 'user';
    let _error = '';
    if (!username)
        _error = '用户名为空';
    else if (username.length < 3)
        _error = '用户名至少3位';
    else if (!password)
        _error = '密码为空';
    else if (password.length < 6)
        _error = '密码至少6位';
    else if (role !== 'user' && role !== 'admin')
        _error = '角色须为 user 或 admin';
    return { username, password, role, _error };
}
async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file)
        return;
    importRows.value = [];
    importResult.value = null;
    importPreviewing.value = true;
    try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) {
            throw new Error('未找到工作表');
        }
        const sheet = wb.Sheets[firstSheetName];
        if (!sheet) {
            throw new Error('工作表读取失败');
        }
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const firstRow = raw[0];
        const startIdx = firstRow && isHeaderRow(firstRow) ? 1 : 0;
        importRows.value = raw
            .slice(startIdx)
            .filter((r) => r.some((c) => String(c).trim()))
            .map(validateImportRow);
    }
    catch {
        error.value = '文件解析失败，请检查格式是否正确';
    }
    finally {
        importPreviewing.value = false;
    }
}
const validImportRows = computed(() => importRows.value.filter((r) => !r._error));
const invalidImportRows = computed(() => importRows.value.filter((r) => r._error));
async function doImport() {
    if (!validImportRows.value.length)
        return;
    importing.value = true;
    error.value = '';
    success.value = '';
    try {
        const res = await fetch('/api/admin/users/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                users: validImportRows.value.map(({ username, password, role }) => ({ username, password, role })),
            }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok)
            throw new Error(payload.error || '导入失败');
        importResult.value = payload;
        if (payload.success > 0) {
            await loadUsers();
            if (payload.failed?.length === 0) {
                importRows.value = [];
                if (importFileInput.value)
                    importFileInput.value.value = '';
            }
        }
    }
    catch (e) {
        error.value = e.message || '导入失败';
    }
    finally {
        importing.value = false;
    }
}
function clearImport() {
    importRows.value = [];
    importResult.value = null;
    if (importFileInput.value)
        importFileInput.value.value = '';
}
function downloadTemplate() {
    const csv = 'username,password,role\nalice,password123,user\nbob,password456,admin\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users_template.csv';
    a.click();
    nextTick(() => URL.revokeObjectURL(url));
}
function exportFailedImportCsv() {
    if (!importResult.value?.failed?.length) {
        return;
    }
    const lines = ['username,reason'];
    for (const f of importResult.value.failed) {
        const username = `"${String(f.username ?? '').replace(/"/g, '""')}"`;
        const reason = `"${String(f.reason ?? '').replace(/"/g, '""')}"`;
        lines.push(`${username},${reason}`);
    }
    const csv = `${lines.join('\n')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `import_failed_${ts}.csv`;
    a.click();
    nextTick(() => URL.revokeObjectURL(url));
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['create-user-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['create-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-create']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-pass']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-delete']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-pass']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-delete']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-created']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-password']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-top']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-id']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-created']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['username']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-row']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-pass']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-pass']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['container']} */ ;
/** @type {__VLS_StyleScopedClasses['create-user-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['create-input']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-pass']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-delete']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-create']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['link']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-logout']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-logout']} */ ;
/** @type {__VLS_StyleScopedClasses['create-user-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-pass']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-delete']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-create']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['role-select']} */ ;
/** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
/** @type {__VLS_StyleScopedClasses['create-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-pass']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-delete']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-create']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['import-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-template']} */ ;
/** @type {__VLS_StyleScopedClasses['import-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['file-label']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-choose-file']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-clear-import']} */ ;
/** @type {__VLS_StyleScopedClasses['import-table']} */ ;
/** @type {__VLS_StyleScopedClasses['import-table']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-do-import']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-do-import']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export-failed']} */ ;
/** @type {__VLS_StyleScopedClasses['failed-list']} */ ;
/** @type {__VLS_StyleScopedClasses['import-panel-head']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "page" },
});
/** @type {__VLS_StyleScopedClasses['page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "site-header" },
});
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "header-right" },
});
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
if (__VLS_ctx.auth.user) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "user-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
    (__VLS_ctx.auth.user.username);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.logout) },
    ...{ class: "btn-logout" },
});
/** @type {__VLS_StyleScopedClasses['btn-logout']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/admin');
            // @ts-ignore
            [auth, auth, logout, router,];
        } },
    href: "/admin",
    ...{ class: "link" },
});
/** @type {__VLS_StyleScopedClasses['link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "container" },
});
/** @type {__VLS_StyleScopedClasses['container']} */ ;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "state-msg" },
    });
    /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "state-msg error" },
    });
    /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    (__VLS_ctx.error);
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    if (__VLS_ctx.success) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "inline-msg success" },
        });
        /** @type {__VLS_StyleScopedClasses['inline-msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['success']} */ ;
        (__VLS_ctx.success);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "create-user-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['create-user-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "create-user-fields" },
    });
    /** @type {__VLS_StyleScopedClasses['create-user-fields']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.createForm.username),
        ...{ class: "create-input" },
        type: "text",
        placeholder: "用户名（至少3位）",
    });
    /** @type {__VLS_StyleScopedClasses['create-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "create-input" },
        type: "password",
        placeholder: "初始密码（至少6位）",
    });
    (__VLS_ctx.createForm.password);
    /** @type {__VLS_StyleScopedClasses['create-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_ctx.createForm.role),
        ...{ class: "role-select create-role" },
    });
    /** @type {__VLS_StyleScopedClasses['role-select']} */ ;
    /** @type {__VLS_StyleScopedClasses['create-role']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "user",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "admin",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.createUser) },
        ...{ class: "btn-create" },
        disabled: (__VLS_ctx.creating),
    });
    /** @type {__VLS_StyleScopedClasses['btn-create']} */ ;
    (__VLS_ctx.creating ? '创建中…' : '新增用户');
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "import-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['import-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "import-panel-head" },
    });
    /** @type {__VLS_StyleScopedClasses['import-panel-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.downloadTemplate) },
        ...{ class: "btn-template" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-template']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "import-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['import-hint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.br)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "import-file-row" },
    });
    /** @type {__VLS_StyleScopedClasses['import-file-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "file-label" },
    });
    /** @type {__VLS_StyleScopedClasses['file-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.handleImportFile) },
        ref: "importFileInput",
        type: "file",
        accept: ".csv,.xlsx,.xls",
        ...{ class: "file-input-hidden" },
    });
    /** @type {__VLS_StyleScopedClasses['file-input-hidden']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "btn-choose-file" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-choose-file']} */ ;
    (__VLS_ctx.importRows.length ? '重新选择文件' : '选择文件');
    if (__VLS_ctx.importRows.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "chosen-filename" },
        });
        /** @type {__VLS_StyleScopedClasses['chosen-filename']} */ ;
        (__VLS_ctx.importRows.length);
    }
    if (__VLS_ctx.importRows.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.clearImport) },
            ...{ class: "btn-clear-import" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-clear-import']} */ ;
    }
    if (__VLS_ctx.importPreviewing) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state-msg" },
        });
        /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
    }
    if (__VLS_ctx.importRows.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "import-preview" },
        });
        /** @type {__VLS_StyleScopedClasses['import-preview']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "preview-stat" },
        });
        /** @type {__VLS_StyleScopedClasses['preview-stat']} */ ;
        (__VLS_ctx.importRows.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "stat-ok" },
        });
        /** @type {__VLS_StyleScopedClasses['stat-ok']} */ ;
        (__VLS_ctx.validImportRows.length);
        if (__VLS_ctx.invalidImportRows.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "stat-err" },
            });
            /** @type {__VLS_StyleScopedClasses['stat-err']} */ ;
            (__VLS_ctx.invalidImportRows.length);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "import-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['import-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "import-table" },
        });
        /** @type {__VLS_StyleScopedClasses['import-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [row, idx] of __VLS_vFor((__VLS_ctx.importRows))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (idx),
                ...{ class: ({ 'irow-err': row._error }) },
            });
            /** @type {__VLS_StyleScopedClasses['irow-err']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.username);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.password ? '••••••' : '');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.role);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            if (row._error) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "tag-err" },
                });
                /** @type {__VLS_StyleScopedClasses['tag-err']} */ ;
                (row._error);
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "tag-ok" },
                });
                /** @type {__VLS_StyleScopedClasses['tag-ok']} */ ;
            }
            // @ts-ignore
            [loading, error, error, success, success, createForm, createForm, createForm, createUser, creating, creating, downloadTemplate, handleImportFile, importRows, importRows, importRows, importRows, importRows, importRows, importRows, clearImport, importPreviewing, validImportRows, invalidImportRows, invalidImportRows,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "import-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['import-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.doImport) },
            ...{ class: "btn-do-import" },
            disabled: (__VLS_ctx.importing || __VLS_ctx.validImportRows.length === 0),
        });
        /** @type {__VLS_StyleScopedClasses['btn-do-import']} */ ;
        (__VLS_ctx.importing ? '导入中…' : `导入 ${__VLS_ctx.validImportRows.length} 位用户`);
    }
    if (__VLS_ctx.importResult) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "import-result" },
        });
        /** @type {__VLS_StyleScopedClasses['import-result']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "result-ok" },
        });
        /** @type {__VLS_StyleScopedClasses['result-ok']} */ ;
        (__VLS_ctx.importResult.success);
        if (__VLS_ctx.importResult.failed.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "result-fail" },
            });
            /** @type {__VLS_StyleScopedClasses['result-fail']} */ ;
            (__VLS_ctx.importResult.failed.length);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.exportFailedImportCsv) },
                ...{ class: "btn-export-failed" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-export-failed']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                ...{ class: "failed-list" },
            });
            /** @type {__VLS_StyleScopedClasses['failed-list']} */ ;
            for (const [f] of __VLS_vFor((__VLS_ctx.importResult.failed))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (f.username),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({});
                (f.username);
                (f.reason);
                // @ts-ignore
                [validImportRows, validImportRows, doImport, importing, importing, importResult, importResult, importResult, importResult, importResult, exportFailedImportCsv,];
            }
        }
    }
    if (!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap user-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        /** @type {__VLS_StyleScopedClasses['user-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [u] of __VLS_vFor((__VLS_ctx.users))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (u.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (u.id);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "username" },
            });
            /** @type {__VLS_StyleScopedClasses['username']} */ ;
            (u.username);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.updateUserRole(u, $event.target.value);
                        // @ts-ignore
                        [isMobile, isCompactPhone, users, updateUserRole,];
                    } },
                ...{ class: "role-select" },
                value: (u.role),
                disabled: (__VLS_ctx.isProtectedAdmin(u)),
                title: (__VLS_ctx.isProtectedAdmin(u) ? 'admin用户角色不可修改' : ''),
            });
            /** @type {__VLS_StyleScopedClasses['role-select']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "user",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "admin",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (u.createdAt);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ class: "pass-input" },
                type: "password",
                placeholder: "输入新密码",
                disabled: (!__VLS_ctx.canEditPassword(u)),
                title: (!__VLS_ctx.canEditPassword(u) ? 'admin密码仅允许admin账户本人修改' : ''),
            });
            (__VLS_ctx.passwordDraft[String(u.id)]);
            /** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.updateUserPassword(u);
                        // @ts-ignore
                        [isProtectedAdmin, isProtectedAdmin, canEditPassword, canEditPassword, passwordDraft, updateUserPassword,];
                    } },
                ...{ class: "btn-pass" },
                disabled: (__VLS_ctx.passwordSaving[String(u.id)] || !__VLS_ctx.canSavePassword(u.id) || !__VLS_ctx.canEditPassword(u)),
                title: (!__VLS_ctx.canEditPassword(u) ? 'admin密码仅允许admin账户本人修改' : ''),
            });
            /** @type {__VLS_StyleScopedClasses['btn-pass']} */ ;
            (__VLS_ctx.passwordSaving[String(u.id)] ? '密码保存中…' : '密码保存');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.deleteUser(u);
                        // @ts-ignore
                        [canEditPassword, canEditPassword, passwordSaving, passwordSaving, canSavePassword, deleteUser,];
                    } },
                ...{ class: "btn-delete" },
                disabled: (__VLS_ctx.deleting[String(u.id)] || !__VLS_ctx.canDeleteUser(u)),
                title: (!__VLS_ctx.canDeleteUser(u) ? (__VLS_ctx.isProtectedAdmin(u) ? 'admin用户不可删除' : '不能删除当前登录用户') : ''),
            });
            /** @type {__VLS_StyleScopedClasses['btn-delete']} */ ;
            (__VLS_ctx.deleting[String(u.id)] ? '删除中…' : '删除用户');
            // @ts-ignore
            [isProtectedAdmin, deleting, deleting, canDeleteUser, canDeleteUser,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mobile-list" },
            ...{ class: ({ 'mobile-list-compact': __VLS_ctx.isCompactPhone }) },
        });
        /** @type {__VLS_StyleScopedClasses['mobile-list']} */ ;
        /** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
        for (const [u] of __VLS_vFor((__VLS_ctx.users))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
                key: (`mobile-${u.id}`),
                ...{ class: "mobile-card" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-top" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-top']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "mobile-id" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-id']} */ ;
            (u.id);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "username" },
            });
            /** @type {__VLS_StyleScopedClasses['username']} */ ;
            (u.username);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-row" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "mobile-label" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-label']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.updateUserRole(u, $event.target.value);
                        // @ts-ignore
                        [isCompactPhone, users, updateUserRole,];
                    } },
                ...{ class: "role-select" },
                value: (u.role),
                disabled: (__VLS_ctx.isProtectedAdmin(u)),
                title: (__VLS_ctx.isProtectedAdmin(u) ? 'admin用户角色不可修改' : ''),
            });
            /** @type {__VLS_StyleScopedClasses['role-select']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "user",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "admin",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-row mobile-created" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-row']} */ ;
            /** @type {__VLS_StyleScopedClasses['mobile-created']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "mobile-label" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-label']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (u.createdAt);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-row mobile-password" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-row']} */ ;
            /** @type {__VLS_StyleScopedClasses['mobile-password']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "mobile-label" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-label']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ class: "pass-input" },
                type: "password",
                placeholder: "输入新密码",
                disabled: (!__VLS_ctx.canEditPassword(u)),
                title: (!__VLS_ctx.canEditPassword(u) ? 'admin密码仅允许admin账户本人修改' : ''),
            });
            (__VLS_ctx.passwordDraft[String(u.id)]);
            /** @type {__VLS_StyleScopedClasses['pass-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-row" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.updateUserPassword(u);
                        // @ts-ignore
                        [isProtectedAdmin, isProtectedAdmin, canEditPassword, canEditPassword, passwordDraft, updateUserPassword,];
                    } },
                ...{ class: "btn-pass" },
                disabled: (__VLS_ctx.passwordSaving[String(u.id)] || !__VLS_ctx.canSavePassword(u.id) || !__VLS_ctx.canEditPassword(u)),
                title: (!__VLS_ctx.canEditPassword(u) ? 'admin密码仅允许admin账户本人修改' : ''),
            });
            /** @type {__VLS_StyleScopedClasses['btn-pass']} */ ;
            (__VLS_ctx.passwordSaving[String(u.id)] ? '密码保存中…' : '密码保存');
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.deleteUser(u);
                        // @ts-ignore
                        [canEditPassword, canEditPassword, passwordSaving, passwordSaving, canSavePassword, deleteUser,];
                    } },
                ...{ class: "btn-delete" },
                disabled: (__VLS_ctx.deleting[String(u.id)] || !__VLS_ctx.canDeleteUser(u)),
                title: (!__VLS_ctx.canDeleteUser(u) ? (__VLS_ctx.isProtectedAdmin(u) ? 'admin用户不可删除' : '不能删除当前登录用户') : ''),
            });
            /** @type {__VLS_StyleScopedClasses['btn-delete']} */ ;
            (__VLS_ctx.deleting[String(u.id)] ? '删除中…' : '删除用户');
            // @ts-ignore
            [isProtectedAdmin, deleting, deleting, canDeleteUser, canDeleteUser,];
        }
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
