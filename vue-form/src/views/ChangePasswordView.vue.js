import { ref } from 'vue';
import { useRouter } from 'vue-router';
const router = useRouter();
const form = ref({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
});
const error = ref('');
const success = ref('');
const loading = ref(false);
async function changePassword() {
    error.value = '';
    success.value = '';
    if (form.value.newPassword.length < 6) {
        error.value = '新密码至少 6 位';
        return;
    }
    if (form.value.newPassword !== form.value.confirmPassword) {
        error.value = '两次输入的新密码不一致';
        return;
    }
    loading.value = true;
    try {
        const res = await fetch('/api/user/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                oldPassword: form.value.oldPassword,
                newPassword: form.value.newPassword,
            }),
        });
        const payload = await res.json();
        if (!res.ok) {
            error.value = payload.error || '修改密码失败';
            return;
        }
        success.value = '密码修改成功';
        form.value.oldPassword = '';
        form.value.newPassword = '';
        form.value.confirmPassword = '';
    }
    catch {
        error.value = '网络错误，请稍后重试';
    }
    finally {
        loading.value = false;
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['form']} */ ;
/** @type {__VLS_StyleScopedClasses['form']} */ ;
/** @type {__VLS_StyleScopedClasses['form']} */ ;
/** @type {__VLS_StyleScopedClasses['form']} */ ;
/** @type {__VLS_StyleScopedClasses['form']} */ ;
/** @type {__VLS_StyleScopedClasses['msg']} */ ;
/** @type {__VLS_StyleScopedClasses['msg']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "page" },
});
/** @type {__VLS_StyleScopedClasses['page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "site-header" },
});
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({});
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
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "card" },
});
/** @type {__VLS_StyleScopedClasses['card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (__VLS_ctx.changePassword) },
    ...{ class: "form" },
});
/** @type {__VLS_StyleScopedClasses['form']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "password",
    required: true,
});
(__VLS_ctx.form.oldPassword);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "password",
    required: true,
});
(__VLS_ctx.form.newPassword);
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "password",
    required: true,
});
(__VLS_ctx.form.confirmPassword);
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "msg error" },
    });
    /** @type {__VLS_StyleScopedClasses['msg']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    (__VLS_ctx.error);
}
if (__VLS_ctx.success) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "msg success" },
    });
    /** @type {__VLS_StyleScopedClasses['msg']} */ ;
    /** @type {__VLS_StyleScopedClasses['success']} */ ;
    (__VLS_ctx.success);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    type: "submit",
    disabled: (__VLS_ctx.loading),
});
(__VLS_ctx.loading ? '提交中…' : '确认修改');
// @ts-ignore
[changePassword, form, form, form, error, error, success, success, loading, loading,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
