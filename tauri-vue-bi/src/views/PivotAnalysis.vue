<script setup lang="ts">
// src/views/PivotAnalysis.vue
// 多维透视表操作面板 (Pivot Table Analysis Panel)
//
// 对应原 bi/app.py 的 "🔢 Pivot分析" 模式。
//
// 功能：
//   1. 选择行分组、列分组、值字段、聚合方式
//   2. 调用 pivot_data 后端命令
//   3. 渲染透视表（el-table）
//   4. 可选：将透视结果转为图表（调用 BiChart）

import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { ElMessage } from 'element-plus'
import { useDataStore } from '../stores/dataStore'
import BiChart from '../components/BiChart.vue'
import type { ChartPayload } from '../utils/chartAdapter'
import type { EChartsOption } from 'echarts'

const dataStore = useDataStore()

// ─── 透视参数状态 ────────────────────────────────────────────────────────────

const rowCols = ref<string[]>([])
const colCols = ref<string[]>([])
const valueCols = ref<string[]>([])
const aggFunc = ref<'sum' | 'mean' | 'count' | 'min' | 'max'>('sum')

const loading = ref(false)
const pivotPayload = ref<ChartPayload | null>(null)

// ─── 可选：将透视表渲染为柱状图 ──────────────────────────────────────────────
const showChart = ref(false)
const pivotChartOption = ref<EChartsOption | null>(null)

// ─── 执行透视 ────────────────────────────────────────────────────────────────

async function runPivot() {
  if (!dataStore.hasData) {
    ElMessage.warning('请先在"数据加载"页面加载数据')
    return
  }
  if (rowCols.value.length === 0) {
    ElMessage.warning('至少选择一个行分组字段')
    return
  }
  if (valueCols.value.length === 0) {
    ElMessage.warning('至少选择一个值字段')
    return
  }

  loading.value = true
  pivotPayload.value = null
  pivotChartOption.value = null
  try {
    const result: { ok: boolean; data?: ChartPayload; error?: string } = await invoke('pivot_data', {
      rows: rowCols.value,
      columns: colCols.value,
      values: valueCols.value,
      agg: aggFunc.value,
    })
    if (result.ok && result.data) {
      pivotPayload.value = result.data
      // 如果开启图表模式，构建 ECharts option
      if (showChart.value && result.data.rows.length > 0) {
        buildPivotChart(result.data)
      }
    } else {
      ElMessage.error(result.error ?? '透视计算失败')
    }
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loading.value = false
  }
}

// 简单地将透视结果的每个值字段作为 bar 系列
function buildPivotChart(payload: ChartPayload) {
  const labelCol = payload.columns[0]?.name ?? ''
  const numCols = payload.columns.slice(1)

  const series = numCols.map((col) => ({
    name: col.name,
    type: 'bar' as const,
    data: payload.rows.map((r) => r[col.name] ?? 0),
  }))

  pivotChartOption.value = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' as const },
    legend: { bottom: 0 },
    xAxis: {
      type: 'category',
      data: payload.rows.map((r) => String(r[labelCol] ?? '')),
      axisLabel: { rotate: 30 },
    },
    yAxis: { type: 'value' },
    series,
  }
}
</script>

<template>
  <div class="pivot-analysis-view">
    <el-row :gutter="24">
      <!-- 左侧：控制面板 -->
      <el-col :span="7">
        <el-card class="panel-card" header="透视参数">
          <el-form label-width="80px" label-position="left" size="small" :disabled="!dataStore.hasData">

            <el-form-item label="行分组">
              <el-select v-model="rowCols" multiple placeholder="选择行分组字段" style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="列分组">
              <el-select v-model="colCols" multiple placeholder="（可选）" clearable style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="值字段">
              <el-select v-model="valueCols" multiple placeholder="选择值字段" style="width:100%">
                <el-option v-for="c in dataStore.numericColumns" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="聚合方式">
              <el-radio-group v-model="aggFunc">
                <el-radio-button value="sum">求和</el-radio-button>
                <el-radio-button value="mean">均值</el-radio-button>
                <el-radio-button value="count">计数</el-radio-button>
                <el-radio-button value="min">最小</el-radio-button>
                <el-radio-button value="max">最大</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="可视化">
              <el-switch v-model="showChart" active-text="开启图表" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="loading" @click="runPivot" style="width:100%">
                执行透视
              </el-button>
            </el-form-item>

            <el-text v-if="pivotPayload" size="small" type="info" style="display:block; margin-top:8px">
              透视结果：{{ pivotPayload.total_rows }} 行 × {{ pivotPayload.columns.length }} 列
            </el-text>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：结果展示 -->
      <el-col :span="17">
        <!-- 透视图表（可选） -->
        <el-card v-if="showChart && pivotChartOption" class="panel-card" header="透视图表" style="margin-bottom:16px">
          <BiChart :option="pivotChartOption" :loading="loading" height="300px" />
        </el-card>

        <!-- 透视表格 -->
        <el-card class="panel-card" :header="`透视表（${pivotPayload?.total_rows ?? 0} 行）`">
          <el-empty
            v-if="!dataStore.hasData"
            description="请先加载数据，再执行透视"
            :image-size="80"
          />
          <el-empty
            v-else-if="!pivotPayload"
            description="请设置透视参数后点击「执行透视」"
            :image-size="80"
          />
          <el-table
            v-else
            :data="pivotPayload.rows"
            border
            stripe
            size="small"
            max-height="60vh"
            style="width:100%"
          >
            <el-table-column
              v-for="col in pivotPayload.columns"
              :key="col.name"
              :prop="col.name"
              :label="col.name"
              min-width="120"
              show-overflow-tooltip
            />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.pivot-analysis-view {
  height: 100%;
}

.panel-card {
  background: var(--el-bg-color-overlay);
}
</style>
