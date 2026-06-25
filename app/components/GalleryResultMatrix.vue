<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import type { ResultFile, ResultFilterGroup } from '~/types/gallery'
import {
  isAudioResult,
  isImageResult,
  isVideoResult,
  paramValueKey,
  paramValueLabel,
  resultKindLabel,
  resultUrl,
  visibleInputParams
} from '~/utils/gallery'

const props = defineProps<{
  results: ResultFile[]
}>()

const emit = defineEmits<{
  preview: [result: ResultFile]
  download: [id: string]
}>()

const { rowActionSize } = useUiPreferences()
const hiddenValueKeys = ref<string[]>([])
const rowAxisKey = ref('')
const columnAxisKey = ref('')

const visibleResults = computed(() => props.results.filter((result) => {
  const params = visibleInputParams(result.inputParams ?? {})
  return !params.some(([key, value]) => hiddenValueKeys.value.includes(paramValueKey(key, value)))
}))

const filterGroups = computed<ResultFilterGroup[]>(() => {
  const groups = new Map<string, Map<string, { value: unknown; count: number }>>()
  for (const result of props.results) {
    for (const [key, value] of visibleInputParams(result.inputParams ?? {})) {
      const valueKey = paramValueKey(key, value)
      const values = groups.get(key) ?? new Map<string, { value: unknown; count: number }>()
      const current = values.get(valueKey) ?? { value, count: 0 }
      current.count++
      values.set(valueKey, current)
      groups.set(key, values)
    }
  }

  return Array.from(groups.entries())
    .map(([key, values]) => ({
      key,
      label: key.split('.').pop() || key,
      values: Array.from(values.entries()).map(([valueKey, item]) => ({
        valueKey,
        label: paramValueLabel(item.value),
        count: item.count,
        hidden: hiddenValueKeys.value.includes(valueKey)
      }))
    }))
    .filter(group => group.values.length > 1)
})

const selectedRowGroup = computed(() => findGroup(rowAxisKey.value) || filterGroups.value[0])
const selectedColumnGroup = computed(() => findGroup(columnAxisKey.value) || filterGroups.value.find(group => group.key !== selectedRowGroup.value?.key))
const visibleRows = computed(() => selectedRowGroup.value?.values.filter(value => !value.hidden) ?? [])
const visibleColumns = computed(() => selectedColumnGroup.value?.values.filter(value => !value.hidden) ?? [])
const matrixRows = computed(() => visibleRows.value.length
  ? visibleRows.value
  : [{ valueKey: 'all', label: '全部结果', count: visibleResults.value.length, hidden: false }]
)
const matrixColumns = computed(() => visibleColumns.value.length
  ? visibleColumns.value
  : [{ valueKey: 'all', label: '全部结果', count: visibleResults.value.length, hidden: false }]
)

watch(filterGroups, (groups) => {
  if (!groups.length) {
    rowAxisKey.value = ''
    columnAxisKey.value = ''
    return
  }
  if (!groups.some(group => group.key === rowAxisKey.value)) rowAxisKey.value = groups[0]?.key || ''
  if (!groups.some(group => group.key === columnAxisKey.value) || columnAxisKey.value === rowAxisKey.value) {
    columnAxisKey.value = groups.find(group => group.key !== rowAxisKey.value)?.key || ''
  }
}, { immediate: true })

function findGroup(key: string) {
  return filterGroups.value.find(group => group.key === key)
}

function hiddenCount(group: ResultFilterGroup | undefined) {
  return group?.values.filter(value => value.hidden).length ?? 0
}

function visibleValueKeys(group: ResultFilterGroup | undefined) {
  return group?.values.filter(value => !value.hidden).map(value => value.valueKey) ?? []
}

function setVisibleValueKeys(group: ResultFilterGroup | undefined, selectedKeys: string[]) {
  if (!group) return
  const groupKeys = new Set(group.values.map(value => value.valueKey))
  const nextHiddenKeys = hiddenValueKeys.value.filter(valueKey => !groupKeys.has(valueKey))
  const selected = new Set(selectedKeys)
  for (const value of group.values) {
    if (!selected.has(value.valueKey)) nextHiddenKeys.push(value.valueKey)
  }
  hiddenValueKeys.value = nextHiddenKeys
}

function setAxis(axis: 'row' | 'column', key: string) {
  if (axis === 'row') {
    rowAxisKey.value = key
    if (columnAxisKey.value === key) columnAxisKey.value = filterGroups.value.find(group => group.key !== key)?.key || ''
    return
  }
  columnAxisKey.value = key
  if (rowAxisKey.value === key) rowAxisKey.value = filterGroups.value.find(group => group.key !== key)?.key || ''
}

function restorePreset() {
  hiddenValueKeys.value = []
}

