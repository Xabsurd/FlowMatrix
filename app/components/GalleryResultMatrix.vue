<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { Download, FullScreen, InfoFilled, RefreshLeft, RefreshRight, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import type { ResultFile, ResultFilterGroup } from '~/types/gallery'
import {
  formatSize,
  isAudioResult,
  isImageResult,
  isVideoResult,
  paramValueKey,
  paramValueLabel,
  resultKindLabel,
  resultUrl,
  visibleInputParams
} from '~/utils/gallery'

const { t } = useI18n()

const props = defineProps<{
  results: ResultFile[]
  paramOrder?: string[]
}>()

const emit = defineEmits<{
  download: [id: string]
}>()

const { rowActionSize } = useUiPreferences()
const hiddenValueKeys = ref<string[]>([])
const valueOrderByGroup = ref<Record<string, string[]>>({})
const draggingValue = ref<{ groupKey: string; valueKey: string } | null>(null)
const cellMediaSize = ref(128)
const rowAxisKey = ref('')
const columnAxisKey = ref('')
const resultInfoVisible = ref(false)
const activePreviewResult = ref<ResultFile | null>(null)

type MatrixFilter = {
  group: ResultFilterGroup
  value: ResultFilterGroup['values'][number]
}

type MatrixImageEntry = {
  result: ResultFile
  sectionIndex: number
  rowIndex: number
  columnIndex: number
}

const paramOrderIndex = computed(() => new Map((props.paramOrder ?? []).map((key, index) => [key, index])))
const orderedResults = computed(() => [...props.results].sort(compareResults))

const visibleResults = computed(() => orderedResults.value.filter((result) => {
  const params = orderedVisibleInputParams(result.inputParams ?? {})
  return !params.some(([key, value]) => hiddenValueKeys.value.includes(paramValueKey(key, value)))
}))
const imageEntries = computed<MatrixImageEntry[]>(() => {
  const entries: MatrixImageEntry[] = []
  matrixSections.value.forEach((section, sectionIndex) => {
    section.rows.forEach((row, rowIndex) => {
      matrixColumns.value.forEach((column, columnIndex) => {
        const cellItems = (row[column.valueKey] as ResultFile[] | undefined) ?? []
        for (const result of cellItems) {
          if (isImageResult(result)) entries.push({ result, sectionIndex, rowIndex, columnIndex })
        }
      })
    })
  })
  return entries
})
const imageResults = computed(() => imageEntries.value.map(entry => entry.result))
const imagePreviewUrls = computed(() => imageResults.value.map(resultUrl))
const previewOpen = ref(false)
const activePreviewIndex = ref(0)

const filterGroups = computed<ResultFilterGroup[]>(() => {
  const groups = new Map<string, Map<string, { value: unknown; count: number }>>()
  for (const result of orderedResults.value) {
    for (const [key, value] of orderedVisibleInputParams(result.inputParams ?? {})) {
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
        label: paramValueLabel(item.value, t),
        count: item.count,
        hidden: hiddenValueKeys.value.includes(valueKey)
      }))
    }))
    .filter(group => group.values.length > 1)
    .sort((a, b) => compareParamKeys(a.key, b.key))
})

const selectedRowGroup = computed(() => findGroup(rowAxisKey.value) || filterGroups.value[0])
const selectedColumnGroup = computed(() => findGroup(columnAxisKey.value) || filterGroups.value.find(group => group.key !== selectedRowGroup.value?.key))
const visibleRows = computed(() => orderedGroupValues(selectedRowGroup.value).filter(value => !value.hidden))
const visibleColumns = computed(() => orderedGroupValues(selectedColumnGroup.value).filter(value => !value.hidden))
const matrixRows = computed(() => visibleRows.value.length
  ? visibleRows.value
  : [{ valueKey: 'all', label: t('galleryMatrix.allResults'), count: visibleResults.value.length, hidden: false }]
)
const matrixColumns = computed(() => visibleColumns.value.length
  ? visibleColumns.value
  : [{ valueKey: 'all', label: t('galleryMatrix.allResults'), count: visibleResults.value.length, hidden: false }]
)
const sectionGroups = computed(() => filterGroups.value.filter((group) => {
  return group.key !== selectedRowGroup.value?.key && group.key !== selectedColumnGroup.value?.key
}))

