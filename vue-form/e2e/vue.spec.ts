import { test, expect } from '@playwright/test'

test('uses error code mapping instead of raw backend message', async ({ page }) => {
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, username: 'admin', role: 'admin' }),
    })
  })

  await page.route('**/api/admin/analytics/forms/demo/schema', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        formName: 'demo',
        formTitle: 'Demo Analytics',
        tableName: 'form_demo',
        headers: ['month', 'value'],
        fields: [],
        recommendedCharts: ['bar'],
        definitions: [
          {
            kind: 'bar',
            label: '柱状图',
            family: '基础分析',
            fields: [
              { key: 'xCol', label: 'X 轴字段', required: true, type: 'column' },
              { key: 'yCol', label: 'Y 轴字段', required: true, type: 'column' },
            ],
          },
        ],
      }),
    })
  })

  await page.route('**/api/admin/analytics/forms/demo/build', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'VAL_INVALID_CONFIG',
        error: 'RAW_BACKEND_MESSAGE_SHOULD_NOT_BE_ASSERTED',
        details: [
          {
            field: 'xCol',
            code: 'VAL_REQUIRED_FIELD',
            message: 'RAW_FIELD_MESSAGE_SHOULD_NOT_BE_ASSERTED',
          },
        ],
      }),
    })
  })

  await page.goto('/admin/analytics/forms/demo')

  const selects = page.locator('.field-mapper .field-select')
  await selects.nth(0).selectOption('month')
  await selects.nth(1).selectOption('value')

  await page.getByRole('button', { name: '生成图表' }).click()

  await expect(page.locator('.field-error').first()).toContainText(/(必填字段未配置|Required field is missing)/)
  await expect(page.locator('body')).not.toContainText('RAW_FIELD_MESSAGE_SHOULD_NOT_BE_ASSERTED')
  await expect(page.locator('body')).not.toContainText('RAW_BACKEND_MESSAGE_SHOULD_NOT_BE_ASSERTED')
})
