// SPDX-License-Identifier: AGPL-3.0-or-later
import { unlinkSync, existsSync } from 'node:fs'
import { getSqlite } from '../infrastructure/db/sqlite'

export interface RunResult {
  id: string
  taskId: string
  batchRunId: string
  workspaceId: string
  outputType: string
  storageDriver: string
  storageKey: string
  fileName: string
  mimeType: string
  fileSize: number
  fileHash: string | null
  thumbnailKey: string | null
  metadata: Record<string, unknown> | null
  isArchived: boolean
  isDeleted: boolean
  createdAt: number
  deletedAt: number | null
}

function mapResult(row: Record<string, unknown>): RunResult {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    batchRunId: String(row.batch_run_id),
    workspaceId: String(row.workspace_id),
    outputType: String(row.output_type),
    storageDriver: String(row.storage_driver),
    storageKey: String(row.storage_key),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size),
    fileHash: row.file_hash ? String(row.file_hash) : null,
    thumbnailKey: row.thumbnail_key ? String(row.thumbnail_key) : null,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : null,
    isArchived: Boolean(row.is_archived),
    isDeleted: Boolean(row.is_deleted),
    createdAt: Number(row.created_at),
    deletedAt: row.deleted_at ? Number(row.deleted_at) : null
  }
}

export function getBatchResults(batchRunId: string, options?: { limit?: number; offset?: number; includeDeleted?: boolean }) {
  const db = getSqlite()
  const limit = options?.limit || 100
  const offset = options?.offset || 0
  const deletedFilter = options?.includeDeleted ? '' : 'AND is_deleted = 0'

  const rows = db.prepare(`
    SELECT * FROM run_results
    WHERE batch_run_id = ? ${deletedFilter}
    ORDER BY created_at ASC
    LIMIT ? OFFSET ?
  `).all(batchRunId, limit, offset) as Record<string, unknown>[]

  const total = (db.prepare(`
    SELECT COUNT(*) as count FROM run_results
    WHERE batch_run_id = ? ${deletedFilter}
  `).get(batchRunId) as Record<string, unknown>)?.count as number

  return { results: rows.map(mapResult), total, limit, offset }
}

export function listResults(workspaceId: string, options?: { limit?: number; offset?: number; includeDeleted?: boolean; batchRunId?: string; outputType?: string }) {
  const db = getSqlite()
  const limit = options?.limit || 50
  const offset = options?.offset || 0
  
  const conditions = ['workspace_id = ?']
  const vals: unknown[] = [workspaceId]

  if (!options?.includeDeleted) {
    conditions.push('is_deleted = 0')
  }
  
  if (options?.batchRunId) {
    conditions.push('batch_run_id = ?')
    vals.push(options.batchRunId)
  }
  if (options?.outputType) {
    conditions.push('output_type = ?')
    vals.push(options.outputType)
  }
  
  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
  
  const rows = db.prepare(`
    SELECT * FROM run_results
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...vals, limit, offset) as Record<string, unknown>[]
  
  const total = (db.prepare(`
    SELECT COUNT(*) as count FROM run_results
    ${whereClause}
  `).get(...vals) as Record<string, unknown>)?.count as number
  
  return { results: rows.map(mapResult), total, limit, offset }
}

export function getResult(id: string) {
  const row = getSqlite().prepare('SELECT * FROM run_results WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapResult(row) : null
}

export function softDeleteResult(id: string) {
  const result = getSqlite().prepare(`
    UPDATE run_results SET is_deleted = 1, deleted_at = ? WHERE id = ? AND is_deleted = 0
  `).run(Date.now(), id)
  return result.changes > 0
}

export function hardDeleteResult(id: string) {
  const result = getResult(id)
  if (!result) return false

  if (result.storageDriver === 'local' && existsSync(result.storageKey)) {
    try { unlinkSync(result.storageKey) } catch { /* non-critical */ }
  }

  getSqlite().prepare('DELETE FROM run_results WHERE id = ?').run(id)
  return true
}

export function batchSoftDeleteResults(batchRunId: string) {
  const now = Date.now()
  const result = getSqlite().prepare(`
    UPDATE run_results SET is_deleted = 1, deleted_at = ?
    WHERE batch_run_id = ? AND is_deleted = 0
  `).run(now, batchRunId)
  return result.changes
}

export function batchHardDeleteResults(batchRunId: string) {
  const db = getSqlite()
  const rows = db.prepare(`
    SELECT storage_key, storage_driver FROM run_results WHERE batch_run_id = ?
  `).all(batchRunId) as Record<string, unknown>[]

  for (const row of rows) {
    if (row.storage_driver === 'local' && existsSync(String(row.storage_key))) {
      try { unlinkSync(String(row.storage_key)) } catch { /* non-critical */ }
    }
  }

  const result = db.prepare('DELETE FROM run_results WHERE batch_run_id = ?').run(batchRunId)
  return result.changes
}

export function getResultStats(batchRunId: string) {
  const db = getSqlite()
  const stats = db.prepare(`
    SELECT
      COUNT(*) as totalCount,
      SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) as activeCount,
      SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deletedCount,
      SUM(file_size) as totalSize
    FROM run_results WHERE batch_run_id = ?
  `).get(batchRunId) as Record<string, unknown>

  return {
    totalCount: Number(stats.totalCount || 0),
    activeCount: Number(stats.activeCount || 0),
    deletedCount: Number(stats.deletedCount || 0),
    totalSize: Number(stats.totalSize || 0)
  }
}

export function cleanupExpiredResults(daysOld: number) {
  const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000
  const db = getSqlite()

  const rows = db.prepare(`
    SELECT id, storage_key, storage_driver FROM run_results
    WHERE is_deleted = 1 AND deleted_at < ?
  `).all(cutoff) as Record<string, unknown>[]

  for (const row of rows) {
    if (row.storage_driver === 'local' && existsSync(String(row.storage_key))) {
      try { unlinkSync(String(row.storage_key)) } catch { /* non-critical */ }
    }
  }

  const result = db.prepare('DELETE FROM run_results WHERE is_deleted = 1 AND deleted_at < ?').run(cutoff)
  return result.changes
}
