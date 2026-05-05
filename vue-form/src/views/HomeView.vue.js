import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
const forms = ref([]);
const loading = ref(true);
const error = ref('');
const router = useRouter();
const auth = useAuthStore();
const CATEGORY_LABELS = {
    general: '通用表单',
    hr: '人力资源',
    marketing: '市场运营',
    survey: '调研问卷',
    project: '项目管理',
};
const groupedForms = computed(() => {
    const map = new Map();
    for (const form of forms.value) {
        const key = (form.Category ?? 'general').trim().toLowerCase() || 'general';
        const list = map.get(key) ?? [];
        list.push(form);
        map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
        key,
        title: CATEGORY_LABELS[key] ?? key,
        items,
    }));
});
onMounted(async () => {
    try {
        if (!auth.checked) {
            await auth.fetchMe();
        }
        const res = await fetch('/api/forms');
        if (!res.ok)
            throw new Error('加载失败');
        forms.value = await res.json();
    }
    catch (e) {
        error.value = e.message;
    }
    finally {
        loading.value = false;
    }
});
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    auth.setUser(null);
    router.push('/login');
}
function formatDeadline(raw) {
    const value = (raw ?? '').trim();
    if (!value)
        return '长期有效';
    if (value.includes('T')) {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
    }
    const datePart = value.split(' ')[0];
    return datePart ?? value;
}
function isExpiringToday(raw) {
    const value = (raw ?? '').trim();
    if (!value)
        return false;
    let expireDate;
    if (value.includes('T')) {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) {
            expireDate = d;
        }
        else {
            return false;
        }
    }
    else {
        const datePart = value.split(' ')[0] ?? '';
        const [y, m, d] = datePart.split('-').map(Number);
        if (!y || !m || !d)
            return false;
        expireDate = new Date(y, m - 1, d, 23, 59, 59);
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);
    return expireDate <= tomorrow;
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['table-row']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['table-row']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['container']} */ ;
/** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['cell-title']} */ ;
/** @type {__VLS_StyleScopedClasses['cell-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-user-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['header-user-role']} */ ;
/** @type {__VLS_StyleScopedClasses['container']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['cell-title']} */ ;
/** @type {__VLS_StyleScopedClasses['cell-deadline']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['form-table']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "page" },
});
/** @type {__VLS_StyleScopedClasses['page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "site-header" },
});
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({});
if (__VLS_ctx.auth.user) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "header-user-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['header-user-badge']} */ ;
    (__VLS_ctx.auth.user.username);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "header-user-role" },
    });
    /** @type {__VLS_StyleScopedClasses['header-user-role']} */ ;
    (__VLS_ctx.auth.user.role === 'admin' ? '管理员' : '普通用户');
}
if (__VLS_ctx.auth.user) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.auth.user))
                    return;
                __VLS_ctx.router.push('/change-password');
                // @ts-ignore
                [auth, auth, auth, auth, router,];
            } },
        href: "/change-password",
    });
}
if (__VLS_ctx.auth.user?.role === 'admin') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.auth.user?.role === 'admin'))
                    return;
                __VLS_ctx.router.push('/admin');
                // @ts-ignore
                [auth, router,];
            } },
        href: "/admin",
    });
}
if (__VLS_ctx.auth.user) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.auth.user))
                    return;
                __VLS_ctx.router.push('/my-submissions');
                // @ts-ignore
                [auth, router,];
            } },
        href: "/my-submissions",
    });
}
if (!__VLS_ctx.auth.user) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.auth.user))
                    return;
                __VLS_ctx.router.push('/login');
                // @ts-ignore
                [auth, router,];
            } },
        href: "/login",
    });
}
if (!__VLS_ctx.auth.user) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.auth.user))
                    return;
                __VLS_ctx.router.push('/register');
                // @ts-ignore
                [auth, router,];
            } },
        href: "/register",
    });
}
if (__VLS_ctx.auth.user) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
        ...{ onClick: (__VLS_ctx.logout) },
        href: "#",
    });
}
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
else if (__VLS_ctx.forms.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "state-msg" },
    });
    /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "category-list" },
    });
    /** @type {__VLS_StyleScopedClasses['category-list']} */ ;
    for (const [group] of __VLS_vFor((__VLS_ctx.groupedForms))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            key: (group.key),
            ...{ class: "category-block" },
        });
        /** @type {__VLS_StyleScopedClasses['category-block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
            ...{ class: "category-title" },
        });
        /** @type {__VLS_StyleScopedClasses['category-title']} */ ;
        (group.title);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "form-table" },
        });
        /** @type {__VLS_StyleScopedClasses['form-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.colgroup, __VLS_intrinsics.colgroup)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
            ...{ class: "col-name" },
        });
        /** @type {__VLS_StyleScopedClasses['col-name']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
            ...{ class: "col-desc" },
        });
        /** @type {__VLS_StyleScopedClasses['col-desc']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
            ...{ class: "col-deadline" },
        });
        /** @type {__VLS_StyleScopedClasses['col-deadline']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.col)({
            ...{ class: "col-action" },
        });
        /** @type {__VLS_StyleScopedClasses['col-action']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "th-deadline" },
        });
        /** @type {__VLS_StyleScopedClasses['th-deadline']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "th-action" },
        });
        /** @type {__VLS_StyleScopedClasses['th-action']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [form] of __VLS_vFor((group.items))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(__VLS_ctx.forms.length === 0))
                            return;
                        __VLS_ctx.router.push(`/forms/${form.Name}`);
                        // @ts-ignore
                        [auth, router, logout, loading, error, error, forms, groupedForms,];
                    } },
                key: (form.Name),
                ...{ class: "table-row" },
            });
            /** @type {__VLS_StyleScopedClasses['table-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cell-main" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-main']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
                ...{ class: "cell-title" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-title']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (form.Title);
            if (form.Pinned) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "cell-pin" },
                });
                /** @type {__VLS_StyleScopedClasses['cell-pin']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "cell-desc" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-desc']} */ ;
            (form.Description);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "td-deadline" },
            });
            /** @type {__VLS_StyleScopedClasses['td-deadline']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: ({ 'cell-deadline': true, 'deadline-urgent': __VLS_ctx.isExpiringToday(form.ExpireAt) }) },
            });
            /** @type {__VLS_StyleScopedClasses['cell-deadline']} */ ;
            /** @type {__VLS_StyleScopedClasses['deadline-urgent']} */ ;
            (__VLS_ctx.formatDeadline(form.ExpireAt));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "td-action" },
            });
            /** @type {__VLS_StyleScopedClasses['td-action']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(__VLS_ctx.forms.length === 0))
                            return;
                        __VLS_ctx.router.push(`/forms/${form.Name}`);
                        // @ts-ignore
                        [router, isExpiringToday, formatDeadline,];
                    } },
                type: "button",
                ...{ class: "btn" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "btn-arrow" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-arrow']} */ ;
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
