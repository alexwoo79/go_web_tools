import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ChartCanvas from '@/components/analytics/ChartCanvas.vue';
import ChartOptionsPanel from '@/components/analytics/ChartOptionsPanel.vue';
import FieldMapper from '@/components/analytics/FieldMapper.vue';
import ChartToolbar from '@/components/analytics/ChartToolbar.vue';
import GanttChart from '@/components/analytics/GanttChart.vue';
import { localizeErrorCode, localizeValidationIssue } from '@/utils/analyticsErrorI18n';
const GANTT_FIELDS = [
    { key: 'taskCol', label: '任务名列', required: true },
    { key: 'startCol', label: '开始日期列', required: true },
    { key: 'endCol', label: '结束日期列', required: true },
    { key: 'projectCol', label: '项目/分组列', required: false },
    { key: 'ownerCol', label: '负责人列', required: false },
    { key: 'descCol', label: '描述列', required: false },
    { key: 'planStartCol', label: '计划开始列', required: false },
    { key: 'planEndCol', label: '计划结束列', required: false },
    { key: 'milestoneCol', label: '里程碑名列', required: false },
    { key: 'milestoneDateCol', label: '里程碑日期列', required: false },
];
const route = useRoute();
const router = useRouter();
const loading = ref(true);
const error = ref('');
const formTitle = ref('');
const headers = ref([]);
const fields = ref([]);
const definitions = ref([]);
const recommendedKinds = ref([]);
const chartKind = ref('');
const chartTitle = ref('');
const fieldConfig = ref({});
const optionConfig = ref({});
const ganttConfig = ref({});
const ganttOptions = ref({
    showTaskDetails: true,
    showDuration: true,
    sortByStart: false,
    autoNumber: false,
    darkTheme: false,
    granularity: 'month',
});
const chartMode = ref('general');
const isGanttMode = computed(() => chartMode.value === 'gantt');
// preview/edit state (form data)
const previewDatasetId = ref(null);
const previewHeaders = ref([]);
const previewRows = ref([]);
// editing is disabled for Form preview — keep preview read-only
// pagination for non-edit preview (align with Workbench defaults)
const previewPage = ref(1);
const previewPageSize = ref(5);
const previewPageSizes = [5, 10, 20, 50, -1];
const totalPreviewPages = computed(() => {
    const total = previewRows.value.length;
    if (previewPageSize.value < 0)
        return 1;
    return Math.max(1, Math.ceil(total / previewPageSize.value));
});
const pagedPreviewRows = computed(() => {
    if (previewPageSize.value < 0)
        return previewRows.value;
    const start = (previewPage.value - 1) * previewPageSize.value;
    return previewRows.value.slice(start, start + previewPageSize.value);
});
// collapsed state for preview panel (keeps parity with Workbench)
const previewCollapsed = ref(false);
// no ag-grid state/functions — preview is read-only on Form page
watch(chartMode, () => {
    chartOption.value = null;
    ganttData.value = null;
});
const building = ref(false);
const buildError = ref('');
const buildFieldErrors = ref({});
const chartOption = ref(null);
const ganttData = ref(null);
const chartRef = ref();
const ganttRef = ref();
const formName = computed(() => String(route.params.formName ?? ''));
const currentDef = computed(() => definitions.value.find(d => d.kind === chartKind.value));
const chartTheme = computed(() => String(optionConfig.value.theme || chartOption.value?.theme || 'default'));
const toolbarTheme = computed({
    get: () => chartTheme.value,
    set: (v) => {
        optionConfig.value = { ...optionConfig.value, theme: v };
    }
});
const canBuild = computed(() => {
    if (!chartKind.value && !isGanttMode.value)
        return false;
    if (isGanttMode.value) {
        return !!(ganttConfig.value['taskCol'] && ganttConfig.value['startCol'] && ganttConfig.value['endCol']);
    }
    const required = currentDef.value?.fields.filter(f => f.required) ?? [];
    return required.every(f => fieldConfig.value[f.key]);
});
const yCountSupportedKinds = new Set(['bar', 'line', 'area', 'stack_bar', 'stack_area', 'radar']);
function normalizeYCount(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed))
        return 1;
    return Math.min(8, Math.max(1, Math.floor(parsed)));
}
function inferYCountFromConfig(config) {
    const hasY2 = typeof config.y2Col === 'string' && config.y2Col.trim() !== '';
    const hasY3 = typeof config.y3Col === 'string' && config.y3Col.trim() !== '';
    const extras = Array.isArray(config.yExtraCols)
        ? config.yExtraCols.filter(v => typeof v === 'string' && v.trim() !== '')
        : [];
    if (extras.length > 0)
        return Math.min(8, 3 + extras.length);
    if (hasY3)
        return 3;
    if (hasY2)
        return 2;
    return 1;
}
function sanitizeYSeriesConfig(kind, config) {
    if (!yCountSupportedKinds.has(kind))
        return config;
    const next = { ...config };
    const hasExplicitYCount = !(config.yMetricCount === undefined || config.yMetricCount === null || String(config.yMetricCount).trim() === '');
    const yCount = hasExplicitYCount ? normalizeYCount(config.yMetricCount) : inferYCountFromConfig(config);
    next.yMetricCount = yCount;
    if (yCount < 2)
        next.y2Col = '';
    if (yCount < 3)
        next.y3Col = '';
    const extras = Array.isArray(config.yExtraCols)
        ? config.yExtraCols.filter(v => typeof v === 'string' && v.trim() !== '')
        : [];
    next.yExtraCols = extras.slice(0, Math.max(0, yCount - 3));
    return next;
}
function toLegacyConfig(v2) {
    const out = {};
    const set = (k, v) => {
        if (typeof v === 'string' && v.trim() !== '')
            out[k] = v;
    };
    set('title', v2.title);
    set('subTitle', v2.subTitle);
    set('seriesName', v2.seriesName);
    set('xAxis', v2.xCol);
    set('yAxis', v2.yCol);
    set('y2Axis', v2.y2Col);
    set('y3Axis', v2.y3Col);
    set('nameField', v2.nameCol);
    set('valueField', v2.valueCol);
    set('size', v2.sizeCol);
    set('sourceCol', v2.sourceCol);
    set('targetCol', v2.targetCol);
    set('linkValueCol', v2.linkValueCol);
    set('nodeIDCol', v2.nodeIDCol);
    set('parentIDCol', v2.parentIDCol);
    set('nodeValueCol', v2.nodeValueCol);
    return out;
}
async function loadFormPreview() {
    loading.value = true;
    error.value = '';
    try {
        const res = await fetch(`/api/admin/analytics/forms/${encodeURIComponent(formName.value)}/preview?full=1`, { credentials: 'include' });
        if (!res.ok)
            throw new Error((await res.text()) || `加载预览失败 (${res.status})`);
        const payload = await res.json();
        previewDatasetId.value = payload.id;
        previewHeaders.value = Array.isArray(payload.headers) ? payload.headers : [];
        previewRows.value = Array.isArray(payload.preview) ? payload.preview : [];
    }
    catch (e) {
        error.value = e?.message ?? '加载预览失败';
    }
    finally {
        loading.value = false;
    }
}
async function fetchSchema() {
    loading.value = true;
    error.value = '';
    chartOption.value = null;
    buildError.value = '';
    try {
        const res = await fetch(`/api/admin/analytics/forms/${encodeURIComponent(formName.value)}/schema`, {
            credentials: 'include'
        });
        if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg || `获取表单 schema 失败 (${res.status})`);
        }
        const data = await res.json();
        formTitle.value = data.formTitle ?? data.formName ?? formName.value;
        headers.value = Array.isArray(data.headers) ? data.headers : [];
        fields.value = Array.isArray(data.fields) ? data.fields : [];
        definitions.value = Array.isArray(data.definitions) ? data.definitions : [];
        recommendedKinds.value = Array.isArray(data.recommendedCharts) ? data.recommendedCharts : [];
        const firstRecommended = recommendedKinds.value.find(k => definitions.value.some(d => d.kind === k));
        chartKind.value = firstRecommended ?? definitions.value[0]?.kind ?? '';
        fieldConfig.value = {};
        optionConfig.value = {};
        chartTitle.value = formTitle.value;
    }
    catch (e) {
        error.value = e.message ?? '加载失败';
    }
    finally {
        loading.value = false;
    }
    // Auto-load preview for this form to match the data analysis page behavior.
    // Ignore errors — preview is optional.
    try {
        await loadFormPreview();
    }
    catch { }
}
async function buildFromForm() {
    building.value = true;
    buildError.value = '';
    buildFieldErrors.value = {};
    chartOption.value = null;
    ganttData.value = null;
    try {
        if (isGanttMode.value) {
            const body = { config: ganttConfig.value, fields: [] };
            const res = await fetch(`/api/admin/analytics/forms/${encodeURIComponent(formName.value)}/gantt/build`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok)
                throw new Error((await res.text()) || `构建失败 (${res.status})`);
            const data = await res.json();
            ganttData.value = data.gantt;
        }
        else {
            const mergedV2Config = sanitizeYSeriesConfig(chartKind.value, {
                ...fieldConfig.value,
                ...optionConfig.value,
                title: chartTitle.value || undefined,
            });
            const selectedFields = new Set();
            Object.values(mergedV2Config).forEach(v => {
                if (typeof v === 'string' && v) {
                    selectedFields.add(v);
                    return;
                }
                if (Array.isArray(v)) {
                    v.forEach(item => {
                        if (typeof item === 'string' && item)
                            selectedFields.add(item);
                    });
                }
            });
            // If we have a preview dataset loaded (and possibly edited), build from that dataset
            let res;
            if (previewDatasetId.value) {
                const body = {
                    datasetId: previewDatasetId.value,
                    chartKind: chartKind.value,
                    schemaVersion: 2,
                    configV2: mergedV2Config,
                    config: toLegacyConfig(mergedV2Config),
                };
                res = await fetch('/api/admin/analytics/build', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }
            else {
                const body = {
                    chartKind: chartKind.value,
                    config: toLegacyConfig(mergedV2Config),
                    fields: Array.from(selectedFields)
                };
                res = await fetch(`/api/admin/analytics/forms/${encodeURIComponent(formName.value)}/build`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }
            if (!res.ok) {
                let msg = `构建失败 (${res.status})`;
                try {
                    const payload = await res.json();
                    msg = localizeErrorCode(payload?.code, payload?.error || msg);
                    if (Array.isArray(payload?.details)) {
                        const map = {};
                        for (const item of payload.details) {
                            if (item?.field) {
                                map[item.field] = localizeValidationIssue(item, item.message || '配置有误');
                            }
                        }
                        buildFieldErrors.value = map;
                    }
                }
                catch {
                    msg = (await res.text()) || msg;
                }
                throw new Error(msg);
            }
            const data = await res.json();
            chartOption.value = data.option;
        }
    }
    catch (e) {
        buildError.value = e.message ?? '构建失败';
    }
    finally {
        building.value = false;
    }
}
// exportPNG removed — export handled by chart toolbar
watch(() => route.params.formName, fetchSchema);
onMounted(fetchSchema);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['fa-header']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['state']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-pager']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-pager']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-build']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['fa-body']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-table']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-table']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-fold']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "form-analytics-page" },
});
/** @type {__VLS_StyleScopedClasses['form-analytics-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "fa-header" },
});
/** @type {__VLS_StyleScopedClasses['fa-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
(__VLS_ctx.formTitle || __VLS_ctx.formName);
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "fa-sub" },
});
/** @type {__VLS_StyleScopedClasses['fa-sub']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "fa-header-actions" },
});
/** @type {__VLS_StyleScopedClasses['fa-header-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/admin/analytics');
            // @ts-ignore
            [formTitle, formName, router,];
        } },
    ...{ class: "btn-back" },
});
/** @type {__VLS_StyleScopedClasses['btn-back']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/admin');
            // @ts-ignore
            [router,];
        } },
    ...{ class: "btn-back" },
});
/** @type {__VLS_StyleScopedClasses['btn-back']} */ ;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "state" },
    });
    /** @type {__VLS_StyleScopedClasses['state']} */ ;
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "state error" },
    });
    /** @type {__VLS_StyleScopedClasses['state']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    (__VLS_ctx.error);
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "fa-body" },
    });
    /** @type {__VLS_StyleScopedClasses['fa-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "fa-left" },
    });
    /** @type {__VLS_StyleScopedClasses['fa-left']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "gantt-toggle" },
    });
    /** @type {__VLS_StyleScopedClasses['gantt-toggle']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "radio-inline" },
    });
    /** @type {__VLS_StyleScopedClasses['radio-inline']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "radio",
        value: "general",
    });
    (__VLS_ctx.chartMode);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "radio-inline" },
    });
    /** @type {__VLS_StyleScopedClasses['radio-inline']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "radio",
        value: "gantt",
    });
    (__VLS_ctx.chartMode);
    if (__VLS_ctx.chartMode === 'general') {
        const __VLS_0 = ChartOptionsPanel;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            definitions: (__VLS_ctx.definitions),
            modelValue: (__VLS_ctx.chartKind),
            title: (__VLS_ctx.chartTitle),
            config: (__VLS_ctx.optionConfig),
            fieldErrors: (__VLS_ctx.buildFieldErrors),
        }));
        const __VLS_2 = __VLS_1({
            definitions: (__VLS_ctx.definitions),
            modelValue: (__VLS_ctx.chartKind),
            title: (__VLS_ctx.chartTitle),
            config: (__VLS_ctx.optionConfig),
            fieldErrors: (__VLS_ctx.buildFieldErrors),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    if (__VLS_ctx.chartMode === 'general') {
        const __VLS_5 = FieldMapper;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
            headers: (__VLS_ctx.headers),
            chartKind: (__VLS_ctx.chartKind),
            definitions: (__VLS_ctx.definitions),
            contextConfig: (__VLS_ctx.optionConfig),
            fieldErrors: (__VLS_ctx.buildFieldErrors),
            modelValue: (__VLS_ctx.fieldConfig),
        }));
        const __VLS_7 = __VLS_6({
            headers: (__VLS_ctx.headers),
            chartKind: (__VLS_ctx.chartKind),
            definitions: (__VLS_ctx.definitions),
            contextConfig: (__VLS_ctx.optionConfig),
            fieldErrors: (__VLS_ctx.buildFieldErrors),
            modelValue: (__VLS_ctx.fieldConfig),
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "gantt-field-mapper" },
        });
        /** @type {__VLS_StyleScopedClasses['gantt-field-mapper']} */ ;
        for (const [f] of __VLS_vFor((__VLS_ctx.GANTT_FIELDS))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (f.key),
                ...{ class: "gantt-field-row" },
            });
            /** @type {__VLS_StyleScopedClasses['gantt-field-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ class: "gf-label" },
            });
            /** @type {__VLS_StyleScopedClasses['gf-label']} */ ;
            (f.label);
            if (f.required) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "req" },
                });
                /** @type {__VLS_StyleScopedClasses['req']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ class: "gf-select" },
                value: (__VLS_ctx.ganttConfig[f.key]),
            });
            /** @type {__VLS_StyleScopedClasses['gf-select']} */ ;
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
                [loading, error, error, chartMode, chartMode, chartMode, chartMode, definitions, definitions, chartKind, chartKind, chartTitle, optionConfig, optionConfig, buildFieldErrors, buildFieldErrors, headers, headers, fieldConfig, GANTT_FIELDS, ganttConfig,];
            }
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "gantt-opts-divider" },
        });
        /** @type {__VLS_StyleScopedClasses['gantt-opts-divider']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "gantt-opt-row" },
        });
        /** @type {__VLS_StyleScopedClasses['gantt-opt-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (__VLS_ctx.ganttOptions.showTaskDetails);
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "gantt-opt-row" },
        });
        /** @type {__VLS_StyleScopedClasses['gantt-opt-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (__VLS_ctx.ganttOptions.showDuration);
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "gantt-opt-row" },
        });
        /** @type {__VLS_StyleScopedClasses['gantt-opt-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (__VLS_ctx.ganttOptions.sortByStart);
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "gantt-opt-row" },
        });
        /** @type {__VLS_StyleScopedClasses['gantt-opt-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (__VLS_ctx.ganttOptions.autoNumber);
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "gantt-opt-row" },
        });
        /** @type {__VLS_StyleScopedClasses['gantt-opt-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (__VLS_ctx.ganttOptions.darkTheme);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "gantt-field-row" },
        });
        /** @type {__VLS_StyleScopedClasses['gantt-field-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "gf-label" },
        });
        /** @type {__VLS_StyleScopedClasses['gf-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ class: "gf-select" },
            value: (__VLS_ctx.ganttOptions.granularity),
        });
        /** @type {__VLS_StyleScopedClasses['gf-select']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "day",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "week",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "month",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "quarter",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "year",
        });
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    if (__VLS_ctx.buildError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error-text" },
        });
        /** @type {__VLS_StyleScopedClasses['error-text']} */ ;
        (__VLS_ctx.buildError);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "actions" },
    });
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.buildFromForm) },
        ...{ class: "btn-build" },
        disabled: (__VLS_ctx.building || !__VLS_ctx.canBuild),
    });
    /** @type {__VLS_StyleScopedClasses['btn-build']} */ ;
    (__VLS_ctx.building ? '生成中…' : '生成图表');
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "fa-right" },
    });
    /** @type {__VLS_StyleScopedClasses['fa-right']} */ ;
    if (__VLS_ctx.previewHeaders.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "preview-panel" },
        });
        /** @type {__VLS_StyleScopedClasses['preview-panel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "preview-head" },
        });
        /** @type {__VLS_StyleScopedClasses['preview-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "preview-title" },
        });
        /** @type {__VLS_StyleScopedClasses['preview-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "preview-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['preview-sub']} */ ;
        (__VLS_ctx.pagedPreviewRows.length);
        (__VLS_ctx.previewRows.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!(__VLS_ctx.previewHeaders.length))
                        return;
                    __VLS_ctx.previewCollapsed = !__VLS_ctx.previewCollapsed;
                    // @ts-ignore
                    [ganttOptions, ganttOptions, ganttOptions, ganttOptions, ganttOptions, ganttOptions, buildError, buildError, buildFromForm, building, building, canBuild, previewHeaders, pagedPreviewRows, previewRows, previewCollapsed, previewCollapsed,];
                } },
            ...{ class: "btn-fold" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-fold']} */ ;
        (__VLS_ctx.previewCollapsed ? '展开' : '收起');
        if (!__VLS_ctx.previewCollapsed) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "preview-table-wrap" },
            });
            /** @type {__VLS_StyleScopedClasses['preview-table-wrap']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "simple-table-wrap" },
            });
            /** @type {__VLS_StyleScopedClasses['simple-table-wrap']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "preview-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['preview-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "preview-table" },
            });
            /** @type {__VLS_StyleScopedClasses['preview-table']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            for (const [h] of __VLS_vFor((__VLS_ctx.previewHeaders))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    key: (h),
                });
                (h);
                // @ts-ignore
                [previewHeaders, previewCollapsed, previewCollapsed,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            for (const [row, i] of __VLS_vFor((__VLS_ctx.pagedPreviewRows))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (i),
                });
                for (const [cell, j] of __VLS_vFor((row))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        key: (j),
                    });
                    (cell);
                    // @ts-ignore
                    [pagedPreviewRows,];
                }
                // @ts-ignore
                [];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "preview-pager" },
            });
            /** @type {__VLS_StyleScopedClasses['preview-pager']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                value: (__VLS_ctx.previewPageSize),
            });
            for (const [s] of __VLS_vFor((__VLS_ctx.previewPageSizes))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (s),
                    value: (s),
                });
                (s > 0 ? s : '全部');
                // @ts-ignore
                [previewPageSize, previewPageSizes,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.previewHeaders.length))
                            return;
                        if (!(!__VLS_ctx.previewCollapsed))
                            return;
                        __VLS_ctx.previewPage--;
                        // @ts-ignore
                        [previewPage,];
                    } },
                disabled: (__VLS_ctx.previewPage <= 1),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_ctx.previewPage);
            (__VLS_ctx.totalPreviewPages);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.previewHeaders.length))
                            return;
                        if (!(!__VLS_ctx.previewCollapsed))
                            return;
                        __VLS_ctx.previewPage++;
                        // @ts-ignore
                        [previewPage, previewPage, previewPage, totalPreviewPages,];
                    } },
                disabled: (__VLS_ctx.previewPage >= __VLS_ctx.totalPreviewPages),
            });
        }
    }
    if (!__VLS_ctx.chartOption && !__VLS_ctx.ganttData && !__VLS_ctx.building) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "placeholder" },
        });
        /** @type {__VLS_StyleScopedClasses['placeholder']} */ ;
    }
    if (__VLS_ctx.chartOption || __VLS_ctx.ganttData || __VLS_ctx.building) {
        const __VLS_10 = ChartToolbar || ChartToolbar;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
            chartRef: (__VLS_ctx.isGanttMode ? __VLS_ctx.ganttRef : __VLS_ctx.chartRef),
            theme: (__VLS_ctx.toolbarTheme),
        }));
        const __VLS_12 = __VLS_11({
            chartRef: (__VLS_ctx.isGanttMode ? __VLS_ctx.ganttRef : __VLS_ctx.chartRef),
            theme: (__VLS_ctx.toolbarTheme),
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
        const { default: __VLS_15 } = __VLS_13.slots;
        if (__VLS_ctx.isGanttMode && __VLS_ctx.ganttData) {
            const __VLS_16 = GanttChart;
            // @ts-ignore
            const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
                ref: "ganttRef",
                tasks: (__VLS_ctx.ganttData.tasks),
                stats: (__VLS_ctx.ganttData.stats),
                theme: (__VLS_ctx.toolbarTheme),
                options: (__VLS_ctx.ganttOptions),
            }));
            const __VLS_18 = __VLS_17({
                ref: "ganttRef",
                tasks: (__VLS_ctx.ganttData.tasks),
                stats: (__VLS_ctx.ganttData.stats),
                theme: (__VLS_ctx.toolbarTheme),
                options: (__VLS_ctx.ganttOptions),
            }, ...__VLS_functionalComponentArgsRest(__VLS_17));
            var __VLS_21 = {};
            var __VLS_19;
        }
        else if (__VLS_ctx.chartMode === 'general') {
            const __VLS_23 = ChartCanvas;
            // @ts-ignore
            const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
                ref: "chartRef",
                option: (__VLS_ctx.chartOption),
                loading: (__VLS_ctx.building),
                theme: (__VLS_ctx.toolbarTheme),
            }));
            const __VLS_25 = __VLS_24({
                ref: "chartRef",
                option: (__VLS_ctx.chartOption),
                loading: (__VLS_ctx.building),
                theme: (__VLS_ctx.toolbarTheme),
            }, ...__VLS_functionalComponentArgsRest(__VLS_24));
            var __VLS_28 = {};
            var __VLS_26;
        }
        // @ts-ignore
        [chartMode, ganttOptions, building, building, building, previewPage, totalPreviewPages, chartOption, chartOption, chartOption, ganttData, ganttData, ganttData, ganttData, ganttData, isGanttMode, isGanttMode, ganttRef, chartRef, toolbarTheme, toolbarTheme, toolbarTheme,];
        var __VLS_13;
    }
}
// @ts-ignore
var __VLS_22 = __VLS_21, __VLS_29 = __VLS_28;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
