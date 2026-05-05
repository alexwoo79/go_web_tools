import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();
async function login() {
    error.value = '';
    loading.value = true;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.value, password: password.value }),
        });
        if (res.ok) {
            // 从 /api/me 获取用户信息并同步到 store，再跳转
            await auth.fetchMe();
            router.push('/portal');
        }
        else {
            const data = await res.json();
            error.value = data.error || '登录失败';
        }
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
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['register-link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "login-page" },
});
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "login-card" },
});
/** @type {__VLS_StyleScopedClasses['login-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (__VLS_ctx.login) },
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "field" },
});
/** @type {__VLS_StyleScopedClasses['field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    value: (__VLS_ctx.username),
    type: "text",
    placeholder: "请输入用户名",
    autocomplete: "username",
    required: true,
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "field" },
});
/** @type {__VLS_StyleScopedClasses['field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "password",
    placeholder: "请输入密码",
    autocomplete: "current-password",
    required: true,
});
(__VLS_ctx.password);
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "error-msg" },
    });
    /** @type {__VLS_StyleScopedClasses['error-msg']} */ ;
    (__VLS_ctx.error);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    type: "submit",
    disabled: (__VLS_ctx.loading),
});
(__VLS_ctx.loading ? '登录中…' : '登录');
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "register-link" },
});
/** @type {__VLS_StyleScopedClasses['register-link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.router.push('/register');
            // @ts-ignore
            [login, username, password, error, error, loading, loading, router,];
        } },
    href: "/register",
});
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
