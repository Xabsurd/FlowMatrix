// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { getSqlite } from '../infrastructure/db/sqlite'
import { enqueue } from './queue'
import type { BackendScheduleMode } from '../../shared/types/app'

export interface BatchRunRow {
  id: string
  workspaceId: string
  actorId: string
  presetId: string
  workflowId: string
  name: string | null
  status: string
  combinationMode: string
  totalTasks: number
  completedTasks: number
  failedTasks: number
  canceledTasks: number
  matrixJson: unknown[] | null
  scheduleMode: string
  startedAt: number | null
  finishedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface RunTaskRow {
  id: string
  batchRunId: string
  workspaceId: string
  actorId: string
  workflowId: string
  presetId: string
  backendId: string | null
  status: string
  inputParams: Record<string, unknown>
  submittedPayload: Record<string, unknown> | null
  externalTaskId: string | null
  resultJson: Record<string, unknown> | null
  errorMessage: string | null
  scheduleDecision: Record<string, unknown> | null
  retryCount: number
  maxRetries: number
  createdAt: number
  updatedAt: number
  startedAt: number | null
  finishedAt: number | null
  timeoutSeconds: number
}

function safeJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback
  try { return JSON.parse(val) as T } catch { return fallback }
}

function rowToBatchRun(row: Record<string, unknown>): BatchRunRow {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    actorId: row.actor_id as string,
    presetId: row.preset_id as string,
    workflowId: row.workflow_id as string,
    name: (row.name as string) ?? null,
    status: row.status as string,
    combinationMode: row.combination_mode as string,
    totalTasks: Number(row.total_tasks),
    completedTasks: Number(row.completed_tasks),
    failedTasks: Number(row.failed_tasks),
    canceledTasks: Number(row.canceled_tasks),
    matrixJson: safeJson(row.matrix_json as string, null),
    scheduleMode: row.schedule_mode as string,
    startedAt: (row.started_at as number) ?? null,
    finishedAt: (row.finished_at as number) ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}

function rowToTask(row: Record<string, unknown>): RunTaskRow {
  return {
    id: row.id as string,
    batchRunId: row.batch_run_id as string,
    workspaceId: row.workspace_id as string,
    actorId: row.actor_id as string,
    workflowId: row.workflow_id as string,
    presetId: row.preset_id as string,
    backendId: (row.backend_id as string) ?? null,
    status: row.status as string,
    inputParams: safeJson(row.input_params as string, {}),
    submittedPayload: safeJson(row.submitted_payload as string, null),
    externalTaskId: (row.external_task_id as string) ?? null,
    resultJson: safeJson(row.result_json as string, null),
    errorMessage: (row.error_message as string) ?? null,
    scheduleDecision: safeJson(row.schedule_decision as string, null),
    retryCount: Number(row.retry_count),
    maxRetries: Number(row.max_retries),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at || row.created_at),
    startedAt: (row.started_at as number) ?? null,
    finishedAt: (row.finished_at as number) ?? null,
    timeoutSeconds: Number(row.timeout_seconds)
  }
}

// ============================================
// 矩阵生成
// ============================================

export type CombinationMode = 'cartesian' | 'zip' | 'table'

export interface MatrixInput {
  params: Record<string, unknown[]>
  mode: CombinationMode
}

export function generateMatrix(input: MatrixInput): Record<string, unknown>[] {
  const keys = Object.keys(input.params)
  if (keys.length === 0) return [{}]

  if (input.mode === 'cartesian') {
    return cartesianProduct(input.params, keys)
  }

  if (input.mode === 'zip') {
    const maxLen = Math.max(...keys.map(k => (input.params[k] as unknown[]).length))
    const result: Record<string, unknown>[] = []
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, unknown> = {}
      for (const key of keys) {
        const arr = input.params[key] as unknown[]
        row[key] = arr[i % arr.length]
      }
      result.push(row)
    }
    return result
  }

  // table mode: same as zip but strict length
  const len = (input.params[keys[0]!] as unknown[]).length
  const result: Record<string, unknown>[] = []
  for (let i = 0; i < len; i++) {
    const row: Record<string, unknown> = {}
    for (const key of keys) {
      const arr = input.params[key] as unknown[]
      row[key] = arr[i]
    }
    result.push(row)
  }
  return result
}