const matrixSections = computed(() => {
  const combinations = filterCombinations(sectionGroups.value)
  if (!combinations.length) {
    return [{
      key: 'all',
      filters: [] as MatrixFilter[],
      rows: buildTableRows([])
    }]
  }
  return combinations.map(filters => ({
    key: filters.map(filter => `${filter.group.key}:${filter.value.valueKey}`).join('|'),
    filters,
    rows: buildTableRows(filters)
  }))
})

const sectionSummary = computed(() => {
  if (!sectionGroups.value.length) return ''
  return sectionGroups.value.map(group => group.label).join(' / ')
})
const matrixColumnMinWidth = computed(() => cellMediaSize.value)
const matrixStyleVars = computed(() => ({
  '--matrix-media-size': `${cellMediaSize.value}px`
}))
const hasCustomValueOrder = computed(() => filterGroups.value.some(group => {
  const order = valueOrderByGroup.value[group.key]
  if (!order?.length) return false
  return order.join('\u0000') !== group.values.map(value => value.valueKey).join('\u0000')
}))

function buildTableRows(filters: MatrixFilter[]) {
  return matrixRows.value.map(row => {
    const rowData: Record<string, unknown> = {
      _rowValueKey: row.valueKey,
      _rowLabel: row.label,
      _rowGroupLabel: selectedRowGroup.value?.label || ''
    }
    for (const column of matrixColumns.value) {
      rowData[column.valueKey] = cellResults(row.valueKey, column.valueKey, filters)
    }
    return rowData
  })
}

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
  valueOrderByGroup.value = {}
}

function cellResults(rowValueKey: string, columnValueKey: string, filters: MatrixFilter[]) {
  const rowGroup = selectedRowGroup.value
  const columnGroup = selectedColumnGroup.value
  return visibleResults.value.filter((result) => {
    const rowMatched = !rowGroup || rowValueKey === 'all' || paramValueKey(rowGroup.key, result.inputParams?.[rowGroup.key]) === rowValueKey
    const columnMatched = !columnGroup || columnValueKey === 'all' || paramValueKey(columnGroup.key, result.inputParams?.[columnGroup.key]) === columnValueKey
    return rowMatched && columnMatched && filters.every(filter => {
      return paramValueKey(filter.group.key, result.inputParams?.[filter.group.key]) === filter.value.valueKey
    })
  })
}

function filterCombinations(groups: ResultFilterGroup[]) {
  return groups.reduce<MatrixFilter[][]>((combinations, group) => {
    const values = orderedGroupValues(group).filter(value => !value.hidden)
    if (!values.length) return []
    const next: MatrixFilter[][] = []
    for (const combination of combinations.length ? combinations : [[]]) {
      for (const value of values) {
        next.push([...combination, { group, value }])
      }
    }
    return next
  }, [])
}

function orderedGroupValues(group: ResultFilterGroup | undefined) {
  if (!group) return []
  const order = valueOrderByGroup.value[group.key]
  if (!order?.length) return group.values
  const orderIndex = new Map(order.map((valueKey, index) => [valueKey, index]))
  return [...group.values].sort((a, b) => {
    const aIndex = orderIndex.get(a.valueKey)
    const bIndex = orderIndex.get(b.valueKey)
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex
    if (aIndex !== undefined) return -1
    if (bIndex !== undefined) return 1
    return group.values.findIndex(value => value.valueKey === a.valueKey) - group.values.findIndex(value => value.valueKey === b.valueKey)
  })
}

function startValueDrag(group: ResultFilterGroup | undefined, valueKey: string, event: DragEvent) {
  if (!group) return
  draggingValue.value = { groupKey: group.key, valueKey }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', valueKey)
  }
}

