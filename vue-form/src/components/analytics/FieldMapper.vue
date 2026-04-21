<script setup lang="ts">
import { computed } from 'vue'

interface FieldDef {
  key: string
  label: string
  description?: string
  required?: boolean
  multi?: boolean
  type?: string
}

interface ChartDefinition {
  kind: string
  label: string
  family: string
  description?: string
  fields: FieldDef[]
}

const props = defineProps<{
  headers: string[]
  chartKind: string
  definitions: ChartDefinition[]
  modelValue: Record<string, any>
  fieldErrors?: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', config: Record<string, any>): void
}>()

const currentDef = computed(() =>
  props.definitions.find(d => d.kind === props.chartKind)
)

const fields = computed(() =>
  (currentDef.value?.fields ?? []).filter(f => !f.type || f.type === 'column')
)

function onSelect(key: string, valueOrEvent: Event | string) {
  // Support both programmatic calls and DOM events
  let value: any
  if (typeof valueOrEvent === 'string') {
    value = valueOrEvent
  } else {
    const el = valueOrEvent.target as HTMLSelectElement
    if (el.multiple) {
      value = Array.from(el.selectedOptions).map(o => o.value)
    } else {
      value = el.value
    }
  }
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="field-mapper">
    <div v-if="!currentDef" class="no-def">请先选择图表类型</div>
    <template v-else>
      <p class="mapper-hint">将数据列映射到图表字段：</p>
      <div v-for="field in fields" :key="field.key" class="field-row">
        <label class="field-label">
          {{ field.label }}
          <span v-if="field.required" class="required">*</span>
          <span v-if="field.description" class="field-desc">— {{ field.description }}</span>
        </label>
        <select
          class="field-select"
          :class="{ invalid: !!fieldErrors?.[field.key] }"
          :multiple="field.multi"
          :value="modelValue[field.key] ?? (field.multi ? [] : '')"
          @change="onSelect(field.key, $event)"
        >
          <option v-if="!field.multi" value="">（不使用）</option>
          <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
        </select>
        <div v-if="fieldErrors?.[field.key]" class="field-error">{{ fieldErrors[field.key] }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.field-mapper { width: 100%; }

.no-def {
  color: #aaa;
  font-size: 14px;
  padding: 16px 0;
}

.mapper-hint {
  font-size: 13px;
  color: #666;
  margin: 0 0 12px;
}

.field-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 10px;
}

.field-label {
  min-width: 140px;
  font-size: 14px;
  color: #333;
  flex-shrink: 0;
}

.required {
  color: #e53e3e;
  margin-left: 2px;
}

.field-desc {
  color: #888;
  font-size: 12px;
}

.field-select {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
  min-width: 0;
}
.field-select:focus {
  outline: none;
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
}
.field-select.invalid {
  border-color: #d93025;
  box-shadow: 0 0 0 2px rgba(217, 48, 37, 0.1);
}
.field-error {
  margin-left: 152px;
  color: #d93025;
  font-size: 12px;
}
</style>
