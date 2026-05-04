<script setup lang="ts">
// src/views/ChartAnalysis.vue
// 基础图表分析与 TopN 控制面板 (Chart Analysis Panel)
//
// 对应原 bi/app.py 的 "📊 图表分析" 模式。
//
// 功能：
//   1. 图表类型选择（bar/line/scatter/pie/heatmap/boxplot/area/histogram/density）
//   2. X 轴、Y 轴、颜色分组列选择
//   3. 排序控制（按 X / 按 Y / 无）
//   4. TopN 过滤（TopN / BottomN / 关闭）
//   5. 调用 fetch_chart_data 后端命令
//   6. 渲染 BiChart 通用图表组件

import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { ElMessage } from 'element-plus'
import { useDataStore } from '../stores/dataStore'
import BiChart from '../components/BiChart.vue'
import { buildChartOption } from '../utils/chartAdapter'
import type { ChartPayload, ChartType } from '../utils/chartAdapter'

const dataStore = useDataStore()

// ─── 图表参数状态 ────────────────────────────────────────────────────────────

const chartType = ref<ChartType>('bar_chart')
const xCol = ref('')
const yCol = ref('')
const colorCol = ref('')
const sortBy = ref<'x' | 'y' | 'none'>('none')
const sortAsc = ref(true)
const topnMode = ref<'off' | 'top' | 'bottom'>('off')
const topnValue = ref(10)
const filterCols = ref<string[]>([])

const loading = ref(false)
const chartPayload = ref<ChartPayload | null>(null)

// ─── 图表类型选项 ────────────────────────────────────────────────────────────

const chartTypeOptions: { label: string; value: ChartType }[] = [
  { label: '柱状图 (Bar)', value: 'bar_chart' },
  { label: '折线图 (Line)', value: 'line_chart' },
  { label: '散点图 (Scatter)', value: 'scatter_chart' },
  { label: '饼图 (Pie)', value: 'pie_chart' },
  { label: '热力图 (Heatmap)', value: 'heatmap_chart' },
  { label: '箱线图 (Boxplot)', value: 'boxplot_chart' },
  { label: '面积图 (Area)', value: 'area_chart' },
  { label: '直方图 (Histogram)', value: 'histogram_chart' },
  { label: '密度图 (Density)', value: 'density_chart' },
]

// ─── 计算图表 option ─────────────────────────────────────────────────────────

const chartOption = computed(() => {
  if (!chartPayload.value || !xCol.value || !yCol.value) return null
  return buildChartOption(chartPayload.value, {
    chartType: chartType.value,
    xCol: xCol.value,
    yCol: yCol.value,
    colorCol: colorCol.value || undefined,
  })
})

// ─── 自动初始化列选择 ────────────────────────────────────────────────────────

watch(
  () => dataStore.columnNames,
  (names) => {
    if (names.length > 0 && !xCol.value) xCol.value = names[0]
    if (names.length > 1 && !yCol.value) yCol.value = names[1]
  },
  { immediate: true }
)

// ─── 生成图表 ────────────────────────────────────────────────────────────────

async function generateChart() {
  if (!dataStore.hasData) {
    ElMessage.warning('请先在"数据加载"页面加载数据')
    return
  }
  if (!xCol.value || !yCol.value) {
    ElMessage.warning('请选择 X 轴和 Y 轴字段')
    return
  }

  // 计算 topN 参数（正数 = TopN，负数 = BottomN，0 = 关闭）
  let topN = 0
  if (topnMode.value === 'top') topN = topnValue.value
  else if (topnMode.value === 'bottom') topN = -topnValue.value

  loading.value = true
  try {
    const result: { ok: boolean; data?: ChartPayload; error?: string } = await invoke(
      'fetch_chart_data',
      {
        xCol: xCol.value,
        yCol: yCol.value,
        colorCol: colorCol.value || null,
        sortBy: sortBy.value,
        sortAsc: sortAsc.value,
        topN,
        filterCols: filterCols.value,
      }
    )
    if (result.ok && result.data) {
      chartPayload.value = result.data
    } else {
      ElMessage.error(result.error ?? '数据获取失败')
    }
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="chart-analysis-view">
    <el-row :gutter="24">
      <!-- 左侧：控制面板 -->
      <el-col :span="7">
        <el-card class="panel-card" header="图表参数">
          <el-form label-width="80px" label-position="left" size="small" :disabled="!dataStore.hasData">

            <el-form-item label="图表类型">
              <el-select v-model="chartType" style="width:100%">
                <el-option
                  v-for="opt in chartTypeOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="X 轴">
              <el-select v-model="xCol" style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="Y 轴">
              <el-select v-model="yCol" style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="颜色分组">
              <el-select v-model="colorCol" placeholder="（可选）" clearable style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="列过滤">
              <el-select v-model="filterCols" multiple placeholder="留空=全部列" clearable style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-divider content-position="left">排序</el-divider>
            <el-form-item label="排序依据">
              <el-radio-group v-model="sortBy">
                <el-radio-button value="none">无</el-radio-button>
                <el-radio-button value="x">按 X</el-radio-button>
                <el-radio-button value="y">按 Y</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="排序方向" v-if="sortBy !== 'none'">
              <el-radio-group v-model="sortAsc">
                <el-radio-button :value="true">升序</el-radio-button>
                <el-radio-button :value="false">降序</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-divider content-position="left">TopN 过滤</el-divider>
            <el-form-item label="模式">
              <el-radio-group v-model="topnMode">
                <el-radio-button value="off">关闭</el-radio-button>
                <el-radio-button value="top">TopN</el-radio-button>
                <el-radio-button value="bottom">BottomN</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="N 值" v-if="topnMode !== 'off'">
              <el-input-number v-model="topnValue" :min="1" :max="10000" />
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                :loading="loading"
                @click="generateChart"
                style="width:100%"
              >
                生成图表
              </el-button>
            </el-form-item>

            <!-- 数据摘要 -->
            <el-text
              v-if="chartPayload"
              size="small"
              type="info"
              style="display:block; margin-top:8px"
            >
              当前数据：{{ chartPayload.total_rows }} 行 × {{ chartPayload.columns.length }} 列
            </el-text>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：图表显示区 -->
      <el-col :span="17">
        <el-card class="panel-card">
          <template #header>
            <span>图表预览</span>
            <el-tag v-if="chartPayload" size="small" style="float:right">
              {{ chartType.replace('_chart', '').toUpperCase() }}
            </el-tag>
          </template>

          <el-empty
            v-if="!dataStore.hasData"
            description="请先在「数据加载」页面上传并加载数据文件"
            :image-size="100"
          />
          <BiChart
            v-else
            :option="chartOption"
            :loading="loading"
            height="520px"
          />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.chart-analysis-view {
  height: 100%;
}

.panel-card {
  background: var(--el-bg-color-overlay);
}
</style>