function dropValue(group: ResultFilterGroup | undefined, targetValueKey: string) {
  const source = draggingValue.value
  draggingValue.value = null
  if (!group || !source || source.groupKey !== group.key || source.valueKey === targetValueKey) return

  const orderedKeys = orderedGroupValues(group).map(value => value.valueKey)
  const fromIndex = orderedKeys.indexOf(source.valueKey)
  const toIndex = orderedKeys.indexOf(targetValueKey)
  if (fromIndex < 0 || toIndex < 0) return
  orderedKeys.splice(fromIndex, 1)
  orderedKeys.splice(toIndex, 0, source.valueKey)
  valueOrderByGroup.value = {
    ...valueOrderByGroup.value,
    [group.key]: orderedKeys
  }
}

function endValueDrag() {
  draggingValue.value = null
}

function orderedVisibleInputParams(inputParams: Record<string, unknown>) {
  return visibleInputParams(inputParams).sort(([a], [b]) => compareParamKeys(a, b))
}

function compareParamKeys(a: string, b: string) {
  const aIndex = paramOrderIndex.value.get(a)
  const bIndex = paramOrderIndex.value.get(b)
  if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex
  if (aIndex !== undefined) return -1
  if (bIndex !== undefined) return 1
  return a.localeCompare(b)
}

function compareResults(a: ResultFile, b: ResultFile) {
  const aIndex = Number(a.inputParams?._taskIndex)
  const bIndex = Number(b.inputParams?._taskIndex)
  const aHasIndex = Number.isFinite(aIndex)
  const bHasIndex = Number.isFinite(bIndex)
  if (aHasIndex && bHasIndex && aIndex !== bIndex) return aIndex - bIndex
  if (aHasIndex) return -1
  if (bHasIndex) return 1
  return (a.createdAt ?? 0) - (b.createdAt ?? 0)
}

function imagePreviewIndex(result: ResultFile) {
  const index = imageResults.value.findIndex(item => item.id === result.id)
  return Math.max(0, index)
}

function downloadPreviewImage(activeIndex: number, fallback: ResultFile) {
  const result = previewResult(activeIndex, fallback)
  emit('download', result.id)
}

function showPreviewInfo(activeIndex: number, fallback: ResultFile) {
  activePreviewResult.value = previewResult(activeIndex, fallback)
  resultInfoVisible.value = true
}

function previewResult(activeIndex: number, fallback: ResultFile) {
  return imageResults.value[activeIndex] || fallback
}

function showMatrixPreview(result: ResultFile) {
  activePreviewIndex.value = imagePreviewIndex(result)
  previewOpen.value = true
}

function closeMatrixPreview() {
  previewOpen.value = false
}

function switchMatrixPreview(index: number) {
  activePreviewIndex.value = index
}

function handlePreviewKeydown(event: KeyboardEvent) {
  if (!previewOpen.value || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  const targetIndex = findVerticalPreviewIndex(event.key === 'ArrowUp' ? -1 : 1)
  if (targetIndex === activePreviewIndex.value) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  jumpPreviewToIndex(targetIndex)
}

function findVerticalPreviewIndex(rowDelta: number) {
  const entries = imageEntries.value
  const current = entries[activePreviewIndex.value]
  if (!current) return activePreviewIndex.value
  const targetRow = current.rowIndex + rowDelta
  const candidates = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.sectionIndex === current.sectionIndex && entry.rowIndex === targetRow)
    .sort((a, b) => Math.abs(a.entry.columnIndex - current.columnIndex) - Math.abs(b.entry.columnIndex - current.columnIndex))
  return candidates[0]?.index ?? activePreviewIndex.value
}

function jumpPreviewToIndex(targetIndex: number) {
  const delta = targetIndex - activePreviewIndex.value
  const selector = delta > 0 ? '.el-image-viewer__next' : '.el-image-viewer__prev'
  const button = document.querySelector<HTMLElement>(selector)
  if (!button) return
  for (let step = 0; step < Math.abs(delta); step++) button.click()
  activePreviewIndex.value = targetIndex
}

onMounted(() => {
  document.addEventListener('keydown', handlePreviewKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handlePreviewKeydown, true)
})
</script>