function cellResults(rowValueKey: string, columnValueKey: string) {
  const rowGroup = selectedRowGroup.value
  const columnGroup = selectedColumnGroup.value
  return visibleResults.value.filter((result) => {
    const rowMatched = !rowGroup || rowValueKey === 'all' || paramValueKey(rowGroup.key, result.inputParams?.[rowGroup.key]) === rowValueKey
    const columnMatched = !columnGroup || columnValueKey === 'all' || paramValueKey(columnGroup.key, result.inputParams?.[columnGroup.key]) === columnValueKey
    return rowMatched && columnMatched
  })
}
</script>

<template>
  <div class="fm-stack">
    <div v-if="filterGroups.length" class="matrix-config fm-card">
      <div class="matrix-config-main">
        <ElPopover placement="bottom-start" trigger="click" :width="320" popper-class="fm-filter-popper">
          <template #reference>
            <ElButton class="matrix-config-button" :size="rowActionSize">
              聚合参数
              <span
                class="filter-count"
                :title="selectedColumnGroup?.key || selectedColumnGroup?.label || '全部结果'"
              >
                {{ selectedColumnGroup?.label || '全部结果' }}
              </span>
            </ElButton>
          </template>
          <div class="filter-menu">
            <div class="filter-menu-head">
              <strong>按以下参数聚合</strong>
              <span>该参数会成为矩阵列。</span>
            </div>
            <ElSelect
              :model-value="selectedColumnGroup?.key || ''"
              filterable
              style="width: 100%"
              @change="setAxis('column', String($event))"
            >
              <ElOption
                v-for="group in filterGroups"
                :key="group.key"
                :label="group.label"
                :value="group.key"
              >
                <span class="select-option-label" :title="group.key">{{ group.label }}</span>
              </ElOption>
            </ElSelect>
          </div>
        </ElPopover>

        <ElPopover v-if="selectedRowGroup" placement="bottom-start" trigger="click" :width="460" popper-class="fm-filter-popper">
          <template #reference>
            <ElButton class="matrix-config-button" :size="rowActionSize" :type="hiddenCount(selectedRowGroup) ? 'primary' : 'default'">
              自定义行
              <span
                class="filter-count"
                :title="`${selectedRowGroup.label} · ${visibleRows.length}/${selectedRowGroup.values.length}`"
              >
                {{ selectedRowGroup.label }} · {{ visibleRows.length }}/{{ selectedRowGroup.values.length }}
              </span>
            </ElButton>
          </template>
          <div class="filter-menu">
            <div class="filter-menu-head">
              <strong>自定义行</strong>
              <span>{{ selectedRowGroup.label }} 的行数据。</span>
            </div>
            <div class="filter-menu-actions">
              <ElButton text :size="rowActionSize" @click="setVisibleValueKeys(selectedRowGroup, selectedRowGroup.values.map(value => value.valueKey))">全选</ElButton>
              <ElButton text :size="rowActionSize" @click="setVisibleValueKeys(selectedRowGroup, [])">清空</ElButton>
            </div>
            <ElCheckboxGroup class="filter-check-list" :model-value="visibleValueKeys(selectedRowGroup)" @change="setVisibleValueKeys(selectedRowGroup, $event as string[])">
              <ElCheckbox v-for="item in selectedRowGroup.values" :key="item.valueKey" :label="item.valueKey">
                <span class="filter-check-label" :title="item.label">{{ item.label }}</span>
                <small>{{ item.count }}</small>
              </ElCheckbox>
            </ElCheckboxGroup>
          </div>
        </ElPopover>

        <ElPopover v-if="selectedColumnGroup" placement="bottom-start" trigger="click" :width="460" popper-class="fm-filter-popper">
          <template #reference>
            <ElButton class="matrix-config-button" :size="rowActionSize" :type="hiddenCount(selectedColumnGroup) ? 'primary' : 'default'">
              自定义列
              <span
                class="filter-count"
                :title="`${selectedColumnGroup.label} · ${visibleColumns.length}/${selectedColumnGroup.values.length}`"
              >
                {{ selectedColumnGroup.label }} · {{ visibleColumns.length }}/{{ selectedColumnGroup.values.length }}
              </span>
            </ElButton>
          </template>
          <div class="filter-menu">
            <div class="filter-menu-head">
              <strong>自定义列</strong>
              <span>{{ selectedColumnGroup.label }} 的列数据。</span>
            </div>
            <div class="filter-menu-actions">
              <ElButton text :size="rowActionSize" @click="setVisibleValueKeys(selectedColumnGroup, selectedColumnGroup.values.map(value => value.valueKey))">全选</ElButton>
              <ElButton text :size="rowActionSize" @click="setVisibleValueKeys(selectedColumnGroup, [])">清空</ElButton>
            </div>
            <ElCheckboxGroup class="filter-check-list" :model-value="visibleValueKeys(selectedColumnGroup)" @change="setVisibleValueKeys(selectedColumnGroup, $event as string[])">
              <ElCheckbox v-for="item in selectedColumnGroup.values" :key="item.valueKey" :label="item.valueKey">
                <span class="filter-check-label" :title="item.label">{{ item.label }}</span>
                <small>{{ item.count }}</small>
              </ElCheckbox>
            </ElCheckboxGroup>
          </div>
        </ElPopover>
      </div>

      <ElButton v-if="hiddenValueKeys.length" :size="rowActionSize" @click="restorePreset">恢复预设</ElButton>
    </div>

    <div v-if="visibleResults.length" class="matrix-scroll fm-card fm-scroll-card">
      <table class="result-matrix">
        <thead>
          <tr>
            <th class="matrix-corner" :title="selectedRowGroup?.key || '参数'">{{ selectedRowGroup?.label || '参数' }}</th>
            <th v-for="column in matrixColumns" :key="column.valueKey">
              <span v-if="selectedColumnGroup" :title="selectedColumnGroup.key">{{ selectedColumnGroup.label }}</span>
              <strong :title="column.label">{{ column.label }}</strong>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in matrixRows" :key="row.valueKey">
            <th>
              <span v-if="selectedRowGroup" :title="selectedRowGroup.key">{{ selectedRowGroup.label }}</span>
              <strong :title="row.label">{{ row.label }}</strong>
            </th>
            <td v-for="column in matrixColumns" :key="column.valueKey">
              <div class="matrix-cell">
                <template v-for="result in cellResults(row.valueKey, column.valueKey)" :key="result.id">
                  <button v-if="isImageResult(result)" class="matrix-media" type="button" @click="emit('preview', result)">
                    <img :src="resultUrl(result)" :alt="result.fileName" >
                  </button>
                  <video v-else-if="isVideoResult(result)" class="matrix-media" :src="resultUrl(result)" controls preload="metadata" />
                  <audio v-else-if="isAudioResult(result)" class="matrix-audio" :src="resultUrl(result)" controls />
                  <button v-else class="matrix-file" type="button" @click="emit('download', result.id)">
                    {{ resultKindLabel(result) }}
                  </button>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ElEmpty v-else-if="results.length" description="当前结果都被筛选隐藏了，显示更多参数值即可恢复。" />
    <ElEmpty v-else description="这个批次还没有可显示的结果。" />
  </div>
