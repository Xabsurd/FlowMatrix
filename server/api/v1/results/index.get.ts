// SPDX-License-Identifier: GPL-3.0-or-later
import { listResults } from '../../../domain/results'
import { getRequestContext } from '../../../domain/context'
import { getSqlite } from '../../../infrastructure/db/sqlite'

export default defineEventHandler((event) => {
  const ctx = getRequestContext(event)
  const query = getQuery(event)
  
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100)
  const offset = Math.max(Number(query.offset) || 0, 0)
  const batchRunId = query.batchRunId ? String(query.batchRunId) : undefined
  const outputType = query.outputType ? String(query.outputType) : undefined
  
  console.log(`[results-api] Listing results for workspace: ${ctx.workspaceId}, batchRunId: ${batchRunId}`)
  
  try {
    const response = listResults(ctx.workspaceId, {
      limit,
      offset,
      batchRunId,
      outputType,
      includeDeleted: query.includeDeleted === 'true'
    })

    console.log(`[results-api] Found ${response.results.length} results`)

    if (query.includeTaskParams !== 'true' || !response.results.length) return response

    const db = getSqlite()
    const taskIds = Array.from(new Set(response.results.map(result => result.taskId)))
    const rows = db.prepare(`
      SELECT id, input_params FROM run_tasks
      WHERE id IN (${taskIds.map(() => '?').join(',')})
    `).all(...taskIds) as Record<string, unknown>[]
    const paramsByTask = new Map(rows.map(row => [
      String(row.id),
      row.input_params ? JSON.parse(String(row.input_params)) as Record<string, unknown> : {}
    ]))

    return {
      ...response,
      results: response.results.map(result => ({
        ...result,
        inputParams: paramsByTask.get(result.taskId) ?? {}
      }))
    }
  } catch (error) {
    console.error(`[results-api] Error listing results:`, error)
    throw error
  }
})