<template>
  <div class="fm-stack">
    <div v-if="filterGroups.length" class="matrix-config fm-card">
      <div class="matrix-config-main">
        <ElPopover placement="bottom-start" trigger="click" :width="320" popper-class="fm-filter-popper">
          <template #reference>
            <ElButton class="matrix-config-button" :size="rowActionSize">
              {{ t('galleryMatrix.aggregateParam') }}
              <span
                class="filter-count"
                :title="selectedColumnGroup?.key || selectedColumnGroup?.label || t('galleryMatrix.allResults')"
              >
                {{ selectedColumnGroup?.label || t('galleryMatrix.allResults') }}
              </span>
            </ElButton>
          </template>
          <div class="filter-menu">
            <div class="filter-menu-head">
              <strong>{{ t('galleryMatrix.aggregateBy') }}</strong>
              <span>{{ t('galleryMatrix.aggregateHint') }}</span>
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
              {{ t('galleryMatrix.customRows') }}
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
              <strong>{{ t('galleryMatrix.customRows') }}</strong>
              <span>{{ t('galleryMatrix.rowData', { label: selectedRowGroup.label }) }}</span>
            </div>
            <div class="filter-menu-actions">
              <ElButton text :size="rowActionSize" @click="setVisibleValueKeys(selectedRowGroup, orderedGroupValues(selectedRowGroup).map(value => value.valueKey))">{{ t('galleryMatrix.selectAll') }}</ElButton>
              <ElButton text :size="rowActionSize" @click="setVisibleValueKeys(selectedRowGroup, [])">{{ t('galleryMatrix.clear') }}</ElButton>
            </div>
            <ElCheckboxGroup class="filter-check-list" :model-value="visibleValueKeys(selectedRowGroup)" @change="setVisibleValueKeys(selectedRowGroup, $event as string[])">
              <div
                v-for="item in orderedGroupValues(selectedRowGroup)"
                :key="item.valueKey"
                class="filter-drag-item"
                :class="{ 'is-dragging': draggingValue?.groupKey === selectedRowGroup.key && draggingValue.valueKey === item.valueKey }"
                draggable="true"
                @dragstart="startValueDrag(selectedRowGroup, item.valueKey, $event)"
                @dragend="endValueDrag"
                @dragover.prevent
                @drop="dropValue(selectedRowGroup, item.valueKey)"
              >
                <span class="filter-drag-handle" :title="t('galleryMatrix.dragSort')">⋮⋮</span>
                <ElCheckbox :label="item.valueKey">
                  <span class="filter-check-label" :title="item.label">{{ item.label }}</span>
                  <small>{{ item.count }}</small>
                </ElCheckbox>
              </div>
            </ElCheckboxGroup>
          </div>
        </ElPopover>

        <ElPopover v-if="selectedColumnGroup" placement="bottom-start" trigger="click" :width="460" popper-class="fm-filter-popper">
          <template #reference>
            <ElButton class="matrix-config-button" :size="rowActionSize" :type="hiddenCount(selectedColumnGroup) ? 'primary' : 'default'">
              {{ t('galleryMatrix.customColumns') }}
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
              <strong>{{ t('galleryMatrix.customColumns') }}</strong>
              <span>{{ t('galleryMatrix.columnData', { label: selectedColumnGroup.label }) }}</span>
            </div>
            <div class="filter-menu-actions">
              <ElButton text :size="rowActionSize" @click="setVisibleValueKeys(selectedColumnGroup, orderedGroupValues(selectedColumnGroup).map(value => value.valueKey))">{{ t('galleryMatrix.selectAll') }}</ElButton>
              <ElButton text :size="rowActionSize" @click="setVisibleValueKeys(selectedColumnGroup, [])">{{ t('galleryMatrix.clear') }}</ElButton>
            </div>
            <ElCheckboxGroup class="filter-check-list" :model-value="visibleValueKeys(selectedColumnGroup)" @change="setVisibleValueKeys(selectedColumnGroup, $event as string[])">
              <div
                v-for="item in orderedGroupValues(selectedColumnGroup)"
                :key="item.valueKey"
                class="filter-drag-item"
                :class="{ 'is-dragging': draggingValue?.groupKey === selectedColumnGroup.key && draggingValue.valueKey === item.valueKey }"
                draggable="true"
                @dragstart="startValueDrag(selectedColumnGroup, item.valueKey, $event)"
                @dragend="endValueDrag"
                @dragover.prevent
                @drop="dropValue(selectedColumnGroup, item.valueKey)"
              >
                <span class="filter-drag-handle" :title="t('galleryMatrix.dragSort')">⋮⋮</span>
                <ElCheckbox :label="item.valueKey">
                  <span class="filter-check-label" :title="item.label">{{ item.label }}</span>
                  <small>{{ item.count }}</small>
                </ElCheckbox>
              </div>
            </ElCheckboxGroup>
          </div>
        </ElPopover>

        <ElButton v-if="sectionGroups.length" class="matrix-config-button" :size="rowActionSize" disabled>
          {{ t('galleryMatrix.facetCompare') }}
          <span class="filter-count" :title="sectionSummary">{{ sectionSummary }}</span>
        </ElButton>

        <div class="matrix-size-control">
          <span>{{ t('galleryMatrix.contentSize') }}</span>
          <ElSlider
            v-model="cellMediaSize"
            :min="128"
            :max="1024"
            :show-tooltip="false"
          />
          <strong>{{ cellMediaSize }}</strong>
        </div>
      </div>

      <ElButton v-if="hiddenValueKeys.length || hasCustomValueOrder" :size="rowActionSize" @click="restorePreset">{{ t('galleryMatrix.restorePreset') }}</ElButton>
    </div>

    <div v-if="visibleResults.length" class="matrix-section-list" :style="matrixStyleVars">
      <section v-for="section in matrixSections" :key="section.key" class="matrix-section">
        <div v-if="section.filters.length" class="matrix-section-head">
          <span v-for="filter in section.filters" :key="`${filter.group.key}:${filter.value.valueKey}`" class="section-filter-pill">
            <small>{{ filter.group.label }}</small>
            <strong :title="filter.value.label">{{ filter.value.label }}</strong>
          </span>
        </div>

        <div class="flex overflow-hidden">
          <ElTable :data="section.rows" class="fm-result-matrix-table flex-1" style="width: 100%" max-height="70vh" border>
            <ElTableColumn
              prop="_rowLabel"
              :label="selectedRowGroup?.label || t('galleryMatrix.parameter')"
              fixed="left"
              min-width="180"
            >
              <template #header>
                <div class="row-header">
                  <span v-if="selectedRowGroup" class="row-header-label">{{ selectedRowGroup.label }}</span>
                  <strong>{{ selectedRowGroup?.label || t('galleryMatrix.parameter') }}</strong>
                </div>
              </template>
              <template #default="{ row }">
                <div class="row-header">
                  <span v-if="row._rowGroupLabel" class="row-header-label">{{ row._rowGroupLabel }}</span>
                  <strong :title="String(row._rowLabel)">{{ row._rowLabel }}</strong>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn
              v-for="column in matrixColumns"
              :key="column.valueKey"
              :prop="column.valueKey"
              :label="column.label"
              :min-width="matrixColumnMinWidth"
            >
              <template #header>
                <div class="column-header">
                  <span v-if="selectedColumnGroup" class="column-header-label">{{ selectedColumnGroup.label }}</span>
                  <strong :title="column.label">{{ column.label }}</strong>
                </div>
              </template>
              <template #default="{ row }">
                <div class="matrix-cell">
                  <template v-for="result in (row[column.valueKey] as ResultFile[])" :key="result.id">
                    <ElImage
                      v-if="isImageResult(result)"
                      class="matrix-media matrix-image"
                      :src="resultUrl(result)"
                      :alt="result.fileName"
                      fit="cover"
                      :preview-src-list="imagePreviewUrls"
                      :initial-index="imagePreviewIndex(result)"
                      :preview-teleported="true"
                      :hide-on-click-modal="true"
                      :infinite="false"
                      show-progress
                      @show="showMatrixPreview(result)"
                      @switch="switchMatrixPreview"
                      @close="closeMatrixPreview"
                    >
                      <template #toolbar="{ actions, reset, activeIndex }">
                        <ElIcon :title="t('galleryMatrix.zoomOut')" @click="actions('zoomOut')"><ZoomOut /></ElIcon>
                        <ElIcon :title="t('galleryMatrix.zoomIn')" @click="actions('zoomIn')"><ZoomIn /></ElIcon>
                        <i class="el-image-viewer__actions__divider" />
                        <ElIcon :title="t('galleryMatrix.resetView')" @click="reset"><FullScreen /></ElIcon>
                        <i class="el-image-viewer__actions__divider" />
                        <ElIcon :title="t('galleryMatrix.rotateLeft')" @click="actions('anticlockwise')"><RefreshLeft /></ElIcon>
                        <ElIcon :title="t('galleryMatrix.rotateRight')" @click="actions('clockwise')"><RefreshRight /></ElIcon>
                        <i class="el-image-viewer__actions__divider" />
                        <ElIcon :title="t('galleryMatrix.fileInfo')" @click="showPreviewInfo(activeIndex, result)"><InfoFilled /></ElIcon>
                        <ElIcon :title="t('galleryMatrix.downloadCurrent')" @click="downloadPreviewImage(activeIndex, result)"><Download /></ElIcon>
                      </template>
                      <template #progress="{ activeIndex, total }">
                        <span class="viewer-progress-text">{{ activeIndex + 1 }} / {{ total }}</span>
                      </template>
                      <template #error>
                        <span class="matrix-image-error">{{ t('galleryMatrix.imageLoadFailed') }}</span>
                      </template>
                    </ElImage>
                    <video v-else-if="isVideoResult(result)" class="matrix-media" :src="resultUrl(result)" controls preload="metadata" />
                    <audio v-else-if="isAudioResult(result)" class="matrix-audio" :src="resultUrl(result)" controls />
                    <button v-else class="matrix-file" type="button" @click="emit('download', result.id)">
                      {{ resultKindLabel(result, t) }}
                    </button>
                  </template>
                </div>
              </template>
            </ElTableColumn>
          </ElTable>
        </div>
      </section>
    </div>
    <ElEmpty v-else-if="results.length" :description="t('galleryMatrix.hiddenEmpty')" />
    <ElEmpty v-else :description="t('galleryMatrix.empty')" />

    <ElDialog
      v-model="resultInfoVisible"
      :title="t('galleryMatrix.fileInfo')"
      width="520px"
      append-to-body
      class="fm-viewer-info-dialog"
    >
      <div v-if="activePreviewResult" class="viewer-info-content">
        <div class="meta-item">
          <span>{{ t('galleryMatrix.fileName') }}</span>
          <strong>{{ activePreviewResult.fileName }}</strong>
        </div>
        <div class="meta-item">
          <span>{{ t('galleryMatrix.fileSize') }}</span>
          <strong>{{ formatSize(activePreviewResult.fileSize) }}</strong>
        </div>
        <div class="meta-item">
          <span>{{ t('galleryMatrix.fileId') }}</span>
          <span class="mono">{{ activePreviewResult.id }}</span>
        </div>
        <template v-if="activePreviewResult.metadata">
          <h3>{{ t('galleryMatrix.metadata') }}</h3>
          <div v-for="(value, key) in activePreviewResult.metadata" :key="key" class="meta-item">
            <span>{{ key }}</span>
            <strong v-if="typeof value !== 'object'">{{ value }}</strong>
            <pre v-else class="code-pre">{{ JSON.stringify(value, null, 2) }}</pre>
          </div>
        </template>
      </div>
      <template #footer>
        <ElButton @click="resultInfoVisible = false">{{ t('galleryMatrix.close') }}</ElButton>
        <ElButton v-if="activePreviewResult" type="primary" @click="emit('download', activePreviewResult.id)">{{ t('galleryMatrix.download') }}</ElButton>
      </template>
    </ElDialog>
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

