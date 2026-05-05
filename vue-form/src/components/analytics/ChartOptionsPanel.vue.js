import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const families = computed(() => {
    const map = new Map();
    for (const d of props.definitions) {
        if (!map.has(d.family))
            map.set(d.family, []);
        map.get(d.family).push(d);
    }
    return map;
});
const currentDef = computed(() => props.definitions.find(d => d.kind === props.modelValue));
const optionFields = computed(() => (currentDef.value?.fields ?? []).filter(f => f.type && f.type !== 'column'));
function updateConfig(key, value) {
    emit('update:config', { ...props.config, [key]: value });
}
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
/** @type {__VLS_StyleScopedClasses['kind-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['kind-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['title-input']} */ ;
/** @type {__VLS_StyleScopedClasses['title-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chart-options-panel" },
});
/** @type {__VLS_StyleScopedClasses['chart-options-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "families" },
});
/** @type {__VLS_StyleScopedClasses['families']} */ ;
for (const [[family, defs]] of __VLS_vFor((__VLS_ctx.families))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (family),
        ...{ class: "family-group" },
    });
    /** @type {__VLS_StyleScopedClasses['family-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "family-label" },
    });
    /** @type {__VLS_StyleScopedClasses['family-label']} */ ;
    (family);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "kinds-row" },
    });
    /** @type {__VLS_StyleScopedClasses['kinds-row']} */ ;
    for (const [def] of __VLS_vFor((defs))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    __VLS_ctx.emit('update:modelValue', def.kind);
                    // @ts-ignore
                    [families, emit,];
                } },
            key: (def.kind),
            ...{ class: "kind-btn" },
            ...{ class: ({ active: __VLS_ctx.modelValue === def.kind }) },
            title: (def.description ?? def.hint ?? def.label),
        });
        /** @type {__VLS_StyleScopedClasses['kind-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (def.label);
        // @ts-ignore
        [modelValue,];
    }
    // @ts-ignore
    [];
}
if (__VLS_ctx.currentDef?.hint) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "kind-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['kind-hint']} */ ;
    (__VLS_ctx.currentDef.hint);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "title-row" },
});
/** @type {__VLS_StyleScopedClasses['title-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "opt-label" },
});
/** @type {__VLS_StyleScopedClasses['opt-label']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onInput: (...[$event]) => {
            __VLS_ctx.emit('update:title', $event.target.value);
            // @ts-ignore
            [emit, currentDef, currentDef,];
        } },
    ...{ class: "title-input" },
    ...{ class: ({ invalid: !!__VLS_ctx.fieldErrors?.title }) },
    type: "text",
    value: (__VLS_ctx.title),
    placeholder: "（可选）",
});
/** @type {__VLS_StyleScopedClasses['title-input']} */ ;
/** @type {__VLS_StyleScopedClasses['invalid']} */ ;
if (__VLS_ctx.fieldErrors?.title) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field-error" },
    });
    /** @type {__VLS_StyleScopedClasses['field-error']} */ ;
    (__VLS_ctx.fieldErrors.title);
}
if (__VLS_ctx.optionFields.length > 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "option-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['option-grid']} */ ;
    for (const [field] of __VLS_vFor((__VLS_ctx.optionFields))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (field.key),
            ...{ class: "option-row" },
        });
        /** @type {__VLS_StyleScopedClasses['option-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "opt-label" },
        });
        /** @type {__VLS_StyleScopedClasses['opt-label']} */ ;
        (field.label);
        if (field.type === 'select') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.optionFields.length > 0))
                            return;
                        if (!(field.type === 'select'))
                            return;
                        __VLS_ctx.updateConfig(field.key, $event.target.value);
                        // @ts-ignore
                        [fieldErrors, fieldErrors, fieldErrors, title, optionFields, optionFields, updateConfig,];
                    } },
                ...{ class: "title-input" },
                ...{ class: ({ invalid: !!__VLS_ctx.fieldErrors?.[field.key] }) },
                value: (__VLS_ctx.config[field.key] ?? ''),
            });
            /** @type {__VLS_StyleScopedClasses['title-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['invalid']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            for (const [opt] of __VLS_vFor(((field.options ?? [])))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (opt),
                    value: (opt),
                });
                (opt);
                // @ts-ignore
                [fieldErrors, config,];
            }
        }
        else if (field.type === 'boolean') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ class: "bool-row" },
            });
            /** @type {__VLS_StyleScopedClasses['bool-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.optionFields.length > 0))
                            return;
                        if (!!(field.type === 'select'))
                            return;
                        if (!(field.type === 'boolean'))
                            return;
                        __VLS_ctx.updateConfig(field.key, $event.target.checked);
                        // @ts-ignore
                        [updateConfig,];
                    } },
                type: "checkbox",
                checked: (!!__VLS_ctx.config[field.key]),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        }
        else if (field.type === 'number') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (...[$event]) => {
                        if (!(__VLS_ctx.optionFields.length > 0))
                            return;
                        if (!!(field.type === 'select'))
                            return;
                        if (!!(field.type === 'boolean'))
                            return;
                        if (!(field.type === 'number'))
                            return;
                        __VLS_ctx.updateConfig(field.key, Number($event.target.value || 0));
                        // @ts-ignore
                        [updateConfig, config,];
                    } },
                ...{ class: "title-input" },
                ...{ class: ({ invalid: !!__VLS_ctx.fieldErrors?.[field.key] }) },
                type: "number",
                value: (__VLS_ctx.config[field.key] ?? ''),
            });
            /** @type {__VLS_StyleScopedClasses['title-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['invalid']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (...[$event]) => {
                        if (!(__VLS_ctx.optionFields.length > 0))
                            return;
                        if (!!(field.type === 'select'))
                            return;
                        if (!!(field.type === 'boolean'))
                            return;
                        if (!!(field.type === 'number'))
                            return;
                        __VLS_ctx.updateConfig(field.key, $event.target.value);
                        // @ts-ignore
                        [fieldErrors, updateConfig, config,];
                    } },
                ...{ class: "title-input" },
                ...{ class: ({ invalid: !!__VLS_ctx.fieldErrors?.[field.key] }) },
                type: "text",
                value: (__VLS_ctx.config[field.key] ?? ''),
            });
            /** @type {__VLS_StyleScopedClasses['title-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['invalid']} */ ;
        }
        if (__VLS_ctx.fieldErrors?.[field.key]) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "field-error" },
            });
            /** @type {__VLS_StyleScopedClasses['field-error']} */ ;
            (__VLS_ctx.fieldErrors[field.key]);
        }
        // @ts-ignore
        [fieldErrors, fieldErrors, fieldErrors, config,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
