<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  chartRef?: {
    exportPNG?: () => void
    exportSVG?: () => void
    exportHTML?: () => void
    exportJSON?: () => void
    enterFullscreen?: () => void
  }
  title?: string
}>()

const copyMsg = ref('')

function doExportPNG() {
  props.chartRef?.exportPNG?.()
}

function doExportSVG() {
  props.chartRef?.exportSVG?.()
}

function doExportHTML() {
  props.chartRef?.exportHTML?.()
}

async function doCopyJSON() {
  props.chartRef?.exportJSON?.()
  copyMsg.value = '已复制'
  setTimeout(() => { copyMsg.value = '' }, 1500)
}

function doFullscreen() {
  props.chartRef?.enterFullscreen?.()
}
</script>

<template>
  <div class="chart-toolbar-wrap">
    <div class="toolbar">
      <span v-if="title" class="toolbar-title">{{ title }}</span>
      <div class="toolbar-actions">
        <button class="tb-btn" title="导出 PNG" @click="doExportPNG">
          <span>↓ PNG</span>
        </button>
        <button class="tb-btn" title="导出 SVG" @click="doExportSVG">
          <span>↓ SVG</span>
        </button>
        <button class="tb-btn" title="导出 HTML" @click="doExportHTML">
          <span>↓ HTML</span>
        </button>
        <button class="tb-btn" title="复制图表配置 JSON" @click="doCopyJSON">
          <span>{{ copyMsg || '复制 JSON' }}</span>
        </button>
        <button class="tb-btn" title="全屏" @click="doFullscreen">
          <span>⛶ 全屏</span>
        </button>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.chart-toolbar-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1;
  min-height: 0;
}
.chart-toolbar-wrap > :last-child {
  flex: 1;
  min-height: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: #fafafa;
  border-bottom: 1px solid #eee;
  border-radius: 8px 8px 0 0;
  gap: 8px;
}
.toolbar-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toolbar-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.tb-btn {
  padding: 4px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 5px;
  background: #fff;
  color: #555;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.tb-btn:hover {
  background: #f0f4ff;
  border-color: #1677ff;
  color: #1677ff;
}
</style>