.matrix-size-control {
  display: grid;
  grid-template-columns: auto minmax(180px, 260px) 40px;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 4px;
  color: var(--fm-muted);
  font-size: 12px;
}

.matrix-size-control :deep(.el-slider) {
  --el-slider-main-bg-color: var(--fm-primary);
  --el-slider-runway-bg-color: color-mix(in srgb, var(--fm-border) 76%, transparent);
  --el-slider-button-size: 14px;
  min-width: 0;
}

.matrix-size-control strong {
  color: var(--fm-text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
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
  gap: 4px;
  max-height: 260px;
  overflow: auto;
}

.filter-drag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 30px;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: calc(var(--fm-radius) - 6px);
  cursor: grab;
}

.filter-drag-item:hover {
  border-color: color-mix(in srgb, var(--fm-primary) 18%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-primary) 5%, transparent);
}

.filter-drag-item.is-dragging {
  opacity: 0.46;
}

.filter-drag-item:active {
  cursor: grabbing;
}

.filter-drag-handle {
  flex: 0 0 auto;
  color: var(--fm-muted);
  font-size: 12px;
  letter-spacing: 0;
  line-height: 1;
}

.filter-drag-item :deep(.el-checkbox) {
  flex: 1 1 auto;
  height: auto;
  min-height: 28px;
  margin-right: 0;
  white-space: normal;
}

