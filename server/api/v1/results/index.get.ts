// SPDX-License-Identifier: AGPL-3.0-or-later
import { listResults } from '../../../domain/results'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler((event) => {
  const ctx = getRequestContext(event)
  const query = getQuery(event)
  
  const limit = Number(query.limit) || 50
  const offset = Number(query.offset) || 0
  const batchRunId = query.batchRunId ? String(query.batchRunId) : undefined
  const outputType = query.outputType ? String(query.outputType) : undefined
  
  return listResults(ctx.workspaceId, {
    limit,
    offset,
    batchRunId,
    outputType,
    includeDeleted: query.includeDeleted === 'true'
  })
})
