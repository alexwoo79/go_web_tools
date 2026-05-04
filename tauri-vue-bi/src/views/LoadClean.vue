<script setup lang="ts">
// src/views/LoadClean.vue
// 数据加载与清洗面板 (Data Loading & Cleaning Panel)
//
// 对应原 bi/app.py 的 "⬇️ 清洗导出" 模式。
//
// 功能：
//   1. 文件选择（CSV / Excel）+ 加载参数（跳行、表头行）
//   2. 数据预览（前 100 行，el-table）
//   3. 清洗操作面板（依次执行）：
//      a. 填充缺失值      (fillna)
//      b. 去重            (dedup)
//      c. 去除前后空格    (trim)
//      d. 查找替换        (find & replace)
//      e. 类型转换        (type cast)
//   4. 预览清洗结果 + 导出（通过 Tauri 文件系统）

import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { ElMessage } from 'element-plus'
import { useDataStore } from '../stores/dataStore'
import type { ChartPayload } from '../utils/chartAdapter'

const dataStore = useDataStore()

// ─── 状态 ─────────────────────────────────────────────────────────────────────

const filePath = ref('')
const skipHead = ref(0)
const skipTail = ref(0)
const headerRow = ref(-1)
const loading = ref(false)

// 清洗参数
const fillnaCol = ref('')
const fillnaVal = ref('')
const dedupCols = ref<string[]>([])
const trimCols = ref<string[]>([])
const frCols = ref<string[]>([])
const findText = ref('')
const replaceText = ref('')
const useRegex = ref(false)
const typeCol = ref('')
const typeTarget = ref<'int' | 'float' | 'str' | 'datetime' | 'date'>('str')

// 清洗后预览数据
const cleanedPayload = ref<ChartPayload | null>(null)
const cleanLoading = ref(false)

// ─── 计算属性 ─────────────────────────────────────────────────────────────────

// 用于 el-table 的列定义（来自已加载的 payload）
const tableColumns = computed(() => dataStore.columns)

// 预览的行（优先显示清洗后，否则显示原始）
const previewRows = computed(
  () => (cleanedPayload.value ?? dataStore.payload)?.rows ?? []
)

// ─── 文件选择 ────────────────────────────────────────────────────────────────

async function selectFile() {
  const selected = await openDialog({
    multiple: false,
    filters: [{ name: '数据文件', extensions: ['csv', 'xlsx', 'xls', 'xlsm'] }],
  })
  if (selected && typeof selected === 'string') {
    filePath.value = selected
  }
}

// ─── 加载文件 ────────────────────────────────────────────────────────────────

async function loadFile() {
  if (!filePath.value) {
    ElMessage.warning('请先选择文件')
    return
  }
  loading.value = true
  cleanedPayload.value = null
  try {
    const result: { ok: boolean; data?: ChartPayload; error?: string } = await invoke('load_file', {
      path: filePath.value,
      skipHead: skipHead.value,
      skipTail: skipTail.value,
      headerRow: headerRow.value,
    })
    if (result.ok && result.data) {
      dataStore.setPayload(result.data)
      // 重置清洗参数
      fillnaCol.value = ''
      dedupCols.value = []
      trimCols.value = []
      frCols.value = []
      typeCol.value = ''
      ElMessage.success(`数据加载成功，共 ${result.data.total_rows} 行`)
    } else {
      ElMessage.error(result.error ?? '加载失败')
    }
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loading.value = false
  }
}

// ─── 应用清洗 ────────────────────────────────────────────────────────────────

async function applyClean() {
  if (!dataStore.hasData) {
    ElMessage.warning('请先加载数据')
    return
  }
  cleanLoading.value = true
  try {
    const result: { ok: boolean; data?: ChartPayload; error?: string } = await invoke('clean_data', {
      fillnaCol: fillnaCol.value,
      fillnaVal: fillnaVal.value,
      dedupCols: dedupCols.value,
      trimCols: trimCols.value,
      frCols: frCols.value,
      findText: findText.value,
      replaceText: replaceText.value,
      useRegex: useRegex.value,
      typeCol: typeCol.value,
      typeTarget: typeTarget.value,
    })
    if (result.ok && result.data) {
      cleanedPayload.value = result.data
      ElMessage.success(`清洗完成，共 ${result.data.total_rows} 行`)
    } else {
      ElMessage.error(result.error ?? '清洗失败')
    }
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    cleanLoading.value = false
  }
}

// ─── 重置清洗 ────────────────────────────────────────────────────────────────