.filter-drag-item :deep(.el-checkbox__label) {
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

.matrix-section-list {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.matrix-section {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.matrix-section-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.section-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: min(520px, 100%);
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--fm-primary) 24%, var(--fm-border));
  border-radius: calc(var(--fm-radius) - 4px);
  background: color-mix(in srgb, var(--fm-primary) 8%, var(--fm-panel-muted));
  color: var(--fm-text);
}

.section-filter-pill small {
  flex: 0 0 auto;
  color: var(--fm-muted);
  font-size: 11px;
}

.section-filter-pill strong {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.matrix-scroll {
  --matrix-frame-padding: 12px;
  padding: var(--matrix-frame-padding);
  scrollbar-gutter: stable;
}

.row-header,
.column-header {
  display: grid;
  gap: 4px;
}

.row-header-label,
.column-header-label {
  display: block;
  overflow: hidden;
  color: var(--fm-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-header strong,
.column-header strong {
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
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--matrix-media-size, 96px)), 1fr));
  gap: 0;
  min-height: calc(var(--matrix-media-size, 96px) * 1.27);
}

.matrix-media,
.matrix-file {
  display: grid;
  place-items: center;
  width: 100%;
  min-width: 0;
  aspect-ratio: 3 / 4;
  border: 0;
  border-radius: 0;
  background: var(--fm-panel);
  color: var(--fm-muted);
  overflow: hidden;
}

