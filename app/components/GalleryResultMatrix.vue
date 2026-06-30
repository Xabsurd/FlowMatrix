<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
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

const props = defineProps<{
  results: ResultFile[]
}>()

const emit = defineEmits<{
  download: [id: string]
}>()

const { rowActionSize } = useUiPreferences()
const hiddenValueKeys = ref<string[]>([])
const rowAxisKey = ref('')
const columnAxisKey = ref('')
const resultInfoVisible = ref(false)
const activePreviewResult = ref<ResultFile | null>(null)

const visibleResults = computed(() => props.results.filter((result) => {
  const params = visibleInputParams(result.inputParams ?? {})
  return !params.some(([key, value]) => hiddenValueKeys.value.includes(paramValueKey(key, value)))
}))
const imageResults = computed(() => visibleResults.value.filter(isImageResult))
const imagePreviewUrls = computed(() => imageResults.value.map(resultUrl))

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

const tableData = computed(() => {
  return matrixRows.value.map(row => {
    const rowData: Record<string, unknown> = {
      _rowValueKey: row.valueKey,
      _rowLabel: row.label,
      _rowGroupLabel: selectedRowGroup.value?.label || ''
    }
    for (const column of matrixColumns.value) {
      rowData[column.valueKey] = cellResults(row.valueKey, column.valueKey)
    }
    return rowData
  })
})

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

    <div v-if="visibleResults.length" class="flex overflow-hidden">
      <ElTable :data="tableData" class="fm-result-matrix-table flex-1" style="width: 100%" max-height="70vh" border>
        <ElTableColumn
          prop="_rowLabel"
          :label="selectedRowGroup?.label || '参数'"
          fixed="left"
          min-width="180"
        >
          <template #header>
            <div class="row-header">
              <span v-if="selectedRowGroup" class="row-header-label">{{ selectedRowGroup.label }}</span>
              <strong>{{ selectedRowGroup?.label || '参数' }}</strong>
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
          min-width="200"
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
                >
                  <template #toolbar="{ actions, reset, activeIndex }">
                    <ElIcon title="缩小" @click="actions('zoomOut')"><ZoomOut /></ElIcon>
                    <ElIcon title="放大" @click="actions('zoomIn')"><ZoomIn /></ElIcon>
                    <i class="el-image-viewer__actions__divider" />
                    <ElIcon title="重置视图" @click="reset"><FullScreen /></ElIcon>
                    <i class="el-image-viewer__actions__divider" />
                    <ElIcon title="逆时针旋转" @click="actions('anticlockwise')"><RefreshLeft /></ElIcon>
                    <ElIcon title="顺时针旋转" @click="actions('clockwise')"><RefreshRight /></ElIcon>
                    <i class="el-image-viewer__actions__divider" />
                    <ElIcon title="文件信息" @click="showPreviewInfo(activeIndex, result)"><InfoFilled /></ElIcon>
                    <ElIcon title="下载当前图片" @click="downloadPreviewImage(activeIndex, result)"><Download /></ElIcon>
                  </template>
                  <template #progress="{ activeIndex, total }">
                    <span class="viewer-progress-text">{{ activeIndex + 1 }} / {{ total }}</span>
                  </template>
                  <template #error>
                    <span class="matrix-image-error">图片加载失败</span>
                  </template>
                </ElImage>
                <video v-else-if="isVideoResult(result)" class="matrix-media" :src="resultUrl(result)" controls preload="metadata" />
                <audio v-else-if="isAudioResult(result)" class="matrix-audio" :src="resultUrl(result)" controls />
                <button v-else class="matrix-file" type="button" @click="emit('download', result.id)">
                  {{ resultKindLabel(result) }}
                </button>
              </template>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>
    <ElEmpty v-else-if="results.length" description="当前结果都被筛选隐藏了，显示更多参数值即可恢复。" />
    <ElEmpty v-else description="这个批次还没有可显示的结果。" />

    <ElDialog
      v-model="resultInfoVisible"
      title="文件信息"
      width="520px"
      append-to-body
      class="fm-viewer-info-dialog"
    >
      <div v-if="activePreviewResult" class="viewer-info-content">
        <div class="meta-item">
          <span>文件名</span>
          <strong>{{ activePreviewResult.fileName }}</strong>
        </div>
        <div class="meta-item">
          <span>文件大小</span>
          <strong>{{ formatSize(activePreviewResult.fileSize) }}</strong>
        </div>
        <div class="meta-item">
          <span>文件 ID</span>
          <span class="mono">{{ activePreviewResult.id }}</span>
        </div>
        <template v-if="activePreviewResult.metadata">
          <h3>生成元数据</h3>
          <div v-for="(value, key) in activePreviewResult.metadata" :key="key" class="meta-item">
            <span>{{ key }}</span>
            <strong v-if="typeof value !== 'object'">{{ value }}</strong>
            <pre v-else class="code-pre">{{ JSON.stringify(value, null, 2) }}</pre>
          </div>
        </template>
      </div>
      <template #footer>
        <ElButton @click="resultInfoVisible = false">关闭</ElButton>
        <ElButton v-if="activePreviewResult" type="primary" @click="emit('download', activePreviewResult.id)">下载</ElButton>
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
  width: 132px;
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

  th.el-table__cell > .cell,
  td.el-table__cell > .cell {
    padding: 12px;
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
