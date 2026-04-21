<script setup lang="ts">
import { ref } from 'vue'

export interface UploadedDataset {
  id: string
  name: string
  headers: string[]
  preview: string[][]
  rowCount: number
}

const emit = defineEmits<{
  (e: 'uploaded', payload: UploadedDataset): void
}>()

const dragging = ref(false)
const uploading = ref(false)
const error = ref('')
const uploaded = ref<UploadedDataset | null>(null)

async function handleFile(file: File) {
  const allowed = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  const extOk = /\.(csv|xlsx)$/i.test(file.name)
  if (!allowed.includes(file.type) && !extOk) {
    error.value = '仅支持 CSV 或 XLSX 文件'
    return
  }
  error.value = ''
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/admin/analytics/datasets/upload', {
      method: 'POST',
      credentials: 'include',
      body: fd
    })
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(msg || `上传失败 (${res.status})`)
    }
    const data = await res.json()
    uploaded.value = data
    emit('uploaded', data)
  } catch (e: any) {
    error.value = e.message ?? '上传出错'
  } finally {
    uploading.value = false
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

function onInputChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

function reset() {
  uploaded.value = null
  error.value = ''
}

defineExpose({ reset })
</script>

<template>
  <div class="dataset-upload">
    <div
      v-if="!uploaded"
      class="drop-zone"
      :class="{ dragging, uploading }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
      @click="($refs.fileInput as HTMLInputElement).click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".csv,.xlsx"
        style="display:none"
        @change="onInputChange"
      />
      <span v-if="uploading">上传中…</span>
      <span v-else>点击或拖拽 CSV / XLSX 文件到此处</span>
    </div>

    <div v-if="error" class="upload-error">{{ error }}</div>

    <div v-if="uploaded" class="upload-result">
      <div class="upload-result-header">
        <span>✓ {{ uploaded.name }} ({{ uploaded.rowCount }} 行，{{ uploaded.headers.length }} 列)</span>
        <button class="btn-text" @click="reset">重新上传</button>
      </div>
      <div class="preview-table-wrap">
        <table class="preview-table">
          <thead>
            <tr>
              <th v-for="h in uploaded.headers" :key="h">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in uploaded.preview" :key="i">
              <td v-for="(cell, j) in row" :key="j">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dataset-upload { width: 100%; }

.drop-zone {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  color: #888;
  transition: border-color 0.2s, background 0.2s;
  user-select: none;
}
.drop-zone:hover, .drop-zone.dragging {
  border-color: #1677ff;
  background: #f0f5ff;
  color: #1677ff;
}
.drop-zone.uploading {
  cursor: default;
  opacity: 0.7;
}

.upload-error {
  margin-top: 8px;
  color: #e53e3e;
  font-size: 13px;
}

.upload-result {
  border: 1px solid #d9f0d9;
  border-radius: 8px;
  background: #f6ffed;
  padding: 12px 16px;
}
.upload-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  color: #389e0d;
}
.btn-text {
  background: none;
  border: none;
  color: #1677ff;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}
.btn-text:hover { text-decoration: underline; }

.preview-table-wrap {
  overflow-x: auto;
  max-height: 180px;
  overflow-y: auto;
}
.preview-table {
  border-collapse: collapse;
  font-size: 12px;
  min-width: 100%;
}
.preview-table th, .preview-table td {
  border: 1px solid #d9d9d9;
  padding: 4px 8px;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-table th {
  background: #fafafa;
  font-weight: 600;
}
</style>