.matrix-image,
.matrix-file {
  cursor: pointer;
}

.matrix-image :deep(.el-image__inner),
video.matrix-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.matrix-image :deep(.el-image__wrapper) {
  width: 100%;
  height: 100%;
}

.matrix-image-error {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 8px;
  color: var(--fm-muted);
  font-size: 12px;
  text-align: center;
}

.matrix-audio {
  width: max(132px, var(--matrix-media-size, 96px));
  min-height: 48px;
}

.viewer-info-content {
  display: grid;
  gap: 10px;
  max-height: min(62vh, 560px);
  overflow: auto;
}

.viewer-info-content h3 {
  margin: 0;
  color: var(--fm-primary);
  font-size: 14px;
}

.meta-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: var(--fm-muted);
  font-size: 13px;
}

.meta-item strong {
  color: var(--fm-text);
  text-align: right;
  word-break: break-all;
}

.code-pre {
  width: 100%;
  margin: 4px 0 0;
  padding: 6px;
  overflow-x: auto;
  border: 1px solid var(--fm-border);
  border-radius: 4px;
  background: var(--fm-panel-muted);
  color: var(--fm-text);
  font-family: monospace;
  font-size: 11px;
  text-align: left;
}

.mono {
  font-family: monospace;
  font-size: 12px;
}

