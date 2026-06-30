// SPDX-License-Identifier: AGPL-3.0-or-later
import { getBatchRun } from '../../../domain/batch'
import { getSqlite } from '../../../infrastructure/db/sqlite'
import { getResultStats } from '../../../domain/results'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const query = getQuery(event)
  const taskLimit = Math.min(Math.max(Number(query.taskLimit) || 50, 1), 100)
  const taskOffset = Math.max(Number(query.taskOffset) || 0, 0)
  const batch = getBatchRun(id)
  if (!batch) throw createError({ statusCode: 404, message: 'Batch run not found' })

  const db = getSqlite()
  const tasks = db.prepare(`
    SELECT id, batch_run_id, workflow_id, preset_id, status, backend_id, external_task_id,
           input_params, result_json, error_message, retry_count,
           created_at, started_at, finished_at
    FROM run_tasks
    WHERE batch_run_id = ?
    ORDER BY json_extract(input_params, '$._taskIndex') ASC, created_at ASC, rowid ASC
    LIMIT ? OFFSET ?
  `).all(id, taskLimit, taskOffset) as Record<string, unknown>[]

  const resultStats = getResultStats(id)
  const taskStatusRows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM run_tasks
    WHERE batch_run_id = ?
    GROUP BY status
  `).all(id) as Array<{ status: string; count: number }>
  const taskStatusStats = Object.fromEntries(
    taskStatusRows.map(row => [row.status, Number(row.count)])
  )

  const taskIds = tasks.map(task => String(task.id))
  const results = taskIds.length
    ? db.prepare(`
      SELECT id, task_id, output_type, file_name, file_size, metadata
      FROM run_results
      WHERE batch_run_id = ?
        AND is_deleted = 0
        AND task_id IN (${taskIds.map(() => '?').join(',')})
      ORDER BY created_at ASC
    `).all(id, ...taskIds) as Record<string, unknown>[]
    : []

  return {
    ...batch,
    taskPage: {
      limit: taskLimit,
      offset: taskOffset,
      total: batch.totalTasks
    },
    tasks: tasks.map(t => ({
      id: String(t.id),
      batchRunId: String(t.batch_run_id),
      workflowId: String(t.workflow_id),
      presetId: String(t.preset_id),
      status: String(t.status),
      backendId: t.backend_id ? String(t.backend_id) : null,
      externalTaskId: t.external_task_id ? String(t.external_task_id) : null,
      inputParams: t.input_params ? JSON.parse(String(t.input_params)) : {},
      resultJson: t.result_json ? JSON.parse(String(t.result_json)) : null,
      errorMessage: t.error_message ? String(t.error_message) : null,
      retryCount: Number(t.retry_count),
      createdAt: Number(t.created_at),
      startedAt: t.started_at ? Number(t.started_at) : null,
      finishedAt: t.finished_at ? Number(t.finished_at) : null
    })),
    results: results.map(r => ({
      id: String(r.id),
      taskId: String(r.task_id),
      outputType: String(r.output_type),
      fileName: String(r.file_name),
      fileSize: Number(r.file_size),
      metadata: r.metadata ? JSON.parse(String(r.metadata)) : null
    })),
    resultStats,
    taskStatusStats
  }
})
