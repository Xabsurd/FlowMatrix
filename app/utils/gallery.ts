// SPDX-License-Identifier: GPL-3.0-or-later
import type { BatchDetail, BatchRun, ResultFile, Task } from '~/types/gallery'

export const COPIED_TASK_STORAGE_KEY = 'flowmatrix.copied-task'
export const ONLINE_API_PRESET_ID = '__online_api__'

type Translate = (key: string, params?: Record<string, unknown>) => string

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

export function isOnlineApiPreset(presetId: string | null | undefined) {
  return presetId === ONLINE_API_PRESET_ID
}

export function resultKindLabel(result: Pick<ResultFile, 'outputType' | 'mimeType'>, t: Translate) {
  if (isImageResult(result)) return t('gallery.image')
  if (isVideoResult(result)) return t('gallery.video')
  if (isAudioResult(result)) return t('gallery.audio')
  if (result.outputType === 'text') return t('gallery.text')
  return t('gallery.file')
}

export function paramValueKey(key: string, value: unknown) {
  return `${key}:${JSON.stringify(value)}`
}

export function paramValueLabel(value: unknown, t: Translate) {
  if (typeof value === 'object' && value !== null) return t('gallery.fileResource')
  return String(value)
}

export function batchTitle(batch: BatchRun, t: Translate, locale = 'zh-CN') {
  return batch.name || t('gallery.batchFallback', { time: formatTime(batch.createdAt, locale) })
}

export function batchSubtitle(batch: BatchRun, t: Translate, locale = 'zh-CN') {
  const finished = batch.finishedAt ? ' · ' + t('gallery.finishedAt', { time: formatTime(batch.finishedAt, locale) }) : ''
  return t('gallery.batchSubtitle', {
    mode: modeLabel(batch.combinationMode, t),
    created: formatTime(batch.createdAt, locale),
    finished
  })
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

export function statusLabel(status: string, t: Translate) {
  const labels: Record<string, string> = {
    queued: 'gallery.statusQueued',
    running: 'gallery.statusRunning',
    completed: 'gallery.statusCompleted',
    succeeded: 'gallery.statusSucceeded',
    failed: 'gallery.statusFailed',
    canceled: 'gallery.statusCanceled',
    retrying: 'gallery.statusRetrying'
  }
  return labels[status] ? t(labels[status]) : status
}

export function modeLabel(mode: string, t: Translate) {
  if (mode === 'zip') return t('gallery.modeZip')
  if (mode === 'table') return t('gallery.modeTable')
  return t('gallery.modeCartesian')
}

export function taskParamSummary(task: Pick<Task, 'inputParams'>, t: Translate) {
  const params = visibleInputParams(task.inputParams)
  if (!params.length) return t('gallery.noRuntimeParams')
  return params
    .slice(0, 3)
    .map(([key, value]) => String(key.split('.').pop()) + ': ' + paramValueLabel(value, t))
    .join(' · ')
}

export function formatTime(value: number | undefined, locale = 'zh-CN') {
  if (!value) return '-'
  return new Date(value).toLocaleString(locale)
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
