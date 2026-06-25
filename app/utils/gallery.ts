// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BatchDetail, BatchRun, ResultFile, Task } from '~/types/gallery'

export const COPIED_TASK_STORAGE_KEY = 'flowmatrix.copied-task'

export function visibleInputParams(inputParams: Record<string, unknown>) {
  return Object.entries(inputParams).filter(([key]) => !key.startsWith('_'))
}

export function resultUrl(result: Pick<ResultFile, 'id'>) {
  return `/api/v1/results/${result.id}/file`
}

export function isImageResult(result: Pick<ResultFile, 'outputType' | 'mimeType'>) {
  return result.outputType === 'image' || result.mimeType?.startsWith('image/')
}

export function isVideoResult(result: Pick<ResultFile, 'outputType' | 'mimeType'>) {
  return result.outputType === 'video' || result.mimeType?.startsWith('video/')
}

export function isAudioResult(result: Pick<ResultFile, 'outputType' | 'mimeType'>) {
  return result.outputType === 'audio' || result.mimeType?.startsWith('audio/')
}

export function resultKindLabel(result: Pick<ResultFile, 'outputType' | 'mimeType'>) {
  if (isImageResult(result)) return '图片'
  if (isVideoResult(result)) return '视频'
  if (isAudioResult(result)) return '音频'
  if (result.outputType === 'text') return '文本'
  return '文件'
}

export function paramValueKey(key: string, value: unknown) {
  return `${key}:${JSON.stringify(value)}`
}

export function paramValueLabel(value: unknown) {
  if (typeof value === 'object' && value !== null) return '文件/资源'
  return String(value)
}

export function batchTitle(batch: BatchRun) {
  return batch.name || `运行批次 ${formatTime(batch.createdAt)}`
}

export function batchSubtitle(batch: BatchRun) {
  const finished = batch.finishedAt ? ` · 完成于 ${formatTime(batch.finishedAt)}` : ''
  return `${modeLabel(batch.combinationMode)} · 创建于 ${formatTime(batch.createdAt)}${finished}`
}

type BatchProgressSource = BatchRun | BatchDetail

function taskStat(batch: BatchProgressSource, status: Task['status']) {
  return 'taskStatusStats' in batch ? Number(batch.taskStatusStats[status] ?? 0) : 0
}

export function batchProgress(batch: BatchProgressSource) {
  if (!batch.totalTasks) return 0
  return Math.round((completedCount(batch) / batch.totalTasks) * 100)
}

export function completedCount(batch: BatchProgressSource) {
  if ('taskStatusStats' in batch) {
    return taskStat(batch, 'succeeded') + taskStat(batch, 'failed') + taskStat(batch, 'canceled')
  }
  return batch.completedTasks + batch.failedTasks + batch.canceledTasks
}

export function queuedCount(batch: BatchProgressSource) {
  if ('taskStatusStats' in batch) return taskStat(batch, 'queued') + taskStat(batch, 'retrying')
  return batch.totalTasks - completedCount(batch)
}

export function runningCount(batch: BatchProgressSource) {
  return 'taskStatusStats' in batch ? taskStat(batch, 'running') : 0
}

export function succeededCount(batch: BatchProgressSource) {
  return 'taskStatusStats' in batch ? taskStat(batch, 'succeeded') : batch.completedTasks
}

export function failedCount(batch: BatchProgressSource) {
  return 'taskStatusStats' in batch ? taskStat(batch, 'failed') : batch.failedTasks
}

export function canceledCount(batch: BatchProgressSource) {
  return 'taskStatusStats' in batch ? taskStat(batch, 'canceled') : batch.canceledTasks
}

export function statusType(status: string) {
  if (status === 'completed' || status === 'succeeded') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'primary'
  if (status === 'queued') return 'warning'
  return 'info'
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: '排队中',
    running: '运行中',
    completed: '已完成',
    succeeded: '成功',
    failed: '失败',
    canceled: '已取消',
    retrying: '重试中'
  }
  return labels[status] || status
}

export function modeLabel(mode: string) {
  if (mode === 'zip') return '逐行'
  if (mode === 'table') return '表格'
  return '笛卡尔'
}

export function taskParamSummary(task: Pick<Task, 'inputParams'>) {
  const params = visibleInputParams(task.inputParams)
  if (!params.length) return '无运行参数'
  return params
    .slice(0, 3)
    .map(([key, value]) => `${key.split('.').pop()}: ${paramValueLabel(value)}`)
    .join(' · ')
}

export function formatTime(value: number | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

export function formatDuration(task: Pick<Task, 'startedAt' | 'finishedAt'>) {
  if (!task.startedAt) return '-'
  const end = task.finishedAt || Date.now()
  const diff = (end - task.startedAt) / 1000
  if (diff < 60) return `${diff.toFixed(1)}s`
  return `${Math.floor(diff / 60)}m ${Math.round(diff % 60)}s`
}

export function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
