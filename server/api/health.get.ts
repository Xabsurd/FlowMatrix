// SPDX-License-Identifier: AGPL-3.0-or-later
import { getRequestContext } from '../domain/context'
import { getSqlite } from '../infrastructure/db/sqlite'

export default defineEventHandler((event) => {
  const ctx = getRequestContext(event)
  const db = getSqlite()
  let database = 'ok'

  try {
    db.prepare('SELECT 1').get()
  } catch (error) {
    database = error instanceof Error ? error.message : 'failed'
  }

  const count = (sql: string, ...params: unknown[]) => {
    try {
      const row = db.prepare(sql).get(...params) as { value?: number } | undefined
      return Number(row?.value || 0)
    } catch {
      return 0
    }
  }

  const taskStatuses = {
    queued: count("SELECT COUNT(*) AS value FROM run_tasks WHERE workspace_id = ? AND status IN ('queued', 'pending', 'claimed')", ctx.workspaceId),
    running: count("SELECT COUNT(*) AS value FROM run_tasks WHERE workspace_id = ? AND status = 'running'", ctx.workspaceId),
    succeeded: count("SELECT COUNT(*) AS value FROM run_tasks WHERE workspace_id = ? AND status = 'succeeded'", ctx.workspaceId),
    failed: count("SELECT COUNT(*) AS value FROM run_tasks WHERE workspace_id = ? AND status = 'failed'", ctx.workspaceId),
    canceled: count("SELECT COUNT(*) AS value FROM run_tasks WHERE workspace_id = ? AND status = 'canceled'", ctx.workspaceId)
  }

  return {
    ok: database === 'ok',
    mode: ctx.mode,
    actorId: ctx.actorId,
    workspaceId: ctx.workspaceId,
    database,
    queue: 'sqlite-lite',
    stats: {
      backends: count('SELECT COUNT(*) AS value FROM backends WHERE workspace_id = ?', ctx.workspaceId),
      healthyBackends: count("SELECT COUNT(*) AS value FROM backends WHERE workspace_id = ? AND enabled = 1 AND paused = 0", ctx.workspaceId),
      workflows: count('SELECT COUNT(*) AS value FROM workflows WHERE workspace_id = ?', ctx.workspaceId),
      presets: count('SELECT COUNT(*) AS value FROM call_presets WHERE workspace_id = ?', ctx.workspaceId),
      batches: count('SELECT COUNT(*) AS value FROM batch_runs WHERE workspace_id = ?', ctx.workspaceId),
      results: count('SELECT COUNT(*) AS value FROM run_results WHERE workspace_id = ? AND is_deleted = 0', ctx.workspaceId),
      storageBytes: count('SELECT COALESCE(SUM(file_size), 0) AS value FROM run_results WHERE workspace_id = ? AND is_deleted = 0', ctx.workspaceId),
      queuePending: count("SELECT COUNT(*) AS value FROM task_queue WHERE status IN ('queued', 'pending')"),
      queueClaimed: count("SELECT COUNT(*) AS value FROM task_queue WHERE status = 'claimed'"),
      taskStatuses
    }
  }
})
