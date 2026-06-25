// SPDX-License-Identifier: AGPL-3.0-or-later
import { getBatchRun } from '../../../domain/batch'
import { getSqlite } from '../../../infrastructure/db/sqlite'
import { getResultStats } from '../../../domain/results'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const batch = getBatchRun(id)
  if (!batch) throw createError({ statusCode: 404, message: 'Batch run not found' })

  // Get tasks for this batch
  const db = getSqlite()
  const tasks = db.prepare(`
    SELECT id, batch_run_id, workflow_id, preset_id, status, backend_id,
           input_params, result_json, error_message, retry_count,
           created_at, started_at, finished_at
    FROM run_tasks
    WHERE batch_run_id = ?
    ORDER BY created_at ASC
  `).all(id) as Record<string, unknown>[]

  const resultStats = getResultStats(id)
  
  const results = db.prepare(`
    SELECT id, task_id, output_type, file_name, file_size, metadata
    FROM run_results
    WHERE batch_run_id = ? AND is_deleted = 0
  `).all(id) as Record<string, unknown>[]

  return {
    ...batch,
    tasks: tasks.map(t => ({
      id: String(t.id),
      batchRunId: String(t.batch_run_id),
      workflowId: String(t.workflow_id),
      presetId: String(t.preset_id),
      status: String(t.status),
      backendId: t.backend_id ? String(t.backend_id) : null,
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
    resultStats
  }
})