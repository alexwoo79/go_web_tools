import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, RadarChart, FunnelChart, GaugeChart, TreeChart, TreemapChart, SankeyChart, GraphChart, ChordChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, GridComponent, LegendComponent, DataZoomComponent, ToolboxComponent, } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import 'echarts/theme/dark';
import 'echarts/theme/vintage';
import 'echarts/theme/macarons';
import 'echarts/theme/shine';
import 'echarts/theme/roma';
import 'echarts/theme/infographic';
import { getThemeProfile, getEchartsRuntimeThemeName } from '@/utils/echartsTheme';
echarts.use([
    BarChart, LineChart, PieChart, ScatterChart, RadarChart,
    FunnelChart, GaugeChart, TreeChart, TreemapChart, SankeyChart, GraphChart, ChordChart,
    TitleComponent, TooltipComponent, GridComponent,
    LegendComponent, DataZoomComponent,
    ToolboxComponent,
    CanvasRenderer,
]);
const props = defineProps();
const chartEl = ref();
let instance = null;
let ro = null;
let appliedTheme;
const CARTESIAN_KINDS = new Set(['bar', 'line', 'area', 'stack_bar', 'stack_area', 'scatter']);
const NON_TOOLBOX_ZOOM_KINDS = new Set(['pie', 'donut', 'funnel', 'radar', 'sankey', 'chord', 'graph', 'tree', 'treemap', 'gauge']);
function buildDataViewTable(option) {
    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const style = `
    <style>
      .dv-wrap{padding:12px 16px;font-family:sans-serif;font-size:13px;color:#1a1a2e}
      .dv-table{border-collapse:collapse;width:100%;min-width:300px}
      .dv-table th{background:#eef3ff;color:#334155;font-weight:600;padding:7px 10px;border:1px solid #cfd8ea;text-align:left;white-space:nowrap}
      .dv-table td{padding:6px 10px;border:1px solid #d9e2f2;vertical-align:top;background:#ffffff}
      .dv-table tr:nth-child(even) td{background:#f7faff}
      .dv-table tr:hover td{background:#eaf1ff}
    </style>`;
    try {
        // Bar / Line / Area – xAxis + multi series
        const hasCategoryX = option.xAxis && (option.xAxis.data?.length || (Array.isArray(option.xAxis) && option.xAxis[0]?.data?.length));
        if (hasCategoryX) {
            const xData = Array.isArray(option.xAxis) ? (option.xAxis[0]?.data ?? []) : (option.xAxis.data ?? []);
            const series = Array.isArray(option.series) ? option.series : [];
            const headers = ['分类', ...series.map((s) => esc(s.name || '系列'))];
            let rows = xData.map((x, i) => {
                const cells = series.map((s) => {
                    const v = s.data?.[i];
                    return esc(Array.isArray(v) ? v[1] : (v ?? ''));
                });
                return `<tr><td>${esc(x)}</td>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
            });
            return `${style}<div class="dv-wrap"><table class="dv-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
        }
        // Pie / Funnel – name/value items
        const series0 = Array.isArray(option.series) ? option.series[0] : option.series;
        if (series0?.data && Array.isArray(series0.data) && series0.data[0] && typeof series0.data[0] === 'object' && 'name' in series0.data[0]) {
            const rows = series0.data.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.value)}</td></tr>`);
            return `${style}<div class="dv-wrap"><table class="dv-table"><thead><tr><th>名称</th><th>数值</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
        }
        // Scatter – [x, y] or [x, y, size] points
        if (series0?.type === 'scatter' && Array.isArray(series0.data)) {
            const rows = series0.data.map((d) => {
                const arr = Array.isArray(d) ? d : (d.value ?? []);
                return `<tr>${arr.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`;
            });
            const hasSize = series0.data.some((d) => (Array.isArray(d) ? d : (d.value ?? [])).length > 2);
            const headers = hasSize ? ['X', 'Y', '大小'] : ['X', 'Y'];
            return `${style}<div class="dv-wrap"><table class="dv-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
        }
    }
    catch (_) { /* fallback to default */ }
    return ''; // empty string → echarts falls back to default JSON textarea
}
function buildToolbox(kind, optionRef) {
    const features = {
        saveAsImage: { title: '导出图片', pixelRatio: 2 },
        restore: { title: '还原' },
        dataView: {
            title: '数据视图',
            readOnly: true,
            lang: ['数据视图', '关闭', '刷新'],
            optionToContent: (opt) => {
                const html = buildDataViewTable(opt);
                return html || undefined;
            }
        },
    };
    if (CARTESIAN_KINDS.has(kind)) {
        features.dataZoom = { title: { zoom: '区域缩放', back: '缩放还原' }, yAxisIndex: 'none' };
    }
    if (kind === 'bar' || kind === 'line' || kind === 'area' || kind === 'stack_bar' || kind === 'stack_area') {
        features.magicType = { type: ['line', 'bar'], title: { line: '切换折线', bar: '切换柱状' } };
    }
    return { show: true, right: 10, top: 8, feature: features };
}
function normalizeTitle(rawTitle) {
    const base = rawTitle && typeof rawTitle === 'object' ? rawTitle : {};
    return {
        ...base,
        left: 10,
        top: 8,
        textAlign: 'left',
    };
}
function applyAxisTheme(axis, profile) {
    if (!axis)
        return axis;
    if (Array.isArray(axis))
        return axis.map(item => applyAxisTheme(item, profile));
    return {
        ...axis,
        axisLine: {
            ...(axis.axisLine ?? {}),
            lineStyle: {
                color: axis.axisLine?.lineStyle?.color ?? profile.axisLineColor,
                ...(axis.axisLine?.lineStyle ?? {}),
            },
        },
        axisLabel: {
            color: axis.axisLabel?.color ?? profile.axisLabelColor,
            ...(axis.axisLabel ?? {}),
        },
        splitLine: {
            ...(axis.splitLine ?? {}),
            lineStyle: {
                color: axis.splitLine?.lineStyle?.color ?? profile.splitLineColor,
                ...(axis.splitLine?.lineStyle ?? {}),
            },
        },
    };
}
function applyLegendTheme(legend, profile) {
    if (!legend)
        return legend;
    if (Array.isArray(legend))
        return legend.map(item => applyLegendTheme(item, profile));
    return {
        ...legend,
        textStyle: {
            color: legend.textStyle?.color ?? profile.textColor,
            ...(legend.textStyle ?? {}),
        },
    };
}
function applyTitleTheme(title, profile) {
    if (!title)
        return title;
    if (Array.isArray(title))
        return title.map(item => applyTitleTheme(item, profile));
    return {
        ...title,
        textStyle: {
            color: title.textStyle?.color ?? profile.titleColor,
            ...(title.textStyle ?? {}),
        },
        subtextStyle: {
            color: title.subtextStyle?.color ?? profile.subtitleColor,
            ...(title.subtextStyle ?? {}),
        },
    };
}
function applyThemeProfile(option, themeName) {
    const profile = getThemeProfile(themeName);
    const darkSurface = profile.isDark ? 'rgba(17,24,39,0.94)' : 'rgba(255,255,255,0.96)';
    return {
        ...option,
        color: option.color ?? profile.palette,
        backgroundColor: option.backgroundColor ?? profile.backgroundColor,
        textStyle: {
            color: option.textStyle?.color ?? profile.textColor,
            ...(option.textStyle ?? {}),
        },
        title: applyTitleTheme(option.title, profile),
        legend: applyLegendTheme(option.legend, profile),
        tooltip: option.tooltip
            ? {
                ...option.tooltip,
                backgroundColor: option.tooltip.backgroundColor ?? darkSurface,
                borderColor: option.tooltip.borderColor ?? profile.splitLineColor,
                textStyle: {
                    color: option.tooltip.textStyle?.color ?? profile.textColor,
                    ...(option.tooltip.textStyle ?? {}),
                },
                axisPointer: option.tooltip.axisPointer
                    ? {
                        ...option.tooltip.axisPointer,
                        lineStyle: {
                            color: option.tooltip.axisPointer.lineStyle?.color ?? profile.tooltipAxisColor,
                            ...(option.tooltip.axisPointer.lineStyle ?? {}),
                        },
                    }
                    : option.tooltip.axisPointer,
            }
            : option.tooltip,
        toolbox: option.toolbox
            ? {
                ...option.toolbox,
                iconStyle: {
                    color: option.toolbox.iconStyle?.color ?? 'none',
                    borderColor: option.toolbox.iconStyle?.borderColor ?? profile.toolboxColor,
                    ...(option.toolbox.iconStyle ?? {}),
                },
                emphasis: {
                    ...(option.toolbox.emphasis ?? {}),
                    iconStyle: {
                        borderColor: option.toolbox.emphasis?.iconStyle?.borderColor ?? profile.toolboxEmphasisColor,
                        ...(option.toolbox.emphasis?.iconStyle ?? {}),
                    },
                },
            }
            : option.toolbox,
        xAxis: applyAxisTheme(option.xAxis, profile),
        yAxis: applyAxisTheme(option.yAxis, profile),
        radar: option.radar
            ? {
                ...option.radar,
                axisName: {
                    color: option.radar.axisName?.color ?? profile.axisLabelColor,
                    ...(option.radar.axisName ?? {}),
                },
                axisLine: {
                    ...(option.radar.axisLine ?? {}),
                    lineStyle: {
                        color: option.radar.axisLine?.lineStyle?.color ?? profile.axisLineColor,
                        ...(option.radar.axisLine?.lineStyle ?? {}),
                    },
                },
                splitLine: {
                    ...(option.radar.splitLine ?? {}),
                    lineStyle: {
                        color: option.radar.splitLine?.lineStyle?.color ?? profile.splitLineColor,
                        ...(option.radar.splitLine?.lineStyle ?? {}),
                    },
                },
            }
            : option.radar,
    };
}
function toEChartsOption(raw) {
    if (!raw)
        return null;
    const kind = raw.kind;
    // Payloads from backend builders include `kind`; they must be adapted.
    if (kind) {
        // continue to payload mapping branches below
    }
    else {
        // If it already looks like an ECharts option, still normalize title placement.
        if (raw.xAxis?.type || raw.yAxis?.type || raw.radar?.indicator || raw.series?.[0]?.type) {
            return {
                ...raw,
                title: normalizeTitle(raw.title),
            };
        }
    }
    const title = normalizeTitle(raw.title);
    if (!kind)
        return raw;
    if (kind === 'bar' || kind === 'line' || kind === 'area' || kind === 'stack_bar' || kind === 'stack_area') {
        const isLine = kind === 'line' || kind === 'area' || kind === 'stack_area';
        const isArea = kind === 'area' || kind === 'stack_area';
        const isStack = kind === 'stack_bar' || kind === 'stack_area';
        const swapAxis = !!raw.swapAxis;
        const series = (raw.series ?? []).map((s) => ({
            name: s.name,
            type: isLine ? 'line' : 'bar',
            data: s.data ?? [],
            smooth: !!s.smooth,
            stack: isStack ? 'total' : undefined,
            areaStyle: isArea ? {} : undefined,
        }));
        return {
            title,
            tooltip: { trigger: 'axis' },
            legend: { type: 'scroll', top: 58 },
            grid: { left: 48, right: 20, top: 112, bottom: 68, containLabel: true },
            toolbox: buildToolbox(kind),
            dataZoom: [
                { type: 'slider', xAxisIndex: 0, bottom: 16, height: 18, filterMode: 'none' },
            ],
            xAxis: swapAxis
                ? { type: 'value' }
                : { type: 'category', data: raw.xAxis ?? [] },
            yAxis: swapAxis
                ? { type: 'category', data: raw.xAxis ?? [] }
                : { type: 'value' },
            series,
        };
    }
    if (kind === 'scatter') {
        return {
            title,
            tooltip: { trigger: 'item' },
            toolbox: buildToolbox('scatter'),
            dataZoom: [
                { type: 'slider', xAxisIndex: 0, bottom: 16, height: 18, filterMode: 'none' },
            ],
            grid: { left: 48, right: 20, top: 112, bottom: 68, containLabel: true },
            xAxis: { type: 'value', name: raw.xName || '' },
            yAxis: { type: 'value', name: raw.yName || '' },
            series: [
                {
                    name: raw.seriesName || 'Scatter',
                    type: 'scatter',
                    data: raw.points ?? [],
                    symbolSize: (v) => Array.isArray(v) && v.length > 2 ? Number(v[2]) : 12,
                },
            ],
        };
    }
    if (kind === 'pie' || kind === 'donut' || kind === 'funnel') {
        const items = raw.items ?? [];
        const base = {
            title,
            tooltip: { trigger: 'item' },
            legend: { type: 'scroll', orient: 'vertical', right: 10, top: 20, bottom: 20 },
        };
        if (kind === 'funnel') {
            base.series = [{ name: raw.seriesName || 'Funnel', type: 'funnel', data: items }];
        }
        else {
            base.series = [{
                    name: raw.seriesName || 'Pie',
                    type: 'pie',
                    radius: kind === 'donut' ? ['40%', '70%'] : '60%',
                    center: ['40%', '55%'],
                    data: items,
                }];
        }
        base.toolbox = buildToolbox(kind);
        return base;
    }
    if (kind === 'gauge') {
        return {
            title,
            tooltip: { formatter: '{a}<br/>{b}: {c}' },
            toolbox: buildToolbox('gauge'),
            series: [
                {
                    name: raw.seriesName || 'Gauge',
                    type: 'gauge',
                    max: Number(raw.max ?? 100),
                    data: [{ value: Number(raw.value ?? 0), name: raw.seriesName || 'Value' }],
                },
            ],
        };
    }
    if (kind === 'radar') {
        return {
            title,
            tooltip: { trigger: 'item' },
            legend: { type: 'scroll', top: 58 },
            toolbox: buildToolbox('radar'),
            radar: { indicator: raw.indicators ?? [] },
            series: raw.series ?? [],
        };
    }
    if (kind === 'sankey') {
        return {
            title,
            tooltip: { trigger: 'item' },
            toolbox: buildToolbox('sankey'),
            series: [
                {
                    type: 'sankey',
                    data: raw.nodes ?? [],
                    links: raw.links ?? [],
                    emphasis: { focus: 'adjacency' },
                },
            ],
        };
    }
    if (kind === 'chord') {
        return {
            title,
            tooltip: { trigger: 'item' },
            legend: { type: 'scroll', top: 58 },
            toolbox: buildToolbox('chord'),
            series: [
                {
                    type: 'chord',
                    coordinateSystem: 'none',
                    roam: true,
                    data: raw.nodes ?? [],
                    links: raw.links ?? [],
                    label: { show: true },
                    lineStyle: { opacity: 0.75, curveness: 0.5 },
                    emphasis: { focus: 'adjacency' },
                },
            ],
        };
    }
    if (kind === 'graph') {
        return {
            title,
            tooltip: { trigger: 'item' },
            toolbox: buildToolbox('graph'),
            series: [
                {
                    type: 'graph',
                    layout: 'force',
                    roam: true,
                    label: { show: true },
                    data: raw.nodes ?? [],
                    links: raw.links ?? [],
                    force: { repulsion: 120 },
                },
            ],
        };
    }
    if (kind === 'tree') {
        return {
            title,
            tooltip: { trigger: 'item', triggerOn: 'mousemove' },
            toolbox: buildToolbox('tree'),
            series: [
                {
                    type: 'tree',
                    data: raw.tree ? [raw.tree] : [],
                    top: '5%',
                    left: '7%',
                    bottom: '5%',
                    right: '20%',
                    symbolSize: 9,
                    label: { position: 'left', verticalAlign: 'middle', align: 'right' },
                },
            ],
        };
    }
    if (kind === 'treemap') {
        return {
            title,
            tooltip: { trigger: 'item' },
            toolbox: buildToolbox('treemap'),
            series: [
                {
                    type: 'treemap',
                    data: raw.tree?.children ?? (raw.tree ? [raw.tree] : []),
                },
            ],
        };
    }
    return raw;
}
function exportPNG() {
    if (!instance)
        return;
    const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart.png';
    a.click();
}
function exportSVG() {
    if (!instance)
        return;
    // Get PNG data URL from canvas
    const pngUrl = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
    const chartDom = instance.getDom();
    const width = chartDom?.clientWidth || 800;
    const height = chartDom?.clientHeight || 600;
    // Create SVG with embedded PNG image
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <image href="${pngUrl}" width="${width}" height="${height}"/>
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart.svg';
    a.click();
    URL.revokeObjectURL(url);
}
function exportHTML() {
    const normalized = toEChartsOption(props.option);
    if (!normalized)
        return;
    const themed = applyThemeProfile(normalized, props.theme || props.option?.theme || props.option?.chartTheme);
    const optionJSON = JSON.stringify(themed, null, 2);
    const title = String(normalized?.title?.text || 'Chart Preview');
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
  <style>html,body,#chart{height:100%;margin:0}body{background:#fff}</style>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"><\/script>
</head>
<body>
  <div id="chart"></div>
  <script>
    const chart = echarts.init(document.getElementById('chart'));
    const option = ${optionJSON};
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
  <\/script>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart.html';
    a.click();
    URL.revokeObjectURL(url);
}
function exportJSON() {
    const normalized = toEChartsOption(props.option);
    if (!normalized)
        return;
    const themed = applyThemeProfile(normalized, props.theme || props.option?.theme || props.option?.chartTheme);
    const json = JSON.stringify(themed, null, 2);
    navigator.clipboard.writeText(json).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = json;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
}
function enterFullscreen() {
    const el = chartEl.value?.closest('.chart-canvas-wrap') ?? chartEl.value;
    if (!el)
        return;
    if (el.requestFullscreen)
        el.requestFullscreen();
}
const __VLS_exposed = { exportPNG, exportSVG, exportHTML, exportJSON, enterFullscreen };
defineExpose(__VLS_exposed);
function resolvedTheme() {
    const t = props.theme || props.option?.theme || props.option?.chartTheme;
    return getEchartsRuntimeThemeName(t);
}
function ensureInstance() {
    if (!chartEl.value)
        return;
    const rTheme = resolvedTheme();
    if (!instance) {
        instance = echarts.init(chartEl.value, rTheme);
        appliedTheme = rTheme;
        return;
    }
    if (appliedTheme !== rTheme) {
        ro?.unobserve(chartEl.value);
        instance.dispose();
        instance = echarts.init(chartEl.value, rTheme);
        appliedTheme = rTheme;
        ro?.observe(chartEl.value);
    }
}
onMounted(() => {
    if (!chartEl.value)
        return;
    ensureInstance();
    const normalized = toEChartsOption(props.option);
    if (normalized)
        instance.setOption(applyThemeProfile(normalized, props.theme || props.option?.theme || props.option?.chartTheme));
    ro = new ResizeObserver(() => instance?.resize());
    ro.observe(chartEl.value);
    nextTick(() => instance?.resize());
});
onUnmounted(() => {
    ro?.disconnect();
    instance?.dispose();
    instance = null;
    appliedTheme = undefined;
});
watch(() => [props.option, props.theme], () => {
    ensureInstance();
    const normalized = toEChartsOption(props.option);
    if (instance && normalized)
        instance.setOption(applyThemeProfile(normalized, props.theme || props.option?.theme || props.option?.chartTheme), true);
    nextTick(() => instance?.resize());
}, { deep: true });
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['chart-canvas-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-canvas-wrap']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chart-canvas-wrap" },
});
/** @type {__VLS_StyleScopedClasses['chart-canvas-wrap']} */ ;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "chart-loading" },
    });
    /** @type {__VLS_StyleScopedClasses['chart-loading']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div)({
    ref: "chartEl",
    ...{ class: "chart-el" },
    ...{ style: ({ visibility: __VLS_ctx.loading ? 'hidden' : 'visible' }) },
});
/** @type {__VLS_StyleScopedClasses['chart-el']} */ ;
// @ts-ignore
[loading, loading,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeProps: {},
});
export default {};
