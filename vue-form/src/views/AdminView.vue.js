import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
const forms = ref([]);
const user = ref(null);
const loading = ref(true);
const error = ref('');
const selectedStatus = ref('all');
const selectedCategory = ref('all');
const keyword = ref('');
const includeExpired = ref(true);
const categoryOptions = ref([]);
const summary = ref({
    total: 0,
    visible: 0,
    pinnedCount: 0,
    expiredCount: 0,
    byStatus: {
        published: 0,
        draft: 0,
        archived: 0,
    },
    byCategory: {},
});
const showDataModal = ref(false);
const dataLoading = ref(false);
const dataError = ref('');
const currentFormTitle = ref('');
const dataFields = ref([]);
const dataRows = ref([]);
const showShareModal = ref(false);
const shareLoading = ref(false);
const shareError = ref('');
const shareFormTitle = ref('');
const generatedShareURL = ref('');
const generatedShareExpireAt = ref('');
const shareCopied = ref(false);
const showEditModal = ref(false);
const editLoading = ref(false);
const editSaving = ref(false);
const editError = ref('');
const editContent = ref('');
const editSourceFile = ref('');
const editFormName = ref('');
const editSaveResult = ref('');
const viewportWidth = ref(9999);
const router = useRouter();
const auth = useAuthStore();
const MOBILE_BREAKPOINT = 430;
const COMPACT_BREAKPOINT = 520;
const isMobile = computed(() => viewportWidth.value <= MOBILE_BREAKPOINT);
const isCompactPhone = computed(() => viewportWidth.value > MOBILE_BREAKPOINT && viewportWidth.value <= COMPACT_BREAKPOINT);
const hasActiveFilters = computed(() => selectedStatus.value !== 'all' ||
    selectedCategory.value !== 'all' ||
    keyword.value.trim() !== '' ||
    !includeExpired.value);
