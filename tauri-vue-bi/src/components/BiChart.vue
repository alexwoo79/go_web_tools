<script setup lang="ts">
// src/components/BiChart.vue
// 封装的通用图表组件 (Generic Chart Component)
//
// 这是对 vue-echarts 的薄封装，提供：
//   • 统一的加载状态显示
//   • 统一的空数据占位符
//   • 响应式容器（ResizeObserver 自动更新图表尺寸）
//   • 通过 `option` prop 接受任意 ECharts 配置对象
//
// Usage:
//   <BiChart :option="chartOption" :loading="isLoading" height="400px" />

import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'

interface Props {
  /** ECharts option 配置对象 */
  option: EChartsOption | null
  /** 是否显示加载动画 */
  loading?: boolean
  /** 图表容器高度（CSS 值，如 "400px" 或 "60vh"） */
  height?: string
  /** 图表主题：'dark' | 'light'（留空使用全局主题） */
  theme?: string
  /** 是否自动调整尺寸（默认 true） */
  autoresize?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  height: '420px',
  theme: 'dark',
  autoresize: true,
})

// 空状态判断：option 为 null 或没有 series
const isEmpty = computed(() => {
  if (!props.option) return true
  const series = (props.option as any).series
  if (!series) return true
  if (Array.isArray(series) && series.length === 0) return true
  return false
})
</script>

<template>
  <div class="bi-chart-wrapper" :style="{ height: props.height }">
    <!-- 加载状态 -->
    <div v-if="props.loading" class="chart-overlay">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <span>数据加载中…</span>
    </div>

    <!-- 空状态 -->
    <el-empty
      v-else-if="isEmpty"
      description="暂无数据，请先配置图表参数"
      :image-size="80"
    />

    <!-- ECharts 图表 -->
    <VChart
      v-else
      :option="props.option!"
      :theme="props.theme"
      :loading="props.loading"
      :autoresize="props.autoresize"
      style="width: 100%; height: 100%;"
    />
  </div>
</template>

<style scoped>
.bi-chart-wrapper {
  position: relative;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color-overlay);
}

.chart-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.4);
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
