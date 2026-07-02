// SPDX-License-Identifier: GPL-3.0-or-later
import { listBatchRuns } from '../../../domain/batch'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler((event) => {
  const ctx = getRequestContext(event)
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100)
  const offset = Math.max(Number(query.offset) || 0, 0)
  return listBatchRuns(ctx.workspaceId, limit, offset)
})
