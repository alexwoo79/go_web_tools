import { ref } from 'vue';
const emit = defineEmits();
const dragging = ref(false);
const uploading = ref(false);
const error = ref('');
const uploaded = ref(null);
async function handleFile(file) {
    const allowed = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const extOk = /\.(csv|xlsx)$/i.test(file.name);
    if (!allowed.includes(file.type) && !extOk) {
        error.value = '仅支持 CSV 或 XLSX 文件';
        return;
    }
    error.value = '';
    uploading.value = true;
    try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/admin/analytics/datasets/upload', {
            method: 'POST',
            credentials: 'include',
            body: fd
        });
        if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg || `上传失败 (${res.status})`);
        }
        const data = await res.json();
        uploaded.value = data;
        emit('uploaded', data);
    }
    catch (e) {
        error.value = e.message ?? '上传出错';
    }
    finally {
        uploading.value = false;
    }
}
function onDrop(e) {
    dragging.value = false;
    const file = e.dataTransfer?.files?.[0];
    if (file)
        handleFile(file);
}
function onInputChange(e) {
    const file = e.target.files?.[0];
    if (file)
        handleFile(file);
}
function reset() {
    uploaded.value = null;
    error.value = '';
}
const __VLS_exposed = { reset };
defineExpose(__VLS_exposed);
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['drop-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-text']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "dataset-upload" },
});
/** @type {__VLS_StyleScopedClasses['dataset-upload']} */ ;
if (!__VLS_ctx.uploaded) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onDragover: (...[$event]) => {
                if (!(!__VLS_ctx.uploaded))
                    return;
                __VLS_ctx.dragging = true;
                // @ts-ignore
                [uploaded, dragging,];
            } },
        ...{ onDragleave: (...[$event]) => {
                if (!(!__VLS_ctx.uploaded))
                    return;
                __VLS_ctx.dragging = false;
                // @ts-ignore
                [dragging,];
            } },
        ...{ onDrop: (__VLS_ctx.onDrop) },
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.uploaded))
                    return;
                __VLS_ctx.$refs.fileInput.click();
                // @ts-ignore
                [onDrop, $refs,];
            } },
        ...{ class: "drop-zone" },
        ...{ class: ({ dragging: __VLS_ctx.dragging, uploading: __VLS_ctx.uploading }) },
    });
    /** @type {__VLS_StyleScopedClasses['drop-zone']} */ ;
    /** @type {__VLS_StyleScopedClasses['dragging']} */ ;
    /** @type {__VLS_StyleScopedClasses['uploading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.onInputChange) },
        ref: "fileInput",
        type: "file",
        accept: ".csv,.xlsx",
        ...{ style: {} },
    });
    if (__VLS_ctx.uploading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
}
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "upload-error" },
    });
    /** @type {__VLS_StyleScopedClasses['upload-error']} */ ;
    (__VLS_ctx.error);
}
if (__VLS_ctx.uploaded) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "upload-result" },
    });
    /** @type {__VLS_StyleScopedClasses['upload-result']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "upload-result-header" },
    });
    /** @type {__VLS_StyleScopedClasses['upload-result-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.uploaded.name);
    (__VLS_ctx.uploaded.rowCount);
    (__VLS_ctx.uploaded.headers.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.reset) },
        ...{ class: "btn-text" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-text']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "upload-note" },
    });
    /** @type {__VLS_StyleScopedClasses['upload-note']} */ ;
}
// @ts-ignore
[uploaded, uploaded, uploaded, uploaded, dragging, uploading, uploading, onInputChange, error, error, reset,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeEmits: {},
});
export default {};
