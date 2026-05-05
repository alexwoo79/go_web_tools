import { RouterView } from 'vue-router';
import { onMounted, ref } from 'vue';
const theme = ref('calm');
function applyTheme(mode) {
    theme.value = mode;
    if (mode === 'vivid') {
        document.documentElement.setAttribute('data-theme', 'vivid');
    }
    else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('ui-theme', mode);
}
function toggleTheme() {
    applyTheme(theme.value === 'calm' ? 'vivid' : 'calm');
}
onMounted(() => {
    const saved = localStorage.getItem('ui-theme');
    applyTheme(saved === 'vivid' ? 'vivid' : 'calm');
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['theme-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['global-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-switch']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.toggleTheme) },
    ...{ class: "theme-switch" },
});
/** @type {__VLS_StyleScopedClasses['theme-switch']} */ ;
(__VLS_ctx.theme === 'calm' ? '浅色活力' : '浅色商务');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "app-shell" },
});
/** @type {__VLS_StyleScopedClasses['app-shell']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "app-content" },
});
/** @type {__VLS_StyleScopedClasses['app-content']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.RouterView} */
RouterView;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
    ...{ class: "global-footer" },
});
/** @type {__VLS_StyleScopedClasses['global-footer']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "dot" },
});
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "dot" },
});
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
// @ts-ignore
[toggleTheme, theme,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
