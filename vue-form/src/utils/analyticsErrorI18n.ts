export interface ValidationIssue {
  field?: string
  code?: string
  message?: string
}

const MESSAGES: Record<string, { zh: string; en: string }> = {
  ERR_REQUIRED_FIELD: {
    zh: '必填字段未配置',
    en: 'Required field is missing',
  },
  ERR_UNSUPPORTED_CHART: {
    zh: '不支持的图表类型',
    en: 'Unsupported chart type',
  },
}

function locale(): 'zh' | 'en' {
  if (typeof navigator === 'undefined') return 'zh'
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

export function localizeValidationIssue(
  issue: ValidationIssue,
  fallbackMessage = '配置有误',
): string {
  const code = issue.code ?? ''
  const l = locale()
  const mapped = MESSAGES[code]?.[l]
  return mapped || issue.message || fallbackMessage
}
