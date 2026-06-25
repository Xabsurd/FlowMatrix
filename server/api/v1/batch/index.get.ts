// SPDX-License-Identifier: AGPL-3.0-or-later
import { listBatchRuns } from '../../../domain/batch'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler((event) => {
  const ctx = getRequestContext(event)
  const limit = Number(getQuery(event).limit) || 50
  const offset = Number(getQuery(event).offset) || 0
  return listBatchRuns(ctx.workspaceId, limit, offset)
})