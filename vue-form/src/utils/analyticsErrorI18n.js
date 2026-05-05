const MESSAGES = {
    TRN_INVALID_JSON: {
        zh: '请求格式错误，请检查输入',
        en: 'Invalid request payload format',
    },
    BIZ_NOT_FOUND: {
        zh: '资源不存在或不可访问',
        en: 'Resource not found or inaccessible',
    },
    BIZ_FORBIDDEN: {
        zh: '没有权限执行该操作',
        en: 'Permission denied for this operation',
    },
    VAL_INVALID_CONFIG: {
        zh: '配置校验失败，请检查字段映射',
        en: 'Configuration validation failed. Please check field mappings.',
    },
    VAL_REQUIRED_FIELD: {
        zh: '必填字段未配置',
        en: 'Required field is missing',
    },
    VAL_UNSUPPORTED_CHART: {
        zh: '不支持的图表类型',
        en: 'Unsupported chart type',
    },
    // Backward-compatible aliases.
    ERR_REQUIRED_FIELD: {
        zh: '必填字段未配置',
        en: 'Required field is missing',
    },
    ERR_UNSUPPORTED_CHART: {
        zh: '不支持的图表类型',
        en: 'Unsupported chart type',
    },
};
function locale() {
    if (typeof navigator === 'undefined')
        return 'zh';
    return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'zh';
}
export function localizeValidationIssue(issue, fallbackMessage = '配置有误') {
    return localizeErrorCode(issue.code, issue.message || fallbackMessage);
}
export function localizeErrorCode(code, fallbackMessage = '配置有误') {
    const normalizedCode = code ?? '';
    const l = locale();
    const mapped = MESSAGES[normalizedCode]?.[l];
    return mapped || fallbackMessage;
}
