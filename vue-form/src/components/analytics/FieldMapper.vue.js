import { computed, watch } from 'vue';
const props = defineProps();
const emit = defineEmits();
const currentDef = computed(() => props.definitions.find(d => d.kind === props.chartKind));
const yCountEnabledKinds = new Set(['bar', 'line', 'area', 'stack_bar', 'stack_area', 'radar']);
function supportsYCount(kind) {
    return yCountEnabledKinds.has(kind);
}
function normalizeYCount(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed))
        return 1;
    return Math.min(8, Math.max(1, Math.floor(parsed)));
}
function inferYCountFromMapping() {
    const cfg = props.modelValue ?? {};
    const hasY2 = typeof cfg.y2Col === 'string' && cfg.y2Col.trim() !== '';
    const hasY3 = typeof cfg.y3Col === 'string' && cfg.y3Col.trim() !== '';
    const extras = Array.isArray(cfg.yExtraCols)
        ? cfg.yExtraCols.filter(v => typeof v === 'string' && v.trim() !== '')
        : [];
    if (extras.length > 0)
        return Math.min(8, 3 + extras.length);
    if (hasY3)
        return 3;
    if (hasY2)
        return 2;
    return 1;
}
const yMetricCount = computed(() => {
    if (!supportsYCount(props.chartKind))
        return 1;
    const fromOption = props.contextConfig?.yMetricCount;
    if (fromOption !== undefined && fromOption !== null && fromOption !== '') {
        return normalizeYCount(fromOption);
    }
    return inferYCountFromMapping();
});
const fields = computed(() => {
    const base = (currentDef.value?.fields ?? []).filter(f => !f.type || f.type === 'column');
    return base.filter(f => {
        if (!supportsYCount(props.chartKind))
            return true;
        if (f.key === 'y2Col')
            return yMetricCount.value >= 2;
        if (f.key === 'y3Col')
            return yMetricCount.value >= 3;
        if (f.key === 'yExtraCols')
            return yMetricCount.value >= 4;
        return true;
    });
});
const extraYCount = computed(() => Math.max(0, yMetricCount.value - 3));
const extraYSlots = computed(() => {
    if (extraYCount.value <= 0)
        return [];
    const raw = Array.isArray(props.modelValue?.yExtraCols) ? props.modelValue.yExtraCols : [];
    return Array.from({ length: extraYCount.value }, (_, idx) => ({
        index: idx,
        key: `yExtraCols-${idx}`,
        label: `Y${idx + 4} 字段`,
        value: typeof raw[idx] === 'string' ? raw[idx] : ''
    }));
});
function onSelect(key, valueOrEvent) {
    // Support both programmatic calls and DOM events
    let value;
    if (typeof valueOrEvent === 'string') {
        value = valueOrEvent;
    }
    else {
        const el = valueOrEvent.target;
        if (el.multiple) {
            value = Array.from(el.selectedOptions).map(o => o.value);
        }
        else {
            value = el.value;
        }
    }
    emit('update:modelValue', { ...props.modelValue, [key]: value });
}
function onSelectExtra(index, valueOrEvent) {
    let value = '';
    if (typeof valueOrEvent === 'string') {
        value = valueOrEvent;
    }
    else {
        value = valueOrEvent.target.value;
    }
    const existing = Array.isArray(props.modelValue?.yExtraCols) ? [...props.modelValue.yExtraCols] : [];
    existing[index] = value;
    emit('update:modelValue', { ...props.modelValue, yExtraCols: existing.slice(0, extraYCount.value) });
}
watch(yMetricCount, (count) => {
    if (!supportsYCount(props.chartKind))
        return;
    const next = { ...props.modelValue };
    let changed = false;
    if (count < 2 && next.y2Col) {
        next.y2Col = '';
        changed = true;
    }
    if (count < 3 && next.y3Col) {
        next.y3Col = '';
        changed = true;
    }
    const existing = Array.isArray(next.yExtraCols) ? next.yExtraCols : [];
    const trimmed = existing.slice(0, Math.max(0, count - 3));
    if (trimmed.length !== existing.length) {
        next.yExtraCols = trimmed;
        changed = true;
    }
    if (changed) {
        emit('update:modelValue', next);
    }
});
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
/** @type {__VLS_StyleScopedClasses['field-select']} */ ;
/** @type {__VLS_StyleScopedClasses['field-select']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "field-mapper" },
});
/** @type {__VLS_StyleScopedClasses['field-mapper']} */ ;
if (!__VLS_ctx.currentDef) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "no-def" },
    });
    /** @type {__VLS_StyleScopedClasses['no-def']} */ ;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "mapper-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['mapper-hint']} */ ;
    for (const [field] of __VLS_vFor((__VLS_ctx.fields))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (field.key),
            ...{ class: "field-row" },
        });
        /** @type {__VLS_StyleScopedClasses['field-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "field-label" },
        });
        /** @type {__VLS_StyleScopedClasses['field-label']} */ ;
        (field.label);
        if (field.required) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "required" },
            });
            /** @type {__VLS_StyleScopedClasses['required']} */ ;
        }
        if (field.description) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "field-desc" },
            });
            /** @type {__VLS_StyleScopedClasses['field-desc']} */ ;
            (field.description);
        }
        if (field.key !== 'yExtraCols') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentDef))
                            return;
                        if (!(field.key !== 'yExtraCols'))
                            return;
                        __VLS_ctx.onSelect(field.key, $event);
                        // @ts-ignore
                        [currentDef, fields, onSelect,];
                    } },
                ...{ class: "field-select" },
                ...{ class: ({ invalid: !!__VLS_ctx.fieldErrors?.[field.key] }) },
                multiple: (field.multi),
                value: (__VLS_ctx.modelValue[field.key] ?? (field.multi ? [] : '')),
            });
            /** @type {__VLS_StyleScopedClasses['field-select']} */ ;
            /** @type {__VLS_StyleScopedClasses['invalid']} */ ;
            if (!field.multi) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    value: "",
                });
            }
            for (const [h] of __VLS_vFor((__VLS_ctx.headers))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (h),
                    value: (h),
                });
                (h);
                // @ts-ignore
                [fieldErrors, modelValue, headers,];
            }
            if (__VLS_ctx.fieldErrors?.[field.key]) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "field-error" },
                });
                /** @type {__VLS_StyleScopedClasses['field-error']} */ ;
                (__VLS_ctx.fieldErrors[field.key]);
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "extra-y-list" },
            });
            /** @type {__VLS_StyleScopedClasses['extra-y-list']} */ ;
            for (const [slot] of __VLS_vFor((__VLS_ctx.extraYSlots))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (slot.key),
                    ...{ class: "extra-y-row" },
                });
                /** @type {__VLS_StyleScopedClasses['extra-y-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                    ...{ class: "extra-y-label" },
                });
                /** @type {__VLS_StyleScopedClasses['extra-y-label']} */ ;
                (slot.label);
                __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                    ...{ onChange: (...[$event]) => {
                            if (!!(!__VLS_ctx.currentDef))
                                return;
                            if (!!(field.key !== 'yExtraCols'))
                                return;
                            __VLS_ctx.onSelectExtra(slot.index, $event);
                            // @ts-ignore
                            [fieldErrors, fieldErrors, extraYSlots, onSelectExtra,];
                        } },
                    ...{ class: "field-select" },
                    ...{ class: ({ invalid: !!__VLS_ctx.fieldErrors?.[field.key] }) },
                    value: (slot.value),
                });
                /** @type {__VLS_StyleScopedClasses['field-select']} */ ;
                /** @type {__VLS_StyleScopedClasses['invalid']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    value: "",
                });
                for (const [h] of __VLS_vFor((__VLS_ctx.headers))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        key: (h),
                        value: (h),
                    });
                    (h);
                    // @ts-ignore
                    [fieldErrors, headers,];
                }
                // @ts-ignore
                [];
            }
            if (__VLS_ctx.fieldErrors?.[field.key]) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "field-error" },
                });
                /** @type {__VLS_StyleScopedClasses['field-error']} */ ;
                (__VLS_ctx.fieldErrors[field.key]);
            }
        }
        // @ts-ignore
        [fieldErrors, fieldErrors,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
