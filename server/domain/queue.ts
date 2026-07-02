// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto'
import { getSqlite } from '../infrastructure/db/sqlite'

export interface QueueJob {
  id: string
  taskId: string
  priority: number
  status: 'pending' | 'claimed' | 'processing' | 'completed' | 'failed'
  claimedBy: string | null
  claimedAt: number | null
  attempts: number
  maxAttempts: number
  error: string | null
  createdAt: number
  updatedAt: number
}

export function enqueue(taskId: string, priority = 0): QueueJob {
  const db = getSqlite()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(`
    INSERT INTO task_queue (id, task_id, priority, status, attempts, max_attempts, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', 0, 3, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      priority = excluded.priority,
      status = 'pending',
      claimed_by = NULL,
      claimed_at = NULL,
      attempts = 0,
      error = NULL,
      updated_at = excluded.updated_at
  `).run(id, taskId, priority, now, now)
  return getJob(id) ?? getJobByTask(taskId)!
}

export function claimNext(workerId: string): QueueJob | null {
  const db = getSqlite()
  const now = Date.now()
  const row = db.prepare(`
    SELECT id FROM task_queue
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
  `).get() as { id: string } | undefined

  if (!row) return null

  db.prepare(`
    UPDATE task_queue SET status = 'claimed', claimed_by = ?, claimed_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `).run(workerId, now, now, row.id)

  const claimed = db.prepare('SELECT * FROM task_queue WHERE id = ?').get(row.id) as Record<string, unknown> | undefined
  if (!claimed) return null

  return rowToJob(claimed)
}

export function claimPendingBatchJobs(batchRunId: string, workerId: string): QueueJob[] {
  const db = getSqlite()
  const now = Date.now()
  const rows = db.prepare(`
    SELECT q.id
    FROM task_queue q
    INNER JOIN run_tasks t ON t.id = q.task_id
    WHERE t.batch_run_id = ? AND q.status = 'pending'
    ORDER BY q.priority DESC, q.created_at ASC
  `).all(batchRunId) as Array<{ id: string }>

  if (!rows.length) return []

  const claim = db.prepare(`
    UPDATE task_queue SET status = 'claimed', claimed_by = ?, claimed_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `)
  for (const row of rows) claim.run(workerId, now, now, row.id)

  const ids = rows.map(() => '?').join(',')
  const claimedRows = db.prepare(`SELECT * FROM task_queue WHERE id IN (${ids}) AND claimed_by = ?`)
    .all(...rows.map(row => row.id), workerId) as Record<string, unknown>[]
  return claimedRows.map(rowToJob)
}

export function markProcessing(jobId: string): void {
  const db = getSqlite()
  db.prepare("UPDATE task_queue SET status = 'processing', updated_at = ? WHERE id = ?").run(Date.now(), jobId)
}

export function markCompleted(jobId: string): void {
  const db = getSqlite()
  db.prepare("UPDATE task_queue SET status = 'completed', updated_at = ? WHERE id = ?").run(Date.now(), jobId)
}

export function markFailed(jobId: string, error: string): void {
  const db = getSqlite()
  const job = getJob(jobId)
  if (!job) return
  if (job.attempts + 1 < job.maxAttempts) {
    db.prepare("UPDATE task_queue SET status = 'pending', attempts = attempts + 1, error = ?, updated_at = ? WHERE id = ?")
      .run(error, Date.now(), jobId)
  } else {
    db.prepare("UPDATE task_queue SET status = 'failed', attempts = attempts + 1, error = ?, updated_at = ? WHERE id = ?")
      .run(error, Date.now(), jobId)
  }
}

export function releaseStale(maxAgeMs = 30 * 60_000): number {
  const db = getSqlite()
  const cutoff = Date.now() - maxAgeMs
  const result = db.prepare(`
    UPDATE task_queue SET status = 'pending', claimed_by = NULL, claimed_at = NULL, updated_at = ?
    WHERE status = 'claimed' AND claimed_at < ?
  `).run(Date.now(), cutoff)
  return result.changes
}

export function getJob(id: string): QueueJob | null {
  const db = getSqlite()
  const row = db.prepare('SELECT * FROM task_queue WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToJob(row) : null
}

export function getJobByTask(taskId: string): QueueJob | null {
  const db = getSqlite()
  const row = db.prepare('SELECT * FROM task_queue WHERE task_id = ?').get(taskId) as Record<string, unknown> | undefined
  return row ? rowToJob(row) : null
}

export function queueStats(): { pending: number; processing: number; completed: number; failed: number } {
  const db = getSqlite()
  const rows = db.prepare('SELECT status, COUNT(*) as count FROM task_queue GROUP BY status').all() as Array<{ status: string; count: number }>
  const stats = { pending: 0, processing: 0, completed: 0, failed: 0 }
  for (const r of rows) {
    if (r.status === 'pending' || r.status === 'claimed') stats.pending += r.count
    else if (r.status === 'processing') stats.processing += r.count
    else if (r.status === 'completed') stats.completed += r.count
    else if (r.status === 'failed') stats.failed += r.count
  }
  return stats
}

function rowToJob(row: Record<string, unknown>): QueueJob {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    priority: Number(row.priority),
    status: row.status as QueueJob['status'],
    claimedBy: (row.claimed_by as string) ?? null,
    claimedAt: (row.claimed_at as number) ?? null,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    error: (row.error as string) ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}
