import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
const items = ref([]);
const loading = ref(true);
const error = ref('');
const detailVisible = ref(false);
const currentItem = ref(null);
const router = useRouter();
function previewData(data) {
    const entries = Object.entries(data).slice(0, 3);
    if (entries.length === 0)
        return '-';
    return entries
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : String(v ?? '-')}`)
        .join(' | ');
}
function formatValue(value) {
    if (Array.isArray(value))
        return value.join(', ');
    if (value === null || value === undefined || value === '')
        return '-';
    return String(value);
}
function getDetailFields(item) {
    if (item.fields && item.fields.length > 0) {
        return item.fields;
    }
    return Object.keys(item.data).map((k) => ({ Name: k, Label: k }));
}
function openDetail(item) {
    currentItem.value = item;
    detailVisible.value = true;
}
function closeDetail() {
    detailVisible.value = false;
    currentItem.value = null;
}
onMounted(async () => {
    try {
        const res = await fetch('/api/my/submissions');
        if (res.status === 401) {
            router.push('/login');
            return;
        }
        if (!res.ok)
            throw new Error('加载失败');
        const payload = await res.json();
        items.value = payload.items ?? [];
    }
    catch (e) {
        error.value = e.message || '加载失败';
    }
    finally {
        loading.value = false;
    }
});
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
/** @type {__VLS_StyleScopedClasses['btn-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['container']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['wide']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['container']} */ ;
/** @type {__VLS_StyleScopedClasses['title']} */ ;
/** @type {__VLS_StyleScopedClasses['name']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['wide']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['wide']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['wide']} */ ;
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
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/change-password');
            // @ts-ignore
            [router,];
        } },
    href: "/change-password",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/');
            // @ts-ignore
            [router,];
        } },
    href: "/",
});
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
else if (__VLS_ctx.items.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "state-msg" },
    });
    /** @type {__VLS_StyleScopedClasses['state-msg']} */ ;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "list-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['list-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [item, idx] of __VLS_vFor((__VLS_ctx.items))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (`${item.formName}-${idx}`),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "title" },
        });
        /** @type {__VLS_StyleScopedClasses['title']} */ ;
        (item.formTitle);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (item.formName);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (item.submittedAt || '-');
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "preview" },
        });
        /** @type {__VLS_StyleScopedClasses['preview']} */ ;
        (__VLS_ctx.previewData(item.data));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(__VLS_ctx.items.length === 0))
                        return;
                    __VLS_ctx.openDetail(item);
                    // @ts-ignore
                    [loading, error, error, items, items, previewData, openDetail,];
                } },
            ...{ class: "btn-detail" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-detail']} */ ;
        // @ts-ignore
        [];
    }
}
if (__VLS_ctx.detailVisible && __VLS_ctx.currentItem) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeDetail) },
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
    (__VLS_ctx.currentItem.formTitle);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeDetail) },
        ...{ class: "btn-close" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-close']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.currentItem.formName);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.currentItem.submittedAt || '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "detail-table wide" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['wide']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    for (const [f] of __VLS_vFor((__VLS_ctx.getDetailFields(__VLS_ctx.currentItem)))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            key: (f.Name),
        });
        (f.Label);
        // @ts-ignore
        [detailVisible, currentItem, currentItem, currentItem, currentItem, currentItem, closeDetail, closeDetail, getDetailFields,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    for (const [f] of __VLS_vFor((__VLS_ctx.getDetailFields(__VLS_ctx.currentItem)))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            key: (`v-${f.Name}`),
        });
        (__VLS_ctx.formatValue(__VLS_ctx.currentItem.data[f.Name]));
        // @ts-ignore
        [currentItem, currentItem, getDetailFields, formatValue,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.currentItem.submittedAt || '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.currentItem.ip || '-');
}
// @ts-ignore
[currentItem, currentItem,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