function resetClean() {
  cleanedPayload.value = null
  fillnaCol.value = ''
  fillnaVal.value = ''
  dedupCols.value = []
  trimCols.value = []
  frCols.value = []
  findText.value = ''
  replaceText.value = ''
  useRegex.value = false
  typeCol.value = ''
  typeTarget.value = 'str'
}
</script>

<template>
  <div class="load-clean-view">
    <el-row :gutter="24">
      <!-- 左侧：加载 + 清洗参数面板 -->
      <el-col :span="8">
        <!-- ① 数据加载 -->
        <el-card class="panel-card" header="① 数据加载">
          <el-form label-width="90px" label-position="left" size="small">
            <el-form-item label="选择文件">
              <el-input v-model="filePath" placeholder="点击右侧按钮选择文件" readonly>
                <template #append>
                  <el-button @click="selectFile">浏览…</el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item label="跳过开头行">
              <el-input-number v-model="skipHead" :min="0" :max="9999" />
            </el-form-item>
            <el-form-item label="跳过末尾行">
              <el-input-number v-model="skipTail" :min="0" :max="9999" />
            </el-form-item>
            <el-form-item label="表头行索引">
              <el-input-number v-model="headerRow" :min="-1" :max="9999" />
              <el-text class="hint" size="small">-1 = 首行为表头</el-text>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="loadFile" style="width:100%">
                加载数据
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- ② 清洗操作 -->
        <el-card class="panel-card" style="margin-top:16px;" header="② 数据清洗">
          <el-form label-width="90px" label-position="left" size="small" :disabled="!dataStore.hasData">

            <el-divider content-position="left">填充缺失值</el-divider>
            <el-form-item label="目标列">
              <el-select v-model="fillnaCol" placeholder="选择列" clearable>
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
            <el-form-item label="填充值">
              <el-input v-model="fillnaVal" placeholder="输入填充值" />
            </el-form-item>

            <el-divider content-position="left">去重</el-divider>
            <el-form-item label="去重列">
              <el-select v-model="dedupCols" multiple placeholder="空 = 全列去重" clearable>
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-divider content-position="left">去除前后空格</el-divider>
            <el-form-item label="目标列">
              <el-select v-model="trimCols" multiple placeholder="选择字符串列" clearable>
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>

            <el-divider content-position="left">查找替换</el-divider>
            <el-form-item label="目标列">
              <el-select v-model="frCols" multiple placeholder="选择列" clearable>
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
            <el-form-item label="查找">
              <el-input v-model="findText" placeholder="查找文本" />
            </el-form-item>
            <el-form-item label="替换为">
              <el-input v-model="replaceText" placeholder="替换文本" />
            </el-form-item>
            <el-form-item label="正则表达式">
              <el-switch v-model="useRegex" />
            </el-form-item>

            <el-divider content-position="left">类型转换</el-divider>
            <el-form-item label="目标列">
              <el-select v-model="typeCol" placeholder="选择列" clearable>
                <el-option v-for="c in dataStore.columnNames" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
            <el-form-item label="目标类型">
              <el-select v-model="typeTarget">
                <el-option label="整数 (int)" value="int" />
                <el-option label="浮点 (float)" value="float" />
                <el-option label="字符串 (str)" value="str" />
                <el-option label="日期时间 (datetime)" value="datetime" />
                <el-option label="日期 (date)" value="date" />
              </el-select>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="cleanLoading" @click="applyClean" style="width:60%">
                应用清洗
              </el-button>
              <el-button @click="resetClean" style="width:35%; margin-left:5%">
                重置
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：数据预览表格 -->
      <el-col :span="16">
        <el-card class="panel-card" :header="`数据预览（${previewRows.length} 行${cleanedPayload ? ' — 已清洗' : ''}）`">
          <el-empty v-if="previewRows.length === 0" description="暂无数据，请先加载文件" :image-size="80" />
          <el-table
            v-else
            :data="previewRows"
            border
            stripe
            size="small"
            max-height="65vh"
            style="width: 100%"
          >
            <el-table-column
              v-for="col in tableColumns"
              :key="col.name"
              :prop="col.name"
              :label="col.name"
              min-width="120"
              show-overflow-tooltip
            >
              <template #header>
                <div class="col-header">
                  <span>{{ col.name }}</span>
                  <el-tag size="small" type="info">{{ col.dtype }}</el-tag>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.load-clean-view {
  height: 100%;
}

.panel-card {
  background: var(--el-bg-color-overlay);
}

.hint {
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  font-size: 11px;
}

.col-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
