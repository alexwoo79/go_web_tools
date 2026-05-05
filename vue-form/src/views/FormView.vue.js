import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
const route = useRoute();
const router = useRouter();
const formDef = ref(null);
const formData = ref({});
const loading = ref(true);
const submitting = ref(false);
const submitted = ref(false);
const error = ref('');
const submitError = ref('');
const runningDistanceHint = ref('支持输入小数，最多 3 位，例如 21.097');
const runningDistanceError = ref('');
function isShareMode() {
    return typeof route.params.token === 'string' && route.params.token.trim() !== '';
}
function getFormFetchPath() {
    if (isShareMode()) {
        return `/api/public/forms/${route.params.token}`;
    }
    return `/api/forms/${route.params.formName}`;
}
function getSubmitPath() {
    if (isShareMode()) {
        return `/api/public/submit/${route.params.token}`;
    }
    return `/api/submit/${route.params.formName}`;
}
function parseDurationToSeconds(raw) {
    if (typeof raw !== 'string')
        return null;
    const value = raw.trim();
    if (!value)
        return null;
    const parts = value.split(':').map((p) => p.trim());
    if (parts.length !== 2 && parts.length !== 3)
        return null;
    if (parts.some((p) => p === '' || !/^\d+$/.test(p)))
        return null;
    if (parts.length === 2) {
        const minutes = Number(parts[0]);
        const seconds = Number(parts[1]);
        if (seconds >= 60)
            return null;
        return minutes * 60 + seconds;
    }
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);
    if (minutes >= 60 || seconds >= 60)
        return null;
    return hours * 3600 + minutes * 60 + seconds;
}
function updateAveragePace() {
    if (!formDef.value)
        return;
    const hasPaceFields = formDef.value.Fields.some((f) => f.Name === 'running_distance')
        && formDef.value.Fields.some((f) => f.Name === 'total_time')
        && formDef.value.Fields.some((f) => f.Name === 'average_pace');
    if (!hasPaceFields)
        return;
    const distanceRaw = formData.value.running_distance;
    const distance = typeof distanceRaw === 'number' ? distanceRaw : Number(distanceRaw);
    const totalSeconds = parseDurationToSeconds(formData.value.total_time);
    if (!Number.isFinite(distance) || distance <= 0 || totalSeconds === null || totalSeconds <= 0) {
        formData.value.average_pace = '';
        return;
    }
    const paceSeconds = Math.round(totalSeconds / distance);
    const paceMinutes = Math.floor(paceSeconds / 60);
    const remainSeconds = paceSeconds % 60;
    formData.value.average_pace = `${paceMinutes}:${String(remainSeconds).padStart(2, '0')}`;
}
function isReadonlyField(field) {
    return field.Name === 'average_pace';
}
function isRunningDistanceField(field) {
    return field.Name === 'running_distance';
}
function getNumberStep(field) {
    if (isRunningDistanceField(field))
        return '0.001';
    return field.Step ?? 'any';
}
function validateRunningDistance(raw) {
    if (raw === '' || raw === null || raw === undefined)
        return '';
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value))
        return '跑步距离必须是有效数字';
    if (value <= 0)
        return '跑步距离必须大于 0';
    const scaled = value * 1000;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-9) {
        return '跑步距离最多保留 3 位小数';
    }
    return '';
}
function updateRunningDistanceFeedback() {
    const validationError = validateRunningDistance(formData.value.running_distance);
    runningDistanceError.value = validationError;
    if (validationError) {
        runningDistanceHint.value = '示例：21.097（公里）';
        return;
    }
    const raw = formData.value.running_distance;
    if (raw === '' || raw === null || raw === undefined) {
        runningDistanceHint.value = '支持输入小数，最多 3 位，例如 21.097';
        return;
    }
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        runningDistanceHint.value = '示例：21.097（公里）';
        return;
    }
    runningDistanceHint.value = `当前距离：${value.toFixed(3)} 公里`;
}
onMounted(async () => {
    try {
        const res = await fetch(getFormFetchPath());
        if (!res.ok) {
            if (res.status === 410) {
                const data = await res.json();
                throw new Error(data.error || '该表单已到期，停止收集');
            }
            if (res.status === 404) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || '分享链接无效或表单不存在');
            }
            throw new Error('表单不存在');
        }
        formDef.value = await res.json();
        // 初始化表单数据
        for (const f of formDef.value.Fields) {
            if (f.Type === 'checkbox') {
                formData.value[f.Name] = [];
            }
            else if (f.Type === 'range') {
                // slider 默认取最小值，确保初始就显示动态分值
                formData.value[f.Name] = f.Min ?? 0;
            }
            else {
                formData.value[f.Name] = '';
            }
        }
    }
    catch (e) {
        error.value = e.message;
    }
    finally {
        loading.value = false;
    }
});
watch(() => [formData.value.running_distance, formData.value.total_time, formDef.value?.Name], () => {
    updateRunningDistanceFeedback();
    updateAveragePace();
});
async function submit() {
    submitError.value = '';
    updateRunningDistanceFeedback();
    if (runningDistanceError.value) {
        submitError.value = runningDistanceError.value;
        return;
    }
    submitting.value = true;
    try {
        const res = await fetch(getSubmitPath(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData.value),
        });
        if (res.ok) {
            submitted.value = true;
        }
        else {
            const data = await res.json();
            if (res.status === 410) {
                submitError.value = data.error || '该表单已到期，停止收集';
                return;
            }
            if (res.status === 401) {
                submitError.value = data.error || '请先登录';
                if (!isShareMode()) {
                    setTimeout(() => router.push('/login'), 700);
                }
                return;
            }
            submitError.value = data.error || '提交失败，请重试';
        }
    }
    catch {
        submitError.value = '网络错误，请稍后重试';
    }
    finally {
        submitting.value = false;
    }
}
function getRangeValue(field) {
    const raw = formData.value[field.Name];
    if (typeof raw === 'number' && !Number.isNaN(raw))
        return raw;
    if (typeof raw === 'string' && raw !== '') {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed))
            return parsed;
    }
    return field.Min ?? 0;
}
function getRangeBounds(field) {
    const rawMin = Number(field.Min ?? 0);
    const rawMax = Number(field.Max ?? 100);
    const min = Number.isFinite(rawMin) ? rawMin : 0;
    const max = Number.isFinite(rawMax) ? rawMax : 100;
    if (max <= min) {
        return { min, max: min + 1 };
    }
    return { min, max };
}
function getRangeTicks(field) {
    const { min, max } = getRangeBounds(field);
    const span = max - min;
    const segments = span <= 10 && Number.isInteger(span) ? Math.max(1, Math.min(10, span)) : 5;
    const step = span / segments;
    return Array.from({ length: segments + 1 }, (_, i) => {
        const value = min + step * i;
        return Number.isInteger(value) ? value : Number(value.toFixed(1));
    });
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
/** @type {__VLS_StyleScopedClasses['success-card']} */ ;
/** @type {__VLS_StyleScopedClasses['success-card']} */ ;
/** @type {__VLS_StyleScopedClasses['success-card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['range-ticks']} */ ;
/** @type {__VLS_StyleScopedClasses['range-ticks']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "page" },
});
/** @type {__VLS_StyleScopedClasses['page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "site-header" },
});
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
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
else if (__VLS_ctx.submitted) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "success-card" },
    });
    /** @type {__VLS_StyleScopedClasses['success-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "success-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['success-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.error))
                    return;
                if (!(__VLS_ctx.submitted))
                    return;
                __VLS_ctx.router.push(__VLS_ctx.isShareMode() ? '/login' : '/');
                // @ts-ignore
                [router, loading, error, error, submitted, isShareMode,];
            } },
    });
    (__VLS_ctx.isShareMode() ? '返回登录页' : '返回首页');
}
else if (__VLS_ctx.formDef) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-card" },
    });
    /** @type {__VLS_StyleScopedClasses['form-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.formDef.Title);
    if (__VLS_ctx.formDef.Description) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        (__VLS_ctx.formDef.Description);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (__VLS_ctx.submit) },
    });
    for (const [field] of __VLS_vFor((__VLS_ctx.formDef.Fields))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (field.Name),
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: (field.Name),
        });
        (field.Label);
        if (field.Required) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "required" },
            });
            /** @type {__VLS_StyleScopedClasses['required']} */ ;
        }
        if (field.Type === 'range') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "range-inline-value" },
            });
            /** @type {__VLS_StyleScopedClasses['range-inline-value']} */ ;
            (__VLS_ctx.getRangeValue(field));
            (__VLS_ctx.getRangeBounds(field).max);
        }
        if (field.Type === 'textarea') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.textarea)({
                id: (field.Name),
                value: (__VLS_ctx.formData[field.Name]),
                placeholder: (field.Placeholder),
                required: (field.Required),
                rows: "4",
            });
        }
        else if (field.Type === 'select') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                id: (field.Name),
                value: (__VLS_ctx.formData[field.Name]),
                required: (field.Required),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            for (const [opt] of __VLS_vFor((field.Options))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (opt),
                    value: (opt),
                });
                (opt);
                // @ts-ignore
                [isShareMode, formDef, formDef, formDef, formDef, formDef, submit, getRangeValue, getRangeBounds, formData, formData,];
            }
        }
        else if (field.Type === 'radio') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "option-group" },
            });
            /** @type {__VLS_StyleScopedClasses['option-group']} */ ;
            for (const [opt] of __VLS_vFor((field.Options))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                    key: (opt),
                    ...{ class: "option-label" },
                });
                /** @type {__VLS_StyleScopedClasses['option-label']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "radio",
                    name: (field.Name),
                    value: (opt),
                    required: (field.Required),
                });
                (__VLS_ctx.formData[field.Name]);
                (opt);
                // @ts-ignore
                [formData,];
            }
        }
        else if (field.Type === 'checkbox') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "option-group" },
            });
            /** @type {__VLS_StyleScopedClasses['option-group']} */ ;
            for (const [opt] of __VLS_vFor((field.Options))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                    key: (opt),
                    ...{ class: "option-label" },
                });
                /** @type {__VLS_StyleScopedClasses['option-label']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "checkbox",
                    value: (opt),
                });
                (__VLS_ctx.formData[field.Name]);
                (opt);
                // @ts-ignore
                [formData,];
            }
        }
        else if (field.Type === 'number') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (field.Name),
                type: "number",
                placeholder: (field.Placeholder),
                required: (field.Required),
                min: (field.Min ?? undefined),
                max: (field.Max ?? undefined),
                step: (__VLS_ctx.getNumberStep(field)),
                readonly: (__VLS_ctx.isReadonlyField(field)),
                ...{ class: ({ 'input-invalid': __VLS_ctx.isRunningDistanceField(field) && !!__VLS_ctx.runningDistanceError }) },
            });
            (__VLS_ctx.formData[field.Name]);
            /** @type {__VLS_StyleScopedClasses['input-invalid']} */ ;
            if (__VLS_ctx.isRunningDistanceField(field) && __VLS_ctx.runningDistanceError) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "field-inline-error" },
                });
                /** @type {__VLS_StyleScopedClasses['field-inline-error']} */ ;
                (__VLS_ctx.runningDistanceError);
            }
            else if (__VLS_ctx.isRunningDistanceField(field)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "field-inline-hint" },
                });
                /** @type {__VLS_StyleScopedClasses['field-inline-hint']} */ ;
                (__VLS_ctx.runningDistanceHint);
            }
        }
        else if (field.Type === 'range') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "range-wrap" },
            });
            /** @type {__VLS_StyleScopedClasses['range-wrap']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (field.Name),
                type: "range",
                required: (field.Required),
                min: (__VLS_ctx.getRangeBounds(field).min),
                max: (__VLS_ctx.getRangeBounds(field).max),
            });
            (__VLS_ctx.formData[field.Name]);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "range-ticks" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['range-ticks']} */ ;
            for (const [tick] of __VLS_vFor((__VLS_ctx.getRangeTicks(field)))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    key: (`${field.Name}-${tick}`),
                });
                (tick);
                // @ts-ignore
                [getRangeBounds, getRangeBounds, formData, formData, getNumberStep, isReadonlyField, isRunningDistanceField, isRunningDistanceField, isRunningDistanceField, runningDistanceError, runningDistanceError, runningDistanceError, runningDistanceHint, getRangeTicks,];
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (field.Name),
                type: (field.Type || 'text'),
                placeholder: (field.Placeholder),
                required: (field.Required),
                readonly: (__VLS_ctx.isReadonlyField(field)),
            });
            (__VLS_ctx.formData[field.Name]);
        }
        // @ts-ignore
        [formData, isReadonlyField,];
    }
    if (__VLS_ctx.submitError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error-msg" },
        });
        /** @type {__VLS_StyleScopedClasses['error-msg']} */ ;
        (__VLS_ctx.submitError);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "actions" },
    });
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        disabled: (__VLS_ctx.submitting),
        ...{ class: "btn-submit" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
    (__VLS_ctx.submitting ? '提交中…' : '提交');
}
// @ts-ignore
[submitError, submitError, submitting, submitting,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
