// src/stores/dataStore.ts
// Pinia 状态管理 — 全局数据状态 (Global Data State)
//
// 存储当前加载的 DataFrame 信息，在各个 View 之间共享。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ColumnInfo, ChartPayload } from '../utils/chartAdapter'

export const useDataStore = defineStore('data', () => {
  // 当前加载的数据预览（前 100 行）
  const payload = ref<ChartPayload | null>(null)

  // 是否已加载数据
  const hasData = computed(() => payload.value !== null && payload.value.total_rows > 0)

  // 所有列信息
  const columns = computed<ColumnInfo[]>(() => payload.value?.columns ?? [])

  // 所有列名
  const columnNames = computed<string[]>(() => columns.value.map((c) => c.name))

  // 数值列（用于图表 Y 轴等）
  const numericColumns = computed<string[]>(() =>
    columns.value
      .filter((c) => ['Int8','Int16','Int32','Int64','UInt8','UInt16','UInt32','UInt64','Float32','Float64'].some(t => c.dtype.includes(t)))
      .map((c) => c.name)
  )

  // 字符串/分类列
  const categoricalColumns = computed<string[]>(() =>
    columns.value
      .filter((c) => c.dtype.includes('Str') || c.dtype.includes('Categorical') || c.dtype.includes('Boolean'))
      .map((c) => c.name)
  )

  // 日期/时间列
  const dateColumns = computed<string[]>(() =>
    columns.value
      .filter((c) => c.dtype.includes('Date') || c.dtype.includes('Time') || c.dtype.includes('Duration'))
      .map((c) => c.name)
  )

  function setPayload(p: ChartPayload | null) {
    payload.value = p
  }

  function clear() {
    payload.value = null
  }

  return {
    payload,
    hasData,
    columns,
    columnNames,
    numericColumns,
    categoricalColumns,
    dateColumns,
    setPayload,
    clear,
  }
})
