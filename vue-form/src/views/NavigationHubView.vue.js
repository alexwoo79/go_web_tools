import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
const router = useRouter();
const auth = useAuthStore();
const roleText = computed(() => auth.user?.role === 'admin' ? '管理员' : '普通用户');
const isAdmin = computed(() => auth.user?.role === 'admin');
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    auth.setUser(null);
    router.push('/login');
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['hub-header']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-card']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-card']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-card']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hub-main']} */ ;
/** @type {__VLS_StyleScopedClasses['hub-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "hub-page" },
});
/** @type {__VLS_StyleScopedClasses['hub-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "hub-header" },
});
/** @type {__VLS_StyleScopedClasses['hub-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "hub-user" },
});
/** @type {__VLS_StyleScopedClasses['hub-user']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.auth.user?.username);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "role" },
});
/** @type {__VLS_StyleScopedClasses['role']} */ ;
(__VLS_ctx.roleText);
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/change-password');
            // @ts-ignore
            [auth, roleText, router,];
        } },
    ...{ class: "link-btn" },
});
/** @type {__VLS_StyleScopedClasses['link-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.logout) },
    ...{ class: "link-btn" },
});
/** @type {__VLS_StyleScopedClasses['link-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "hub-main" },
});
/** @type {__VLS_StyleScopedClasses['hub-main']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/');
            // @ts-ignore
            [router, logout,];
        } },
    ...{ class: "entry-card" },
});
/** @type {__VLS_StyleScopedClasses['entry-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/admin/analytics');
            // @ts-ignore
            [router,];
        } },
    ...{ class: "entry-card" },
});
/** @type {__VLS_StyleScopedClasses['entry-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
if (__VLS_ctx.isAdmin) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isAdmin))
                    return;
                __VLS_ctx.router.push('/admin');
                // @ts-ignore
                [router, isAdmin,];
            } },
        ...{ class: "entry-card" },
    });
    /** @type {__VLS_StyleScopedClasses['entry-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
if (__VLS_ctx.isAdmin) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isAdmin))
                    return;
                __VLS_ctx.router.push('/admin/users');
                // @ts-ignore
                [router, isAdmin,];
            } },
        ...{ class: "entry-card" },
    });
    /** @type {__VLS_StyleScopedClasses['entry-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
