<script setup lang="ts">
// src/views/GanttAnalysis.vue
// 甘特图进度与统计分析面板 (Gantt Chart Analysis Panel)
//
// 对应原 bi/pages/01_gantt.py（Streamlit 页面）的功能。
//
// 功能：
//   1. 配置甘特图字段（任务列、开始日期列、结束日期列、颜色分组列、里程碑列）
//   2. 调用 fetch_gantt_data 后端命令获取数据
//   3. 渲染 BiGanttChart 甘特图组件
//   4. 显示任务统计（总任务数、最早开始、最晚结束、平均工期）

import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { ElMessage } from 'element-plus'
import { useDataStore } from '../stores/dataStore'
import BiGanttChart from '../components/BiGanttChart.vue'
import type { ChartPayload } from '../utils/chartAdapter'

const dataStore = useDataStore()

// ─── 甘特图字段配置 ───────────────────────────────────────────────────────────

const taskCol = ref('')
const startCol = ref('')
const endCol = ref('')
const colorCol = ref('')
const milestoneCol = ref('')

const loading = ref(false)
const ganttPayload = ref<ChartPayload | null>(null)

// ─── 统计摘要 ────────────────────────────────────────────────────────────────

const stats = computed(() => {
  if (!ganttPayload.value || ganttPayload.value.rows.length === 0) return null
  const rows = ganttPayload.value.rows
  const starts = rows
    .map((r) => new Date(String(r[startCol.value] ?? '')).getTime())
    .filter((t) => !isNaN(t))
  const ends = rows
    .map((r) => new Date(String(r[endCol.value] ?? '')).getTime())
    .filter((t) => !isNaN(t))

  if (starts.length === 0 || ends.length === 0) return null

  const minStart = new Date(Math.min(...starts))
  const maxEnd = new Date(Math.max(...ends))
  const durations = rows.map((r) => {
    const s = new Date(String(r[startCol.value] ?? '')).getTime()
    const e = new Date(String(r[endCol.value] ?? '')).getTime()
    return isNaN(s) || isNaN(e) ? 0 : (e - s) / (1000 * 60 * 60 * 24)
  })
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length

  return {
    total: rows.length,
    earliestStart: minStart.toLocaleDateString('zh-CN'),
    latestEnd: maxEnd.toLocaleDateString('zh-CN'),
    avgDurationDays: avgDuration.toFixed(1),
  }
})

// ─── 自动推断字段 ────────────────────────────────────────────────────────────

function autoInferFields() {
  const names = dataStore.columnNames
  if (names.length === 0) return

  // 推断任务列：包含 task/name/任务 的列
  taskCol.value =
    names.find((c) => /task|name|任务/i.test(c)) ?? names[0]

  // 推断开始日期列
  startCol.value =
    names.find((c) => /start|begin|开始/i.test(c)) ??
    dataStore.dateColumns[0] ??
    names[Math.min(1, names.length - 1)]

  // 推断结束日期列
  endCol.value =
    names.find((c) => /end|finish|结束/i.test(c)) ??
    dataStore.dateColumns[1] ??
    names[Math.min(2, names.length - 1)]

  // 推断颜色分组列
  colorCol.value =
    names.find((c) => /project|phase|group|分组|项目/i.test(c)) ?? ''

  // 里程碑列不自动推断，由用户选择
  milestoneCol.value = ''
}

// 监听数据变化时自动推断
import { watch } from 'vue'
watch(() => dataStore.columnNames, autoInferFields, { immediate: true })

// ─── 获取甘特图数据 ───────────────────────────────────────────────────────────

async function loadGanttData() {
  if (!dataStore.hasData) {
    ElMessage.warning('请先在"数据加载"页面加载数据')
    return
  }
  if (!taskCol.value || !startCol.value || !endCol.value) {
    ElMessage.warning('请选择任务列、开始日期列和结束日期列')
    return
  }

  loading.value = true
  try {
    const result: { ok: boolean; data?: ChartPayload; error?: string } = await invoke(
      'fetch_gantt_data',
      {
        taskCol: taskCol.value,
        startCol: startCol.value,
        endCol: endCol.value,
        colorCol: colorCol.value || null,
        milestoneCol: milestoneCol.value || null,
      }
    )
    if (result.ok && result.data) {
      ganttPayload.value = result.data
    } else {
      ElMessage.error(result.error ?? '甘特图数据获取失败')
    }
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="gantt-analysis-view">
    <el-row :gutter="24">
      <!-- 左侧：配置面板 -->
      <el-col :span="7">
        <el-card class="panel-card" header="甘特图配置">
          <el-form label-width="90px" label-position="left" size="small" :disabled="!dataStore.hasData">

            <el-form-item label="任务名称列">
              <el-select v-model="taskCol" style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="开始日期列">
              <el-select v-model="startCol" style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="结束日期列">
              <el-select v-model="endCol" style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="颜色分组列">
              <el-select v-model="colorCol" placeholder="（可选）" clearable style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item label="里程碑列">
              <el-select v-model="milestoneCol" placeholder="（可选）" clearable style="width:100%">
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="loading" @click="loadGanttData" style="width:100%">
                生成甘特图
              </el-button>
            </el-form-item>

            <!-- 统计摘要 -->
            <template v-if="stats">
              <el-divider content-position="left">统计摘要</el-divider>
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item label="总任务数">{{ stats.total }}</el-descriptions-item>
                <el-descriptions-item label="最早开始">{{ stats.earliestStart }}</el-descriptions-item>
                <el-descriptions-item label="最晚结束">{{ stats.latestEnd }}</el-descriptions-item>
                <el-descriptions-item label="平均工期">{{ stats.avgDurationDays }} 天</el-descriptions-item>
              </el-descriptions>
            </template>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：甘特图 -->
      <el-col :span="17">
        <el-card class="panel-card" header="甘特图（横道图）">
          <el-empty
            v-if="!dataStore.hasData"
            description="请先在「数据加载」页面上传数据"
            :image-size="100"
          />
          <el-empty
            v-else-if="!ganttPayload"
            description="请配置字段并点击「生成甘特图」"
            :image-size="80"
          />
          <BiGanttChart
            v-else
            :rows="ganttPayload.rows"
            :task-col="taskCol"
            :start-col="startCol"
            :end-col="endCol"
            :color-col="colorCol || undefined"
            :milestone-col="milestoneCol || undefined"
            :loading="loading"
            height="520px"
          />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.gantt-analysis-view {
  height: 100%;
}

.panel-card {
  background: var(--el-bg-color-overlay);
}
</style>