</template>

<style scoped lang="scss">
.matrix-config {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.matrix-config-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.matrix-config-button {
  max-width: min(360px, 100%);
}

.matrix-config-button :deep(.el-button__text) {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
}

.filter-count {
  display: inline-block;
  min-width: 0;
  max-width: 220px;
  margin-left: 6px;
  overflow: hidden;
  color: inherit;
  opacity: 0.72;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}

.filter-menu {
  display: grid;
  gap: 10px;
}

.filter-menu-head {
  display: grid;
  gap: 2px;
}

.filter-menu-head strong {
  color: var(--fm-text);
  font-size: 13px;
}

.filter-menu-head span,
.filter-check-list small {
  color: var(--fm-muted);
  font-size: 12px;
}

.filter-menu-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.select-option-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-check-list {
  display: grid;
  max-height: 260px;
  overflow: auto;
}

.filter-check-list :deep(.el-checkbox) {
  height: auto;
  min-height: 28px;
  margin-right: 0;
  white-space: normal;
}

.filter-check-list :deep(.el-checkbox__label) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

.filter-check-label {
  display: block;
  min-width: 0;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-check-list small {
  flex: 0 0 auto;
}

.matrix-scroll {
  scrollbar-gutter: stable;
}

.result-matrix {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--fm-text);
}

.result-matrix th,
.result-matrix td {
  min-width: 178px;
  max-width: 220px;
  padding: 10px;
  border-right: 1px solid var(--fm-border);
  border-bottom: 1px solid var(--fm-border);
  background: color-mix(in srgb, var(--fm-panel-muted) 72%, transparent);
  vertical-align: top;
}

.result-matrix thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: color-mix(in srgb, var(--fm-panel-strong) 88%, transparent);
  text-align: left;
}

.result-matrix tbody th,
.result-matrix .matrix-corner {
  position: sticky;
  left: 0;
  z-index: 3;
  min-width: 180px;
  background: color-mix(in srgb, var(--fm-panel-strong) 90%, transparent);
  text-align: left;
}

.result-matrix .matrix-corner {
  z-index: 4;
}

.result-matrix th span {
  display: block;
  margin-bottom: 4px;
  overflow: hidden;
  color: var(--fm-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-matrix th strong {
  display: -webkit-box;
  overflow: hidden;
  color: var(--fm-text);
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.matrix-cell {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  min-height: 122px;
}

.matrix-media,
.matrix-file {
  display: grid;
  place-items: center;
  width: 100%;
  min-width: 96px;
  aspect-ratio: 3 / 4;
  border: 1px solid var(--fm-border);
  border-radius: 6px;
  background: var(--fm-panel);
  color: var(--fm-muted);
  overflow: hidden;
}

button.matrix-media,
.matrix-file {
  padding: 0;
  cursor: pointer;
}

.matrix-media img,
video.matrix-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.matrix-audio {
  width: 132px;
  min-height: 48px;
}

@media (max-width: 760px) {
  .matrix-config,
  .matrix-config-main {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