function updateViewportMode() {
    viewportWidth.value = window.innerWidth;
}
function buildAdminQuery() {
    const params = new URLSearchParams();
    if (selectedStatus.value !== 'all') {
        params.set('status', selectedStatus.value);
    }
    if (selectedCategory.value !== 'all') {
        params.set('category', selectedCategory.value);
    }
    const trimmedKeyword = keyword.value.trim();
    if (trimmedKeyword) {
        params.set('keyword', trimmedKeyword);
    }
    if (!includeExpired.value) {
        params.set('include_expired', 'false');
    }
    return params.toString();
}
async function fetchAdminData() {
    loading.value = true;
    error.value = '';
    try {
        const query = buildAdminQuery();
        const res = await fetch(query ? `/api/admin?${query}` : '/api/admin');
        if (res.status === 401) {
            router.push('/login');
            return;
        }
        if (!res.ok)
            throw new Error('加载失败');
        const data = await res.json();
        forms.value = data.forms ?? [];
        user.value = data.user ?? null;
        categoryOptions.value = data.availableCategories ?? [];
        summary.value = {
            total: data.summary?.total ?? 0,
            visible: data.summary?.visible ?? 0,
            pinnedCount: data.summary?.pinnedCount ?? 0,
            expiredCount: data.summary?.expiredCount ?? 0,
            byStatus: {
                published: data.summary?.byStatus?.published ?? 0,
                draft: data.summary?.byStatus?.draft ?? 0,
                archived: data.summary?.byStatus?.archived ?? 0,
            },
            byCategory: data.summary?.byCategory ?? {},
        };
    }
    catch (e) {
        error.value = e.message || '加载失败';
    }
    finally {
        loading.value = false;
    }
}
function applyFilters() {
    fetchAdminData();
}
function resetFilters() {
    selectedStatus.value = 'all';
    selectedCategory.value = 'all';
    keyword.value = '';
    includeExpired.value = true;
    fetchAdminData();
}
onMounted(async () => {
    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    await fetchAdminData();
});
onBeforeUnmount(() => {
    window.removeEventListener('resize', updateViewportMode);
});
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    auth.setUser(null);
    router.push('/login');
}
function exportCSV(formName) {
    window.location.href = `/api/export/${formName}`;
}
function normalizeCellValue(value) {
    if (Array.isArray(value))
        return value.join(', ');
    if (value === null || value === undefined || value === '')
        return '-';
    return String(value);
}
async function viewData(form) {
    showDataModal.value = true;
    dataLoading.value = true;
    dataError.value = '';
    currentFormTitle.value = form.Title;
    dataFields.value = [];
    dataRows.value = [];
    try {
        const res = await fetch(`/api/data/${form.Name}`);
        if (!res.ok)
            throw new Error('加载数据失败');
        const payload = await res.json();
        dataFields.value = payload.fields ?? [];
        dataRows.value = payload.data ?? [];
    }
    catch (e) {
        dataError.value = e.message || '加载失败';
    }
    finally {
        dataLoading.value = false;
    }
}
function closeDataModal() {
    showDataModal.value = false;
}
async function generateShareLink(form) {
    showShareModal.value = true;
    shareLoading.value = true;
    shareError.value = '';
    shareCopied.value = false;
    shareFormTitle.value = form.Title;
    generatedShareURL.value = '';
    generatedShareExpireAt.value = form.ExpireAt ?? '';
    try {
        const res = await fetch('/api/admin/share-links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formName: form.Name }),
        });
        if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload.error || '生成链接失败');
        }
        const payload = await res.json();
        generatedShareURL.value = payload.url ?? '';
        generatedShareExpireAt.value = payload.expireAt ?? '';
    }
    catch (e) {
        shareError.value = e.message || '生成链接失败';
    }
    finally {
        shareLoading.value = false;
    }
}
async function copyShareLink() {
    if (!generatedShareURL.value)
        return;
    shareError.value = '';
    // Clipboard API requires secure contexts. Fallback keeps copy usable on intranet HTTP.
    const fallbackCopy = (text) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        let copied = false;
        try {
            copied = document.execCommand('copy');
        }
        finally {
            document.body.removeChild(textarea);
        }
        return copied;
    };
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(generatedShareURL.value);
            shareCopied.value = true;
            return;
        }
        shareCopied.value = fallbackCopy(generatedShareURL.value);
    }
    catch {
        shareCopied.value = fallbackCopy(generatedShareURL.value);
    }
    if (!shareCopied.value) {
        shareCopied.value = false;
        shareError.value = '复制失败，请手动选择链接并复制。';
    }
}
function closeShareModal() {
    showShareModal.value = false;
}
async function openEditModal(form) {
    showEditModal.value = true;
    editLoading.value = true;
    editError.value = '';
    editSaveResult.value = '';
    editFormName.value = form.Name;
    editContent.value = '';
    editSourceFile.value = '';
    try {
        const res = await fetch(`/api/admin/form-config/${form.Name}`);
        if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload.error || '加载配置失败');
        }
        const payload = await res.json();
        editContent.value = payload.content ?? '';
        editSourceFile.value = payload.source ?? '';
    }
    catch (e) {
        editError.value = e.message || '加载失败';
    }
    finally {
        editLoading.value = false;
    }
}
async function saveFormConfig() {
    editSaving.value = true;
    editError.value = '';
    editSaveResult.value = '';
    try {
        const res = await fetch(`/api/admin/form-config/${editFormName.value}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editContent.value }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(payload.error || '保存失败');
        }
        editSaveResult.value = payload.message || '配置已保存并重载';
        await fetchAdminData();
    }
    catch (e) {
        editError.value = e.message || '保存失败';
    }
    finally {
        editSaving.value = false;
    }
}
function closeEditModal() {
    showEditModal.value = false;
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-logout']} */ ;
/** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-check']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-check']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-check']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-apply']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-reset']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-reset']} */ ;
/** @type {__VLS_StyleScopedClasses['form-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view-data']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-share']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-analytics']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view-data']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-share']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-analytics']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view-data']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-share']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-analytics']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-slug']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view-data']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-share']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['container']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-keyword']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-check']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['col-num']} */ ;
/** @type {__VLS_StyleScopedClasses['col-action']} */ ;
/** @type {__VLS_StyleScopedClasses['actions-group']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view-data']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-share']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['link']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-logout']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-logout']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view-data']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-share']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-keyword']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-check']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-value']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['actions-group']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view-data']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-view']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-share']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['yaml-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-save-config']} */ ;
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
if (__VLS_ctx.user) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "user-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['user-badge']} */ ;
    (__VLS_ctx.user.Username);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/admin/users');
            // @ts-ignore
            [user, user, router,];
        } },
    href: "/admin/users",
    ...{ class: "link" },
});
/** @type {__VLS_StyleScopedClasses['link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/admin/analytics');
            // @ts-ignore
            [router,];
        } },
    href: "/admin/analytics",
    ...{ class: "link" },
});
/** @type {__VLS_StyleScopedClasses['link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.logout) },
    ...{ class: "btn-logout" },
});
/** @type {__VLS_StyleScopedClasses['btn-logout']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/');
            // @ts-ignore
            [router, logout,];
        } },
    href: "/",
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "section-title" },
    });
    /** @type {__VLS_StyleScopedClasses['section-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "filter-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "filter-field" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_ctx.selectedStatus),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "all",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "published",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "draft",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "archived",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "filter-field" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_ctx.selectedCategory),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "all",
    });
    for (const [category] of __VLS_vFor((__VLS_ctx.categoryOptions))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (category),
            value: (category),
        });
        (category);
        // @ts-ignore
        [loading, error, error, selectedStatus, selectedCategory, categoryOptions,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "filter-field filter-keyword" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['filter-keyword']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeyup: (__VLS_ctx.applyFilters) },
        value: (__VLS_ctx.keyword),
        type: "text",
        placeholder: "名称 / 标题 / 描述",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "filter-check" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-check']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
    });
    (__VLS_ctx.includeExpired);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.applyFilters) },
        ...{ class: "btn-apply" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-apply']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.resetFilters) },
        ...{ class: "btn-reset" },
        disabled: (!__VLS_ctx.hasActiveFilters),
    });
    /** @type {__VLS_StyleScopedClasses['btn-reset']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "summary-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
        ...{ class: "summary-card" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "summary-label" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "summary-value" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-value']} */ ;
    (__VLS_ctx.summary.visible);
    (__VLS_ctx.summary.total);
    __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
        ...{ class: "summary-card" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "summary-label" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "summary-value" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-value']} */ ;
    (__VLS_ctx.summary.byStatus.published);
    __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
        ...{ class: "summary-card" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "summary-label" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "summary-value" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-value']} */ ;
    (__VLS_ctx.summary.byStatus.draft);
    (__VLS_ctx.summary.byStatus.archived);
    __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
        ...{ class: "summary-card" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "summary-label" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "summary-value" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-value']} */ ;
    (__VLS_ctx.summary.pinnedCount);
    (__VLS_ctx.summary.expiredCount);
    if (!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.colgroup, __VLS_intrinsics.colgroup)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
            ...{ class: "col-name" },
        });
        /** @type {__VLS_StyleScopedClasses['col-name']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
            ...{ class: "col-num" },
        });
        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
            ...{ class: "col-num" },
        });
        /** @type {__VLS_StyleScopedClasses['col-num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
            ...{ class: "col-action" },
        });
        /** @type {__VLS_StyleScopedClasses['col-action']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "th-name" },
        });
        /** @type {__VLS_StyleScopedClasses['th-name']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "th-num" },
        });
        /** @type {__VLS_StyleScopedClasses['th-num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "th-num" },
        });
        /** @type {__VLS_StyleScopedClasses['th-num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "th-action" },
        });
        /** @type {__VLS_StyleScopedClasses['th-action']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [form] of __VLS_vFor((__VLS_ctx.forms))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (form.Name),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-name" },
            });
            /** @type {__VLS_StyleScopedClasses['form-name']} */ ;
            (form.Title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-slug" },
            });
            /** @type {__VLS_StyleScopedClasses['form-slug']} */ ;
            (form.Name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "form-meta" },
            });
            /** @type {__VLS_StyleScopedClasses['form-meta']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (form.Category || 'general');
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (form.Status || 'published');
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (form.SortOrder ?? 0);
            if (form.Pinned) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            }
            if (form.IsExpired) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "num-cell" },
            });
            /** @type {__VLS_StyleScopedClasses['num-cell']} */ ;
            (form.FieldCount);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "num-cell" },
            });
            /** @type {__VLS_StyleScopedClasses['num-cell']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge" },
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            (form.DataCount);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "actions-cell" },
            });
            /** @type {__VLS_StyleScopedClasses['actions-cell']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "actions-group" },
            });
            /** @type {__VLS_StyleScopedClasses['actions-group']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.viewData(form);
                        // @ts-ignore
                        [applyFilters, applyFilters, keyword, includeExpired, resetFilters, hasActiveFilters, summary, summary, summary, summary, summary, summary, summary, isMobile, isCompactPhone, forms, viewData,];
                    } },
                ...{ class: "btn-view-data" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-view-data']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.router.push(`/forms/${form.Name}`);
                        // @ts-ignore
                        [router,];
                    } },
                ...{ class: "btn-view" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-view']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.generateShareLink(form);
                        // @ts-ignore
                        [generateShareLink,];
                    } },
                ...{ class: "btn-share" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-share']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.openEditModal(form);
                        // @ts-ignore
                        [openEditModal,];
                    } },
                ...{ class: "btn-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.exportCSV(form.Name);
                        // @ts-ignore
                        [exportCSV,];
                    } },
                ...{ class: "btn-export" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.router.push(`/admin/analytics/forms/${form.Name}`);
                        // @ts-ignore
                        [router,];
                    } },
                ...{ class: "btn-analytics" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-analytics']} */ ;
            // @ts-ignore
            [];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mobile-list" },
            ...{ class: ({ 'mobile-list-compact': __VLS_ctx.isCompactPhone }) },
        });
        /** @type {__VLS_StyleScopedClasses['mobile-list']} */ ;
        /** @type {__VLS_StyleScopedClasses['mobile-list-compact']} */ ;
        for (const [form] of __VLS_vFor((__VLS_ctx.forms))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
                key: (`mobile-${form.Name}`),
                ...{ class: "mobile-card" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-title" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-title']} */ ;
            (form.Title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-slug" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-slug']} */ ;
            (form.Name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-meta" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-meta']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (form.Category || 'general');
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (form.Status || 'published');
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (form.SortOrder ?? 0);
            if (form.Pinned) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            }
            if (form.IsExpired) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-stats" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-stats']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (form.FieldCount);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (form.DataCount);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mobile-actions" },
            });
            /** @type {__VLS_StyleScopedClasses['mobile-actions']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.viewData(form);
                        // @ts-ignore
                        [isCompactPhone, forms, viewData,];
                    } },
                ...{ class: "btn-view-data" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-view-data']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.router.push(`/forms/${form.Name}`);
                        // @ts-ignore
                        [router,];
                    } },
                ...{ class: "btn-view" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-view']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.generateShareLink(form);
                        // @ts-ignore
                        [generateShareLink,];
                    } },
                ...{ class: "btn-share" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-share']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.openEditModal(form);
                        // @ts-ignore
                        [openEditModal,];
                    } },
                ...{ class: "btn-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.exportCSV(form.Name);
                        // @ts-ignore
                        [exportCSV,];
                    } },
                ...{ class: "btn-export" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.isMobile && !__VLS_ctx.isCompactPhone))
                            return;
                        __VLS_ctx.router.push(`/admin/analytics/forms/${form.Name}`);
                        // @ts-ignore
                        [router,];
                    } },
                ...{ class: "btn-analytics" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-analytics']} */ ;
            // @ts-ignore
            [];
        }
    }
}
if (__VLS_ctx.showShareModal) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeShareModal) },
        ...{ class: "modal-mask" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-mask']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-panel share-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['share-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-header" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.shareFormTitle);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeShareModal) },
        ...{ class: "btn-close" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-close']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-body" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
    if (__VLS_ctx.shareLoading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state-msg" },
        });
        /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
    }
    else if (__VLS_ctx.shareError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state-msg error" },
        });
        /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.shareError);
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "share-body" },
        });
        /** @type {__VLS_StyleScopedClasses['share-body']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "share-tip" },
        });
        /** @type {__VLS_StyleScopedClasses['share-tip']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "share-link-box" },
        });
        /** @type {__VLS_StyleScopedClasses['share-link-box']} */ ;
        (__VLS_ctx.generatedShareURL);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "share-expire" },
        });
        /** @type {__VLS_StyleScopedClasses['share-expire']} */ ;
        (__VLS_ctx.generatedShareExpireAt || '长期有效');
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "share-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['share-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.copyShareLink) },
            ...{ class: "btn-share-copy" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-share-copy']} */ ;
        if (__VLS_ctx.shareCopied) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "share-copied" },
            });
            /** @type {__VLS_StyleScopedClasses['share-copied']} */ ;
        }
    }
}
if (__VLS_ctx.showEditModal) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeEditModal) },
        ...{ class: "modal-mask" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-mask']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-panel edit-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['edit-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-header" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "edit-header-info" },
    });
    /** @type {__VLS_StyleScopedClasses['edit-header-info']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.editFormName);
    if (__VLS_ctx.editSourceFile) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "edit-source-file" },
        });
        /** @type {__VLS_StyleScopedClasses['edit-source-file']} */ ;
        (__VLS_ctx.editSourceFile);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeEditModal) },
        ...{ class: "btn-close" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-close']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-body edit-modal-body" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
    /** @type {__VLS_StyleScopedClasses['edit-modal-body']} */ ;
    if (__VLS_ctx.editLoading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state-msg" },
        });
        /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
    }
    else if (__VLS_ctx.editError && !__VLS_ctx.editContent) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state-msg error" },
        });
        /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.editError);
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.textarea)({
            value: (__VLS_ctx.editContent),
            ...{ class: "yaml-editor" },
            spellcheck: "false",
            autocomplete: "off",
            autocorrect: "off",
            autocapitalize: "off",
        });
        /** @type {__VLS_StyleScopedClasses['yaml-editor']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "edit-footer" },
        });
        /** @type {__VLS_StyleScopedClasses['edit-footer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "edit-messages" },
        });
        /** @type {__VLS_StyleScopedClasses['edit-messages']} */ ;
        if (__VLS_ctx.editError) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "edit-error" },
            });
            /** @type {__VLS_StyleScopedClasses['edit-error']} */ ;
            (__VLS_ctx.editError);
        }
        else if (__VLS_ctx.editSaveResult) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "edit-success" },
            });
            /** @type {__VLS_StyleScopedClasses['edit-success']} */ ;
            (__VLS_ctx.editSaveResult);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "edit-footer-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['edit-footer-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.closeEditModal) },
            ...{ class: "btn-close" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-close']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.saveFormConfig) },
            ...{ class: "btn-save-config" },
            disabled: (__VLS_ctx.editSaving),
        });
        /** @type {__VLS_StyleScopedClasses['btn-save-config']} */ ;
        (__VLS_ctx.editSaving ? '保存中…' : '保存并重载');
    }
}
if (__VLS_ctx.showDataModal) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeDataModal) },
        ...{ class: "modal-mask" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-mask']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-header" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.currentFormTitle);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeDataModal) },
        ...{ class: "btn-close" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-close']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-body" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
    if (__VLS_ctx.dataLoading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state-msg" },
        });
        /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
    }
    else if (__VLS_ctx.dataError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state-msg error" },
        });
        /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.dataError);
    }
    else if (__VLS_ctx.dataRows.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state-msg" },
        });
        /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "data-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['data-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "data-table" },
        });
        /** @type {__VLS_StyleScopedClasses['data-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        for (const [field] of __VLS_vFor((__VLS_ctx.dataFields))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                key: (field.Name),
            });
            (field.Label);
            // @ts-ignore
            [showShareModal, closeShareModal, closeShareModal, shareFormTitle, shareLoading, shareError, shareError, generatedShareURL, generatedShareExpireAt, copyShareLink, shareCopied, showEditModal, closeEditModal, closeEditModal, closeEditModal, editFormName, editSourceFile, editSourceFile, editLoading, editError, editError, editError, editError, editContent, editContent, editSaveResult, editSaveResult, saveFormConfig, editSaving, editSaving, showDataModal, closeDataModal, closeDataModal, currentFormTitle, dataLoading, dataError, dataError, dataRows, dataFields,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [row, idx] of __VLS_vFor((__VLS_ctx.dataRows))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (idx),
            });
            for (const [field] of __VLS_vFor((__VLS_ctx.dataFields))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (field.Name),
                });
                (__VLS_ctx.normalizeCellValue(row[field.Name]));
                // @ts-ignore
                [dataRows, dataFields, normalizeCellValue,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.normalizeCellValue(row['_submitted_at']));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.normalizeCellValue(row['_ip']));
            // @ts-ignore
            [normalizeCellValue, normalizeCellValue,];
        }
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
