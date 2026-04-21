<script setup lang="ts">
import { computed } from 'vue'

interface ChartDefinition {
  kind: string
  label: string
  family: string
  description?: string
  hint?: string
  fields?: Array<{
    key: string
    label: string
    description?: string
    type?: string
    options?: string[]
  }>
}

const props = defineProps<{
  definitions: ChartDefinition[]
  modelValue: string
  title: string
  config: Record<string, any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', kind: string): void
  (e: 'update:title', title: string): void
  (e: 'update:config', config: Record<string, any>): void
}>()

const families = computed(() => {
  const map = new Map<string, ChartDefinition[]>()
  for (const d of props.definitions) {
    if (!map.has(d.family)) map.set(d.family, [])
    map.get(d.family)!.push(d)
  }
  return map
})

const currentDef = computed(() => props.definitions.find(d => d.kind === props.modelValue))

const optionFields = computed(() =>
  (currentDef.value?.fields ?? []).filter(f => f.type && f.type !== 'column')
)

function updateConfig(key: string, value: any) {
  emit('update:config', { ...props.config, [key]: value })
}
</script>

<template>
  <div class="chart-options-panel">
    <div class="families">
      <div v-for="[family, defs] in families" :key="family" class="family-group">
        <div class="family-label">{{ family }}</div>
        <div class="kinds-row">
          <button
            v-for="def in defs"
            :key="def.kind"
            class="kind-btn"
            :class="{ active: modelValue === def.kind }"
            :title="def.description ?? def.hint ?? def.label"
            @click="emit('update:modelValue', def.kind)"
          >
            {{ def.label }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="currentDef?.hint" class="kind-hint">{{ currentDef.hint }}</div>

    <div class="title-row">
      <label class="opt-label">图表标题</label>
      <input
        class="title-input"
        type="text"
        :value="title"
        placeholder="（可选）"
        @input="emit('update:title', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div v-if="optionFields.length > 0" class="option-grid">
      <div v-for="field in optionFields" :key="field.key" class="option-row">
        <label class="opt-label">{{ field.label }}</label>

        <select
          v-if="field.type === 'select'"
          class="title-input"
          :value="config[field.key] ?? ''"
          @change="updateConfig(field.key, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">（默认）</option>
          <option v-for="opt in (field.options ?? [])" :key="opt" :value="opt">{{ opt }}</option>
        </select>

        <label v-else-if="field.type === 'boolean'" class="bool-row">
          <input
            type="checkbox"
            :checked="!!config[field.key]"
            @change="updateConfig(field.key, ($event.target as HTMLInputElement).checked)"
          />
          <span>启用</span>
        </label>

        <input
          v-else-if="field.type === 'number'"
          class="title-input"
          type="number"
          :value="config[field.key] ?? ''"
          @input="updateConfig(field.key, Number(($event.target as HTMLInputElement).value || 0))"
        />

        <input
          v-else
          class="title-input"
          type="text"
          :value="config[field.key] ?? ''"
          @input="updateConfig(field.key, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-options-panel { width: 100%; }

.families { display: flex; flex-direction: column; gap: 12px; }

.family-group { }

.family-label {
  font-size: 12px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.kinds-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kind-btn {
  padding: 5px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 20px;
  background: #fff;
  color: #555;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.kind-btn:hover { border-color: #1677ff; color: #1677ff; }
.kind-btn.active {
  border-color: #1677ff;
  background: #1677ff;
  color: #fff;
}

.kind-hint {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 6px;
  font-size: 13px;
  color: #74531f;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.option-grid {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.option-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.bool-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #333;
  font-size: 14px;
}
.opt-label {
  min-width: 70px;
  font-size: 14px;
  color: #333;
  flex-shrink: 0;
}
.title-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
}
.title-input:focus {
  outline: none;
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
}
</style>
