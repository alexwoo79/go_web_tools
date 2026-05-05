import { ref } from 'vue';
import { ECHARTS_THEME_OPTIONS } from '@/utils/echartsTheme';
const props = defineProps();
const emit = defineEmits();
const defaultThemeOptions = ECHARTS_THEME_OPTIONS;
const copyMsg = ref('');
function doExportPNG() {
    props.chartRef?.exportPNG?.();
}
function doExportSVG() {
    props.chartRef?.exportSVG?.();
}
function doExportHTML() {
    props.chartRef?.exportHTML?.();
}
async function doCopyJSON() {
    props.chartRef?.exportJSON?.();
    copyMsg.value = '已复制';
    setTimeout(() => { copyMsg.value = ''; }, 1500);
}
function doFullscreen() {
    props.chartRef?.enterFullscreen?.();
}
function onThemeChange(v) {
    emit('update:theme', v);
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
/** @type {__VLS_StyleScopedClasses['chart-toolbar-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-select']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chart-toolbar-wrap" },
});
/** @type {__VLS_StyleScopedClasses['chart-toolbar-wrap']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "toolbar" },
});
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
if (__VLS_ctx.title) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "toolbar-title" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-title']} */ ;
    (__VLS_ctx.title);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "toolbar-actions" },
});
/** @type {__VLS_StyleScopedClasses['toolbar-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    ...{ onChange: (...[$event]) => {
            __VLS_ctx.onThemeChange($event.target.value);
            // @ts-ignore
            [title, title, onThemeChange,];
        } },
    ...{ class: "tb-select" },
    value: (__VLS_ctx.theme || 'default'),
    title: "图表主题",
});
/** @type {__VLS_StyleScopedClasses['tb-select']} */ ;
for (const [item] of __VLS_vFor(((__VLS_ctx.themeOptions && __VLS_ctx.themeOptions.length ? __VLS_ctx.themeOptions : __VLS_ctx.defaultThemeOptions)))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (item.value),
        value: (item.value),
    });
    (item.label);
    // @ts-ignore
    [theme, themeOptions, themeOptions, themeOptions, defaultThemeOptions,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.doExportPNG) },
    ...{ class: "tb-btn" },
    title: "导出 PNG",
});
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.doExportSVG) },
    ...{ class: "tb-btn" },
    title: "导出 SVG",
});
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.doExportHTML) },
    ...{ class: "tb-btn" },
    title: "导出 HTML",
});
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.doCopyJSON) },
    ...{ class: "tb-btn" },
    title: "复制图表配置 JSON",
});
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.copyMsg || '复制 JSON');
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.doFullscreen) },
    ...{ class: "tb-btn" },
    title: "全屏",
});
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
var __VLS_0 = {};
// @ts-ignore
var __VLS_1 = __VLS_0;
// @ts-ignore
[doExportPNG, doExportSVG, doExportHTML, doCopyJSON, copyMsg, doFullscreen,];
const __VLS_base = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_export = {};
export default {};
