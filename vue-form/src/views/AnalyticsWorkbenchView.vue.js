import { ref, computed, onMounted, watch } from 'vue';
import { AgGridVue } from 'ag-grid-vue3';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { useRouter } from 'vue-router';
import DatasetUpload from '@/components/analytics/DatasetUpload.vue';
import ChartOptionsPanel from '@/components/analytics/ChartOptionsPanel.vue';
import FieldMapper from '@/components/analytics/FieldMapper.vue';
import ChartCanvas from '@/components/analytics/ChartCanvas.vue';
import ChartToolbar from '@/components/analytics/ChartToolbar.vue';
import GanttChart from '@/components/analytics/GanttChart.vue';
import { localizeErrorCode, localizeValidationIssue } from '@/utils/analyticsErrorI18n';
import { analyticsDemoOptions, analyticsDemoPresets, getAnalyticsDemoPreset, isAnalyticsDemoFileName } from '@/utils/analyticsDemoCsv';
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
const router = useRouter();
const backPath = '/portal';
const backLabel = '← 返回主页';
const definitions = ref([]);
const loadingDefs = ref(true);
const defsError = ref('');
const dataset = ref(null);
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
const building = ref(false);
const buildError = ref('');
const buildFieldErrors = ref({});
const chartOption = ref(null);
const ganttData = ref(null);
const chartRef = ref();
const ganttRef = ref();
// chartMode: 'general' = 通用图形, 'gantt' = 甘特图
const chartMode = ref('general');
const isGanttMode = computed(() => chartMode.value === 'gantt');
const activeTab = ref('step1');
const previewCollapsed = ref(false);
const isEditingPreview = ref(false);
const editPreviewRows = ref([]);
const demoLoading = ref(false);
const demoError = ref('');
const autoLoadDemo = ref(false);
const demoDatasetLoaded = ref(false);
const activeDemoPresetKey = ref('');
const selectedDemoPresetKey = ref('mixed');
const demoButtonLabel = computed(() => {
    if (demoLoading.value)
        return '加载中…';
    return autoLoadDemo.value ? '重新加载自动样例' : '加载所选样例';
});
const demoHintText = computed(() => {
    if (autoLoadDemo.value) {
        return '自动模式已开启：切换图形会自动加载匹配样例；下拉仅供查看。';
    }
    return '手动模式：先选择样例类型，再点击「加载所选样例」。';
});
// When isGanttMode changes, set chartKind appropriately
watch(chartMode, (mode) => {
    if (mode === 'gantt') {
        chartKind.value = 'gantt';
    }
    else {
        chartKind.value = definitions.value[0]?.kind ?? '';
    }
    chartOption.value = null;
    ganttData.value = null;
});
const step = computed(() => {
    if (!dataset.value)
        return 1;
    if (!chartKind.value)
        return 2;
    return 3;
});
const currentDef = computed(() => definitions.value.find(d => d.kind === chartKind.value));
const canBuild = computed(() => {
    if (!dataset.value || !chartKind.value)
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
const previewHeaders = computed(() => dataset.value?.headers ?? []);
const previewRows = computed(() => {
    if (isEditingPreview.value)
        return editPreviewRows.value;
    return dataset.value?.preview ?? [];
});
// pagination for preview (non-edit mode)
const previewPage = ref(1);
// default to show all rows
const previewPageSize = ref(-1);
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
// ag-grid state
const gridApi = ref(null);
const gridColumnDefs = ref([]);
const gridRowData = ref([]);
function buildGridDefs(headers) {
    return headers.map(h => ({ field: h, editable: true, resizable: true }));
}
function refreshGrid() {
    gridColumnDefs.value = buildGridDefs(previewHeaders.value);
    gridRowData.value = previewRows.value.map(r => {
        const obj = {};
        previewHeaders.value.forEach((h, i) => { obj[h] = r[i] ?? ''; });
        return obj;
    });
}
// keep pagination consistent when data/page size changes
watch(previewPageSize, () => { previewPage.value = 1; });
watch(previewRows, () => {
    if (previewPage.value > totalPreviewPages.value)
        previewPage.value = totalPreviewPages.value;
});
watch([previewHeaders, previewRows], refreshGrid, { immediate: true });
function onEditPreview() {
    if (!dataset.value?.preview)
        return;
    // 深拷贝，避免直接修改原数据
    editPreviewRows.value = dataset.value.preview.map(row => [...row]);
    isEditingPreview.value = true;
    // initialize ag-grid
    refreshGrid();
}
function onGridReady(params) {
    gridApi.value = params.api;
}
function onCellValueChanged(e) {
    // Reflect changes back into editPreviewRows based on header order
    const rowIndex = e.rowIndex;
    const colId = e.colDef?.field;
    const colIndex = previewHeaders.value.indexOf(colId);
    if (colIndex >= 0) {
        if (!editPreviewRows.value[rowIndex])
            editPreviewRows.value[rowIndex] = [];
        editPreviewRows.value[rowIndex][colIndex] = e.newValue;
    }
}
function onCancelEditPreview() {
    isEditingPreview.value = false;
    editPreviewRows.value = [];
}
async function onSaveEditPreview() {
    if (dataset.value && editPreviewRows.value.length) {
        // If this dataset is persisted on the server, update it there so builds use the edits.
        if (dataset.value.id) {
            try {
                const res = await fetch(`/api/admin/analytics/datasets/${encodeURIComponent(dataset.value.id)}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows: editPreviewRows.value })
                });
                if (!res.ok) {
                    const msg = await res.text();
                    throw new Error(msg || `更新数据失败 (${res.status})`);
                }
                const payload = await res.json();
                dataset.value.preview = editPreviewRows.value.map(row => [...row]);
                if (typeof payload.rowCount === 'number')
                    dataset.value.rowCount = payload.rowCount;
            }
            catch (e) {
                // Surface error to user briefly
                // eslint-disable-next-line no-console
                console.error('保存数据预览失败', e);
                alert(e?.message || '保存数据失败');
            }
        }
        else {
            // local-only dataset, just update preview
            dataset.value.preview = editPreviewRows.value.map(row => [...row]);
        }
    }
    isEditingPreview.value = false;
    editPreviewRows.value = [];
}
function getEditCell(i, j) {
    return (editPreviewRows.value[i] && editPreviewRows.value[i][j]) ?? '';
}
function setEditCell(i, j, v) {
    if (!editPreviewRows.value[i])
        editPreviewRows.value[i] = [];
    editPreviewRows.value[i][j] = v;
}
const chartTheme = computed(() => String(optionConfig.value.theme || chartOption.value?.theme || 'default'));
const toolbarTheme = computed({
    get: () => chartTheme.value,
    set: (v) => {
        optionConfig.value = { ...optionConfig.value, theme: v };
    }
});
function inferHeader(headers, ...keys) {
    const lowered = headers.map(header => header.toLowerCase());
    for (const key of keys) {
        const needle = key.toLowerCase();
        const matchIndex = lowered.findIndex(header => header.includes(needle));
        if (matchIndex >= 0)
            return headers[matchIndex] ?? '';
    }
    return '';
}
function inferDatasetDefaults(headers) {
    const xCol = inferHeader(headers, 'month', 'date', 'category', 'name', 'x');
    const yCol = inferHeader(headers, 'revenue', 'value', 'profit', 'amount', 'y');
    const y2Col = inferHeader(headers, 'cost', 'share', 'value2', 'y2');
    const y3Col = inferHeader(headers, 'profit', 'value3', 'y3');
    const yCount = [yCol, y2Col, y3Col].filter(Boolean).length || 1;
    return {
        xCol,
        yCol,
        y2Col,
        y3Col,
        yMetricCount: yCount,
        nameCol: inferHeader(headers, 'category', 'name', 'label'),
        valueCol: inferHeader(headers, 'share', 'revenue', 'value', 'amount'),
        value2Col: inferHeader(headers, 'cost', 'profit', 'value2'),
        sizeCol: inferHeader(headers, 'scattersize', 'size', 'bubble'),
        sourceCol: inferHeader(headers, 'source', 'from'),
        targetCol: inferHeader(headers, 'target', 'to'),
        linkValueCol: inferHeader(headers, 'linkvalue', 'weight', 'flow', 'value'),
        nodeIDCol: inferHeader(headers, 'nodeid', 'id'),
        parentIDCol: inferHeader(headers, 'parentid', 'parent'),
        nodeValueCol: inferHeader(headers, 'nodevalue', 'value', 'amount'),
        seriesName: yCol || '指标A',
        series2Name: y2Col || '指标B',
        series3Name: y3Col || '指标C',
        gaugeMode: 'avg',
        sortMode: 'none',
    };
}
function applyAutoMappingForCurrentChart() {
    if (!dataset.value || isGanttMode.value || !chartKind.value || !demoDatasetLoaded.value)
        return;
    const def = definitions.value.find(item => item.kind === chartKind.value);
    if (!def)
        return;
    const inferred = inferDatasetDefaults(dataset.value.headers);
    const nextFieldConfig = {};
    const nextOptionConfig = { ...optionConfig.value };
    for (const field of def.fields) {
        const inferredValue = inferred[field.key];
        if (field.type === 'column') {
            if (field.key === 'yExtraCols') {
                nextFieldConfig[field.key] = [];
            }
            else if (typeof inferredValue === 'string' && inferredValue) {
                nextFieldConfig[field.key] = inferredValue;
            }
            continue;
        }
        if (field.key === 'yMetricCount') {
            nextOptionConfig[field.key] = inferred.yMetricCount;
            continue;
        }
        if (typeof inferredValue === 'string' && inferredValue) {
            nextOptionConfig[field.key] = inferredValue;
        }
    }
    fieldConfig.value = nextFieldConfig;
    optionConfig.value = nextOptionConfig;
    buildFieldErrors.value = {};
    if (!chartTitle.value) {
        chartTitle.value = `${def.label}预览`;
    }
}
async function loadDemoDataset(kind = chartKind.value) {
    const preset = getAnalyticsDemoPreset(kind);
    await loadDemoDatasetByPreset(preset.key);
}
async function loadSelectedDemoDataset() {
    const preset = analyticsDemoPresets[selectedDemoPresetKey.value] ?? getAnalyticsDemoPreset(chartKind.value);
    await loadDemoDatasetByPreset(preset.key);
}
async function loadDemoDatasetByPreset(presetKey) {
    const preset = analyticsDemoPresets[presetKey] ?? getAnalyticsDemoPreset(chartKind.value);
    if (demoLoading.value)
        return;
    demoLoading.value = true;
    demoError.value = '';
    try {
        activeDemoPresetKey.value = preset.key;
        selectedDemoPresetKey.value = preset.key;
        const file = new File([preset.csv], preset.fileName, { type: 'text/csv' });
        const fd = new FormData();
        fd.append('file', file);
        const uploadRes = await fetch('/api/admin/analytics/datasets/upload', {
            method: 'POST',
            credentials: 'include',
            body: fd,
        });
        if (!uploadRes.ok) {
            let msg = `上传测试数据失败 (${uploadRes.status})`;
            try {
                const payload = await uploadRes.json();
                msg = payload?.error || msg;
            }
            catch {
                msg = (await uploadRes.text()) || msg;
            }
            throw new Error(msg);
        }
        const payload = await uploadRes.json();
        demoDatasetLoaded.value = true;
        onUploaded(payload);
    }
    catch (e) {
        demoError.value = e?.message ?? '测试数据加载失败';
        demoDatasetLoaded.value = false;
    }
    finally {
        demoLoading.value = false;
    }
}
function onToggleAutoDemo() {
    localStorage.setItem('analytics:autoDemoLoad', autoLoadDemo.value ? '1' : '0');
    if (autoLoadDemo.value) {
        loadDemoDataset(chartKind.value);
    }
}
function onDemoPresetChange(nextPresetKey) {
    selectedDemoPresetKey.value = nextPresetKey;
}
async function onLoadDemoClick() {
    if (autoLoadDemo.value) {
        await loadDemoDataset(chartKind.value);
        return;
    }
    await loadSelectedDemoDataset();
}
onMounted(async () => {
    autoLoadDemo.value = localStorage.getItem('analytics:autoDemoLoad') === '1';
    try {
        const res = await fetch('/api/admin/analytics/definitions', {
            credentials: 'include'
        });
        if (!res.ok)
            throw new Error(`获取图表定义失败 (${res.status})`);
        const data = await res.json();
        definitions.value = Array.isArray(data) ? data : (Array.isArray(data?.definitions) ? data.definitions : []);
        if (definitions.value.length > 0)
            chartKind.value = definitions.value[0].kind;
    }
    catch (e) {
        defsError.value = e.message ?? '未知错误';
    }
    finally {
        loadingDefs.value = false;
    }
    if (autoLoadDemo.value && !dataset.value) {
        await loadDemoDataset(chartKind.value);
    }
});
function onUploaded(payload) {
    dataset.value = payload;
    demoDatasetLoaded.value = isAnalyticsDemoFileName(payload.name);
    if (demoDatasetLoaded.value && activeDemoPresetKey.value) {
        selectedDemoPresetKey.value = activeDemoPresetKey.value;
    }
    fieldConfig.value = {};
    optionConfig.value = {};
    ganttConfig.value = {};
    buildError.value = '';
    buildFieldErrors.value = {};
    chartOption.value = null;
    ganttData.value = null;
    // If user wants to see all preview rows by default, request full dataset from server
    if (payload.id && previewPageSize.value < 0) {
        (async () => {
            try {
                const res = await fetch(`/api/admin/analytics/datasets/${encodeURIComponent(payload.id)}?full=1`, { credentials: 'include' });
                if (!res.ok)
                    return;
                const full = await res.json();
                dataset.value = full;
            }
            catch (e) {
                // ignore
            }
        })();
    }
}
watch([dataset, chartKind, chartMode], () => {
    applyAutoMappingForCurrentChart();
});
watch(chartKind, async (kind) => {
    if (!kind || chartMode.value === 'gantt' || !autoLoadDemo.value)
        return;
    const preset = getAnalyticsDemoPreset(kind);
    if (demoDatasetLoaded.value && dataset.value && preset.key === activeDemoPresetKey.value) {
        applyAutoMappingForCurrentChart();
        return;
    }
    await loadDemoDataset(kind);
});
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
async function build() {
    if (!dataset.value || !chartKind.value)
        return;
    building.value = true;
    buildError.value = '';
    buildFieldErrors.value = {};
    chartOption.value = null;
    ganttData.value = null;
    try {
        if (chartMode.value === 'gantt') {
            // If user is viewing a paged preview, build from the currently visible rows instead
            // of the full stored dataset so pagination/edits are reflected immediately.
            const body = { config: ganttConfig.value };
            // Prefer building from the full stored dataset when available. Only send
            // inline rows when the dataset is local (no id) or the user is actively
            // editing the preview (so their edits are used immediately).
            if (dataset.value && (isEditingPreview.value || !dataset.value.id)) {
                body.headers = previewHeaders.value;
                body.rows = pagedPreviewRows.value;
            }
            else {
                body.datasetId = dataset.value?.id;
            }
            const res = await fetch('/api/admin/analytics/gantt/build', {
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
            const body = {
                datasetId: dataset.value.id,
                chartKind: chartKind.value,
                schemaVersion: 2,
                configV2: mergedV2Config,
                // Keep legacy payload for backward compatibility during migration window.
                config: toLegacyConfig(mergedV2Config)
            };
            const res = await fetch('/api/admin/analytics/build', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
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
        buildError.value = e.message ?? '构建出错';
    }
    finally {
        building.value = false;
    }
}
// exportPNG removed — export handled by chart toolbar
function reset() {
    dataset.value = null;
    demoDatasetLoaded.value = false;
    activeDemoPresetKey.value = '';
    chartOption.value = null;
    ganttData.value = null;
    buildError.value = '';
    fieldConfig.value = {};
    optionConfig.value = {};
    ganttConfig.value = {};
    ganttOptions.value = { showTaskDetails: true, showDuration: true, sortByStart: false, autoNumber: false, darkTheme: false, granularity: 'month' };
    buildFieldErrors.value = {};
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['btn-back']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-error']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-section']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-section']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-fold']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-build']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-build']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-reset']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-export']} */ ;
/** @type {__VLS_StyleScopedClasses['demo-select']} */ ;
/** @type {__VLS_StyleScopedClasses['demo-select']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-load-demo']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-chart-area']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-chart-area']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-table']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-table']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-chart-area']} */ ;
/** @type {__VLS_StyleScopedClasses['gantt-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-chart-area']} */ ;
/** @type {__VLS_StyleScopedClasses['normal-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-body']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-chart-area']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-chart-area']} */ ;
/** @type {__VLS_StyleScopedClasses['gantt-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['wb-chart-area']} */ ;
/** @type {__VLS_StyleScopedClasses['normal-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['demo-toggle-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "workbench" },
});
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "wb-header" },
});
/** @type {__VLS_StyleScopedClasses['wb-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
    ...{ class: "wb-title" },
});
/** @type {__VLS_StyleScopedClasses['wb-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push(__VLS_ctx.backPath);
            // @ts-ignore
            [router, backPath,];
        } },
    ...{ class: "btn-back" },
});
/** @type {__VLS_StyleScopedClasses['btn-back']} */ ;
(__VLS_ctx.backLabel);
if (__VLS_ctx.loadingDefs) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wb-loading" },
    });
    /** @type {__VLS_StyleScopedClasses['wb-loading']} */ ;
}
else if (__VLS_ctx.defsError) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wb-error" },
    });
    /** @type {__VLS_StyleScopedClasses['wb-error']} */ ;
    (__VLS_ctx.defsError);
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wb-body" },
    });
    /** @type {__VLS_StyleScopedClasses['wb-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "wb-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['wb-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wb-tabs" },
    });
    /** @type {__VLS_StyleScopedClasses['wb-tabs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loadingDefs))
                    return;
                if (!!(__VLS_ctx.defsError))
                    return;
                __VLS_ctx.activeTab = 'step1';
                // @ts-ignore
                [backLabel, loadingDefs, defsError, defsError, activeTab,];
            } },
        ...{ class: "wb-tab" },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'step1' }) },
    });
    /** @type {__VLS_StyleScopedClasses['wb-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loadingDefs))
                    return;
                if (!!(__VLS_ctx.defsError))
                    return;
                __VLS_ctx.step >= 2 && (__VLS_ctx.activeTab = 'step2');
                // @ts-ignore
                [activeTab, activeTab, step,];
            } },
        ...{ class: "wb-tab" },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'step2', disabled: __VLS_ctx.step < 2 }) },
    });
    /** @type {__VLS_StyleScopedClasses['wb-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loadingDefs))
                    return;
                if (!!(__VLS_ctx.defsError))
                    return;
                __VLS_ctx.step >= 3 && (__VLS_ctx.activeTab = 'step3');
                // @ts-ignore
                [activeTab, activeTab, step, step,];
            } },
        ...{ class: "wb-tab" },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'step3', disabled: __VLS_ctx.step < 3 }) },
    });
    /** @type {__VLS_StyleScopedClasses['wb-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    if (__VLS_ctx.activeTab === 'step1') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "wb-section" },
            ...{ class: ({ done: __VLS_ctx.step > 1 }) },
        });
        /** @type {__VLS_StyleScopedClasses['wb-section']} */ ;
        /** @type {__VLS_StyleScopedClasses['done']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "demo-toggle-row" },
        });
        /** @type {__VLS_StyleScopedClasses['demo-toggle-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "demo-toggle-label" },
        });
        /** @type {__VLS_StyleScopedClasses['demo-toggle-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (__VLS_ctx.onToggleAutoDemo) },
            type: "checkbox",
        });
        (__VLS_ctx.autoLoadDemo);
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: (...[$event]) => {
                    if (!!(__VLS_ctx.loadingDefs))
                        return;
                    if (!!(__VLS_ctx.defsError))
                        return;
                    if (!(__VLS_ctx.activeTab === 'step1'))
                        return;
                    __VLS_ctx.onDemoPresetChange($event.target.value);
                    // @ts-ignore
                    [activeTab, activeTab, step, step, onToggleAutoDemo, autoLoadDemo, onDemoPresetChange,];
                } },
            ...{ class: "demo-select" },
            value: (__VLS_ctx.selectedDemoPresetKey),
            disabled: (__VLS_ctx.autoLoadDemo),
        });
        /** @type {__VLS_StyleScopedClasses['demo-select']} */ ;
        for (const [item] of __VLS_vFor((__VLS_ctx.analyticsDemoOptions))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (item.key),
                value: (item.key),
            });
            (item.label);
            // @ts-ignore
            [autoLoadDemo, selectedDemoPresetKey, analyticsDemoOptions,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.onLoadDemoClick) },
            ...{ class: "btn-load-demo" },
            disabled: (__VLS_ctx.demoLoading),
        });
        /** @type {__VLS_StyleScopedClasses['btn-load-demo']} */ ;
        (__VLS_ctx.demoButtonLabel);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "demo-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['demo-hint']} */ ;
        (__VLS_ctx.demoHintText);
        if (__VLS_ctx.demoError) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "demo-error" },
            });
            /** @type {__VLS_StyleScopedClasses['demo-error']} */ ;
            (__VLS_ctx.demoError);
        }
        const __VLS_0 = DatasetUpload;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            ...{ 'onUploaded': {} },
        }));
        const __VLS_2 = __VLS_1({
            ...{ 'onUploaded': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        let __VLS_5;
        const __VLS_6 = ({ uploaded: {} },
            { onUploaded: (__VLS_ctx.onUploaded) });
        var __VLS_3;
        var __VLS_4;
    }
    else if (__VLS_ctx.activeTab === 'step2') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "wb-section" },
            ...{ class: ({ disabled: __VLS_ctx.step < 2, done: __VLS_ctx.step > 2 }) },
        });
        /** @type {__VLS_StyleScopedClasses['wb-section']} */ ;
        /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
        /** @type {__VLS_StyleScopedClasses['done']} */ ;
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
            const __VLS_7 = ChartOptionsPanel;
            // @ts-ignore
            const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                definitions: (__VLS_ctx.definitions),
                modelValue: (__VLS_ctx.chartKind),
                title: (__VLS_ctx.chartTitle),
                config: (__VLS_ctx.optionConfig),
                fieldErrors: (__VLS_ctx.buildFieldErrors),
            }));
            const __VLS_9 = __VLS_8({
                definitions: (__VLS_ctx.definitions),
                modelValue: (__VLS_ctx.chartKind),
                title: (__VLS_ctx.chartTitle),
                config: (__VLS_ctx.optionConfig),
                fieldErrors: (__VLS_ctx.buildFieldErrors),
            }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "gantt-hint" },
            });
            /** @type {__VLS_StyleScopedClasses['gantt-hint']} */ ;
        }
    }
    else if (__VLS_ctx.activeTab === 'step3') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "wb-section" },
            ...{ class: ({ disabled: __VLS_ctx.step < 3, done: __VLS_ctx.step > 2 }) },
        });
        /** @type {__VLS_StyleScopedClasses['wb-section']} */ ;
        /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
        /** @type {__VLS_StyleScopedClasses['done']} */ ;
        if (__VLS_ctx.chartMode === 'general') {
            const __VLS_12 = FieldMapper;
            // @ts-ignore
            const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
                headers: (__VLS_ctx.dataset?.headers ?? []),
                chartKind: (__VLS_ctx.chartKind),
                definitions: (__VLS_ctx.definitions),
                contextConfig: (__VLS_ctx.optionConfig),
                fieldErrors: (__VLS_ctx.buildFieldErrors),
                modelValue: (__VLS_ctx.fieldConfig),
            }));
            const __VLS_14 = __VLS_13({
                headers: (__VLS_ctx.dataset?.headers ?? []),
                chartKind: (__VLS_ctx.chartKind),
                definitions: (__VLS_ctx.definitions),
                contextConfig: (__VLS_ctx.optionConfig),
                fieldErrors: (__VLS_ctx.buildFieldErrors),
                modelValue: (__VLS_ctx.fieldConfig),
            }, ...__VLS_functionalComponentArgsRest(__VLS_13));
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
                for (const [h] of __VLS_vFor(((__VLS_ctx.dataset?.headers ?? [])))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        key: (h),
                        value: (h),
                    });
                    (h);
                    // @ts-ignore
                    [activeTab, activeTab, step, step, step, step, onLoadDemoClick, demoLoading, demoButtonLabel, demoHintText, demoError, demoError, onUploaded, chartMode, chartMode, chartMode, chartMode, definitions, definitions, chartKind, chartKind, chartTitle, optionConfig, optionConfig, buildFieldErrors, buildFieldErrors, dataset, dataset, fieldConfig, GANTT_FIELDS, ganttConfig,];
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
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wb-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['wb-actions']} */ ;
    if (__VLS_ctx.buildError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "build-error" },
        });
        /** @type {__VLS_StyleScopedClasses['build-error']} */ ;
        (__VLS_ctx.buildError);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "btn-row" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.build) },
        ...{ class: "btn-build" },
        disabled: (!__VLS_ctx.canBuild || __VLS_ctx.building),
    });
    /** @type {__VLS_StyleScopedClasses['btn-build']} */ ;
    (__VLS_ctx.building ? '构建中…' : '生成图表');
    if (__VLS_ctx.dataset) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.reset) },
            ...{ class: "btn-reset" },
        });
        /** @type {__VLS_StyleScopedClasses['btn-reset']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "wb-chart-area" },
        ...{ class: (__VLS_ctx.isGanttMode ? 'gantt-mode' : 'normal-mode') },
    });
    /** @type {__VLS_StyleScopedClasses['wb-chart-area']} */ ;
    if (__VLS_ctx.dataset) {
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
        (__VLS_ctx.dataset.rowCount);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ style: {} },
        });
        if (!__VLS_ctx.isEditingPreview) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.onEditPreview) },
                ...{ class: "btn-edit" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-edit']} */ ;
        }
        if (__VLS_ctx.isEditingPreview) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.onSaveEditPreview) },
                ...{ class: "btn-save" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-save']} */ ;
        }
        if (__VLS_ctx.isEditingPreview) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.onCancelEditPreview) },
                ...{ class: "btn-cancel" },
            });
            /** @type {__VLS_StyleScopedClasses['btn-cancel']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loadingDefs))
                        return;
                    if (!!(__VLS_ctx.defsError))
                        return;
                    if (!(__VLS_ctx.dataset))
                        return;
                    __VLS_ctx.previewCollapsed = !__VLS_ctx.previewCollapsed;
                    // @ts-ignore
                    [dataset, dataset, dataset, ganttOptions, ganttOptions, ganttOptions, ganttOptions, ganttOptions, ganttOptions, buildError, buildError, build, canBuild, building, building, reset, isGanttMode, pagedPreviewRows, isEditingPreview, isEditingPreview, isEditingPreview, onEditPreview, onSaveEditPreview, onCancelEditPreview, previewCollapsed, previewCollapsed,];
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
            if (!__VLS_ctx.isEditingPreview) {
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
                    [isEditingPreview, previewCollapsed, previewCollapsed, previewHeaders,];
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
                            if (!!(__VLS_ctx.loadingDefs))
                                return;
                            if (!!(__VLS_ctx.defsError))
                                return;
                            if (!(__VLS_ctx.dataset))
                                return;
                            if (!(!__VLS_ctx.previewCollapsed))
                                return;
                            if (!(!__VLS_ctx.isEditingPreview))
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
                            if (!!(__VLS_ctx.loadingDefs))
                                return;
                            if (!!(__VLS_ctx.defsError))
                                return;
                            if (!(__VLS_ctx.dataset))
                                return;
                            if (!(!__VLS_ctx.previewCollapsed))
                                return;
                            if (!(!__VLS_ctx.isEditingPreview))
                                return;
                            __VLS_ctx.previewPage++;
                            // @ts-ignore
                            [previewPage, previewPage, previewPage, totalPreviewPages,];
                        } },
                    disabled: (__VLS_ctx.previewPage >= __VLS_ctx.totalPreviewPages),
                });
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "ag-theme-alpine" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['ag-theme-alpine']} */ ;
                let __VLS_17;
                /** @ts-ignore @type { | typeof __VLS_components.AgGridVue} */
                AgGridVue;
                // @ts-ignore
                const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
                    ...{ 'onGridReady': {} },
                    ...{ 'onCellValueChanged': {} },
                    ...{ class: "ag-grid" },
                    ...{ style: {} },
                    columnDefs: (__VLS_ctx.gridColumnDefs),
                    rowData: (__VLS_ctx.gridRowData),
                }));
                const __VLS_19 = __VLS_18({
                    ...{ 'onGridReady': {} },
                    ...{ 'onCellValueChanged': {} },
                    ...{ class: "ag-grid" },
                    ...{ style: {} },
                    columnDefs: (__VLS_ctx.gridColumnDefs),
                    rowData: (__VLS_ctx.gridRowData),
                }, ...__VLS_functionalComponentArgsRest(__VLS_18));
                let __VLS_22;
                const __VLS_23 = ({ gridReady: {} },
                    { onGridReady: (__VLS_ctx.onGridReady) });
                const __VLS_24 = ({ cellValueChanged: {} },
                    { onCellValueChanged: (__VLS_ctx.onCellValueChanged) });
                /** @type {__VLS_StyleScopedClasses['ag-grid']} */ ;
                var __VLS_20;
                var __VLS_21;
            }
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "chart-stage" },
    });
    /** @type {__VLS_StyleScopedClasses['chart-stage']} */ ;
    if (!__VLS_ctx.chartOption && !__VLS_ctx.ganttData && !__VLS_ctx.building) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-placeholder" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-placeholder']} */ ;
    }
    else {
        const __VLS_25 = ChartToolbar || ChartToolbar;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
            chartRef: (__VLS_ctx.isGanttMode ? __VLS_ctx.ganttRef : __VLS_ctx.chartRef),
            theme: (__VLS_ctx.toolbarTheme),
        }));
        const __VLS_27 = __VLS_26({
            chartRef: (__VLS_ctx.isGanttMode ? __VLS_ctx.ganttRef : __VLS_ctx.chartRef),
            theme: (__VLS_ctx.toolbarTheme),
        }, ...__VLS_functionalComponentArgsRest(__VLS_26));
        const { default: __VLS_30 } = __VLS_28.slots;
        if (__VLS_ctx.isGanttMode && __VLS_ctx.ganttData) {
            const __VLS_31 = GanttChart;
            // @ts-ignore
            const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
                ref: "ganttRef",
                tasks: (__VLS_ctx.ganttData.tasks),
                stats: (__VLS_ctx.ganttData.stats),
                theme: (__VLS_ctx.chartTheme),
                options: (__VLS_ctx.ganttOptions),
            }));
            const __VLS_33 = __VLS_32({
                ref: "ganttRef",
                tasks: (__VLS_ctx.ganttData.tasks),
                stats: (__VLS_ctx.ganttData.stats),
                theme: (__VLS_ctx.chartTheme),
                options: (__VLS_ctx.ganttOptions),
            }, ...__VLS_functionalComponentArgsRest(__VLS_32));
            var __VLS_36 = {};
            var __VLS_34;
        }
        else if (!__VLS_ctx.isGanttMode) {
            const __VLS_38 = ChartCanvas;
            // @ts-ignore
            const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
                ref: "chartRef",
                option: (__VLS_ctx.chartOption),
                loading: (__VLS_ctx.building),
                theme: (__VLS_ctx.chartTheme),
            }));
            const __VLS_40 = __VLS_39({
                ref: "chartRef",
                option: (__VLS_ctx.chartOption),
                loading: (__VLS_ctx.building),
                theme: (__VLS_ctx.chartTheme),
            }, ...__VLS_functionalComponentArgsRest(__VLS_39));
            var __VLS_43 = {};
            var __VLS_41;
        }
        // @ts-ignore
        [ganttOptions, building, building, isGanttMode, isGanttMode, isGanttMode, previewPage, totalPreviewPages, gridColumnDefs, gridRowData, onGridReady, onCellValueChanged, chartOption, chartOption, ganttData, ganttData, ganttData, ganttData, ganttRef, chartRef, toolbarTheme, chartTheme, chartTheme,];
        var __VLS_28;
    }
}
// @ts-ignore
var __VLS_37 = __VLS_36, __VLS_44 = __VLS_43;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
