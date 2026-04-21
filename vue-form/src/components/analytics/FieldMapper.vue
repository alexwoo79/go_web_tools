<script setup lang="ts">
import { computed, watch } from 'vue'

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
  contextConfig?: Record<string, any>
  fieldErrors?: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', config: Record<string, any>): void
}>()

const currentDef = computed(() =>
  props.definitions.find(d => d.kind === props.chartKind)
)

const yCountEnabledKinds = new Set(['bar', 'line', 'area', 'stack_bar', 'stack_area', 'radar'])

function supportsYCount(kind: string) {
  return yCountEnabledKinds.has(kind)
}

function normalizeYCount(raw: any): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(8, Math.max(1, Math.floor(parsed)))
}

function inferYCountFromMapping(): number {
  const cfg = props.modelValue ?? {}
  const hasY2 = typeof cfg.y2Col === 'string' && cfg.y2Col.trim() !== ''
  const hasY3 = typeof cfg.y3Col === 'string' && cfg.y3Col.trim() !== ''
  const extras = Array.isArray(cfg.yExtraCols)
    ? cfg.yExtraCols.filter(v => typeof v === 'string' && v.trim() !== '')
    : []
  if (extras.length > 0) return Math.min(8, 3 + extras.length)
  if (hasY3) return 3
  if (hasY2) return 2
  return 1
}

const yMetricCount = computed(() => {
  if (!supportsYCount(props.chartKind)) return 1
  const fromOption = props.contextConfig?.yMetricCount
  if (fromOption !== undefined && fromOption !== null && fromOption !== '') {
    return normalizeYCount(fromOption)
  }
  return inferYCountFromMapping()
})

const fields = computed(() => {
  const base = (currentDef.value?.fields ?? []).filter(f => !f.type || f.type === 'column')
  return base.filter(f => {
    if (!supportsYCount(props.chartKind)) return true
    if (f.key === 'y2Col') return yMetricCount.value >= 2
    if (f.key === 'y3Col') return yMetricCount.value >= 3
    if (f.key === 'yExtraCols') return yMetricCount.value >= 4
    return true
  })
})

const extraYCount = computed(() => Math.max(0, yMetricCount.value - 3))

const extraYSlots = computed(() => {
  if (extraYCount.value <= 0) return []
  const raw = Array.isArray(props.modelValue?.yExtraCols) ? props.modelValue.yExtraCols : []
  return Array.from({ length: extraYCount.value }, (_, idx) => ({
    index: idx,
    key: `yExtraCols-${idx}`,
    label: `Y${idx + 4} 字段`,
    value: typeof raw[idx] === 'string' ? raw[idx] : ''
  }))
})

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

function onSelectExtra(index: number, valueOrEvent: Event | string) {
  let value = ''
  if (typeof valueOrEvent === 'string') {
    value = valueOrEvent
  } else {
    value = (valueOrEvent.target as HTMLSelectElement).value
  }

  const existing = Array.isArray(props.modelValue?.yExtraCols) ? [...props.modelValue.yExtraCols] : []
  existing[index] = value
  emit('update:modelValue', { ...props.modelValue, yExtraCols: existing.slice(0, extraYCount.value) })
}

watch(yMetricCount, (count) => {
  if (!supportsYCount(props.chartKind)) return
  const next = { ...props.modelValue }
  let changed = false

  if (count < 2 && next.y2Col) {
    next.y2Col = ''
    changed = true
  }
  if (count < 3 && next.y3Col) {
    next.y3Col = ''
    changed = true
  }

  const existing = Array.isArray(next.yExtraCols) ? next.yExtraCols : []
  const trimmed = existing.slice(0, Math.max(0, count - 3))
  if (trimmed.length !== existing.length) {
    next.yExtraCols = trimmed
    changed = true
  }

  if (changed) {
    emit('update:modelValue', next)
  }
})
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
        <template v-if="field.key !== 'yExtraCols'">
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
        </template>
        <template v-else>
          <div class="extra-y-list">
            <div v-for="slot in extraYSlots" :key="slot.key" class="extra-y-row">
              <label class="extra-y-label">{{ slot.label }}</label>
              <select
                class="field-select"
                :class="{ invalid: !!fieldErrors?.[field.key] }"
                :value="slot.value"
                @change="onSelectExtra(slot.index, $event)"
              >
                <option value="">（不使用）</option>
                <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
          <div v-if="fieldErrors?.[field.key]" class="field-error">{{ fieldErrors[field.key] }}</div>
        </template>
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
.extra-y-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.extra-y-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.extra-y-label {
  width: 72px;
  color: #666;
  font-size: 13px;
  flex-shrink: 0;
}
</style>