.viewer-progress-text {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  .matrix-config,
  .matrix-config-main {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

<style lang="scss">
.fm-result-matrix-table {
  --matrix-header-bg: var(--fm-panel-strong);
  --matrix-cell-bg: var(--fm-panel-muted);
  --matrix-cell-hover-bg: color-mix(in srgb, var(--fm-primary) 7%, var(--fm-panel-muted));

  border-radius: calc(var(--fm-radius) - 2px);
  border: 0;
  background: var(--matrix-cell-bg);
  box-shadow: none;

  &.el-table--border::before,
  &.el-table--border::after,
  &.el-table--border .el-table__inner-wrapper::after {
    display: none;
  }

  .el-table__inner-wrapper::before {
    display: none;
  }

  .el-table__header-wrapper,
  .el-table__body-wrapper {
    background: var(--matrix-cell-bg);
  }

  th.el-table__cell {
    background: var(--matrix-header-bg);
  }

  td.el-table__cell {
    background: var(--matrix-cell-bg);
  }

  th.el-table-fixed-column--left,
  th.el-table-fixed-column--right {
    background: var(--matrix-header-bg) !important;
  }

  td.el-table-fixed-column--left,
  td.el-table-fixed-column--right {
    background: var(--matrix-cell-bg) !important;
  }

  .el-table__body tr:hover > td.el-table-fixed-column--left,
  .el-table__body tr:hover > td.el-table-fixed-column--right {
    background: var(--matrix-cell-hover-bg) !important;
  }

  .el-table-fixed-column--left.is-last-column::before {
    box-shadow: 10px 0 18px -12px rgba(0, 0, 0, 0.42) !important;
  }

  .el-table-fixed-column--right.is-first-column::before {
    box-shadow: -10px 0 18px -12px rgba(0, 0, 0, 0.42) !important;
  }

  th.el-table__cell > .cell {
    padding: 12px;
  }

  td.el-table__cell > .cell {
    padding: 0;
  }

  .el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell {
    background: var(--matrix-cell-hover-bg);
  }

  .el-table__fixed,
  .el-table__fixed-right {
    background: var(--matrix-cell-bg);
    box-shadow: 10px 0 24px rgba(0, 0, 0, 0.14);
  }

  .el-table__fixed-right {
    box-shadow: -10px 0 24px rgba(0, 0, 0, 0.14);
  }

  .el-table__fixed .el-table__fixed-body-wrapper,
  .el-table__fixed-right .el-table__fixed-body-wrapper {
    background: var(--matrix-cell-bg);
  }

  .el-table__fixed-header-wrapper,
  .el-table__fixed-right-header-wrapper {
    background: var(--matrix-header-bg);
  }

  .el-table__fixed-header-wrapper .el-table__cell,
  .el-table__fixed-right-header-wrapper .el-table__cell {
    background: var(--matrix-header-bg);
  }

  .el-table__fixed-body-wrapper .el-table__cell,
  .el-table__fixed-right-body-wrapper .el-table__cell {
    background: var(--matrix-cell-bg);
  }

  .el-table__border-left-patch,
  .el-table__border-right-patch,
  .el-table__border-bottom-patch {
    display: none;
  }
}

.fm-viewer-info-dialog {
  .el-dialog {
    border: 1px solid color-mix(in srgb, var(--fm-border) 82%, transparent);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--fm-glass-edge) 9%, transparent), transparent 42%),
      color-mix(in srgb, var(--fm-popper-bg) 78%, transparent);
    color: var(--fm-text);
    box-shadow: var(--el-box-shadow-dark);
    backdrop-filter: blur(var(--fm-blur)) saturate(1.14);
    -webkit-backdrop-filter: blur(var(--fm-blur)) saturate(1.14);
  }

  .el-dialog__header,
  .el-dialog__body,
  .el-dialog__footer {
    background: transparent;
  }

  .el-dialog__header {
    border-bottom: 1px solid var(--fm-border);
  }

  .el-dialog__footer {
    border-top: 1px solid var(--fm-border);
  }

  .el-dialog__title {
    color: var(--fm-text);
  }
}

</style>