function cartesianProduct(params: Record<string, unknown[]>, keys: string[]): Record<string, unknown>[] {
  if (keys.length === 0) return [{}]
  const [first, ...rest] = keys
  const firstValues = params[first!] as unknown[]
  const restProduct = cartesianProduct(params, rest)

  const result: Record<string, unknown>[] = []
  for (const val of firstValues) {
    for (const restRow of restProduct) {
      result.push({ [first!]: val, ...restRow })
    }
  }
  return result
}

// ============================================
// 批量运行
// ============================================

export function createBatchRun(input: {
  workspaceId: string
  actorId: string
  presetId: string
  workflowId: string
  name?: string
  combinationMode: CombinationMode
  matrix: Record<string, unknown>[]
  scheduleMode: BackendScheduleMode
}): BatchRunRow {
  const db = getSqlite()
  const batchId = randomUUID()
  const now = Date.now()

  db.prepare(`
    INSERT INTO batch_runs (id, workspace_id, actor_id, preset_id, workflow_id, name, status, combination_mode, total_tasks, completed_tasks, failed_tasks, canceled_tasks, matrix_json, schedule_mode, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, 0, 0, 0, ?, ?, ?, ?)
  `).run(batchId, input.workspaceId, input.actorId, input.presetId, input.workflowId,
    input.name ?? null, input.combinationMode, input.matrix.length,
    JSON.stringify(input.matrix), input.scheduleMode, now, now)

  // Create individual tasks
  for (let i = 0; i < input.matrix.length; i++) {
    const taskId = randomUUID()
    const taskParams = input.matrix[i]!
    db.prepare(`
      INSERT INTO run_tasks (id, batch_run_id, workspace_id, actor_id, workflow_id, preset_id, status, input_params, retry_count, max_retries, created_at, updated_at, timeout_seconds)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, 0, 3, ?, ?, 300)
    `).run(taskId, batchId, input.workspaceId, input.actorId, input.workflowId, input.presetId,
      JSON.stringify({ ...taskParams, _taskIndex: i }), now, now)
    enqueue(taskId)
  }

  return getBatchRun(batchId)!
}

export function getBatchRun(id: string): BatchRunRow | null {
  const db = getSqlite()
  const row = db.prepare('SELECT * FROM batch_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToBatchRun(row) : null
}

export function listBatchRuns(workspaceId: string, limit = 50, offset = 0): BatchRunRow[] {
  const db = getSqlite()
  const rows = db.prepare('SELECT * FROM batch_runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(workspaceId, limit, offset) as Record<string, unknown>[]
  return rows.map(rowToBatchRun)
}

export function cancelBatchRun(id: string): boolean {
  const db = getSqlite()
  const now = Date.now()
  db.prepare("UPDATE run_tasks SET status = 'canceled' WHERE batch_run_id = ? AND status IN ('queued', 'claimed', 'pending')").run(id)
  db.prepare("UPDATE batch_runs SET status = 'canceled', finished_at = ?, updated_at = ? WHERE id = ? AND status NOT IN ('completed', 'failed')").run(now, now, id)
  return true
}

export function getBatchRunTasks(batchRunId: string): RunTaskRow[] {
  const db = getSqlite()
  const rows = db.prepare('SELECT * FROM run_tasks WHERE batch_run_id = ? ORDER BY created_at ASC').all(batchRunId) as Record<string, unknown>[]
  return rows.map(rowToTask)
}

export function getTask(id: string): RunTaskRow | null {
  const db = getSqlite()
  const row = db.prepare('SELECT * FROM run_tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToTask(row) : null
}

export function updateTaskStatus(id: string, status: string, extra?: Record<string, unknown>): void {
  const db = getSqlite()
  const now = Date.now()
  const sets = ['status = ?', 'updated_at = ?']
  const vals: unknown[] = [status, now]

  if (status === 'running') { sets.push('started_at = ?'); vals.push(now) }
  if (['succeeded', 'failed', 'canceled'].includes(status)) { sets.push('finished_at = ?'); vals.push(now) }

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      const column = toTaskColumn(key)
      sets.push(`${column} = ?`)
      vals.push(typeof value === 'object' ? JSON.stringify(value) : value)
    }
  }

  vals.push(id)
  db.prepare(`UPDATE run_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function incrementBatchProgress(batchRunId: string, field: 'completed_tasks' | 'failed_tasks' | 'canceled_tasks'): void {
  const db = getSqlite()
  const now = Date.now()
  db.prepare(`UPDATE batch_runs SET ${field} = ${field} + 1, updated_at = ? WHERE id = ?`).run(now, batchRunId)

  // Check if batch is complete
  const batch = getBatchRun(batchRunId)
  if (batch && batch.completedTasks + batch.failedTasks + batch.canceledTasks >= batch.totalTasks) {
    const finalStatus = batch.failedTasks > 0 ? 'failed' : 'completed'
    db.prepare("UPDATE batch_runs SET status = ?, finished_at = ?, updated_at = ? WHERE id = ? AND status NOT IN ('completed', 'failed', 'canceled')")
      .run(finalStatus, now, now, batchRunId)
  }
}

export function startBatchRun(id: string): void {
  const db = getSqlite()
  const now = Date.now()
  db.prepare("UPDATE batch_runs SET status = 'running', started_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'")
    .run(now, now, id)
}

export function retryFailedTasks(batchRunId: string): number {
  const db = getSqlite()
  const now = Date.now()
  const tasks = db.prepare("SELECT id FROM run_tasks WHERE batch_run_id = ? AND status = 'failed'").all(batchRunId) as Array<{ id: string }>
  if (!tasks.length) return 0

  const retry = db.transaction(() => {
    for (const task of tasks) {
      db.prepare(`
        UPDATE run_tasks
        SET status = 'queued',
            error_message = NULL,
            external_task_id = NULL,
            schedule_decision = NULL,
            retry_count = retry_count + 1,
            started_at = NULL,
            finished_at = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(now, task.id)
      enqueue(task.id)
    }

    db.prepare(`
      UPDATE batch_runs
      SET status = 'queued',
          failed_tasks = MAX(failed_tasks - ?, 0),
          finished_at = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(tasks.length, now, batchRunId)
  })

  retry()
  return tasks.length
}

export function deleteBatchRun(id: string): { deletedTasks: number; deletedResults: number } {
  const db = getSqlite()
  const batch = getBatchRun(id)
  if (!batch) return { deletedTasks: 0, deletedResults: 0 }
  if (['queued', 'running'].includes(batch.status)) {
    throw new Error('Cannot delete a running or queued batch. Cancel it first.')
  }

  const taskRows = db.prepare('SELECT id FROM run_tasks WHERE batch_run_id = ?').all(id) as Array<{ id: string }>
  const resultRows = db.prepare('SELECT storage_driver, storage_key FROM run_results WHERE batch_run_id = ?').all(id) as Array<{
    storage_driver: string
    storage_key: string
  }>

  const remove = db.transaction(() => {
    for (const task of taskRows) {
      db.prepare('DELETE FROM task_queue WHERE task_id = ?').run(task.id)
    }
    db.prepare('DELETE FROM run_results WHERE batch_run_id = ?').run(id)
    db.prepare('DELETE FROM run_tasks WHERE batch_run_id = ?').run(id)
    db.prepare('DELETE FROM batch_runs WHERE id = ?').run(id)
  })

  remove()

  for (const result of resultRows) {
    if (result.storage_driver === 'local' && result.storage_key) {
      try {
        rmSync(result.storage_key, { force: true })
      } catch {
        // Best effort cleanup; database rows are already gone.
      }
    }
  }

  return { deletedTasks: taskRows.length, deletedResults: resultRows.length }
}

export function countFailedTasks(batchRunId: string): number {
  const db = getSqlite()
  const row = db.prepare("SELECT COUNT(*) AS value FROM run_tasks WHERE batch_run_id = ? AND status = 'failed'").get(batchRunId) as { value: number } | undefined
  return Number(row?.value ?? 0)
}

function toTaskColumn(key: string) {
  const columns: Record<string, string> = {
    backendId: 'backend_id',
    submittedPayload: 'submitted_payload',
    externalTaskId: 'external_task_id',
    resultJson: 'result_json',
    errorMessage: 'error_message',
    scheduleDecision: 'schedule_decision',
    retryCount: 'retry_count',
    maxRetries: 'max_retries',
    timeoutSeconds: 'timeout_seconds'
  }
  return columns[key] ?? key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}
