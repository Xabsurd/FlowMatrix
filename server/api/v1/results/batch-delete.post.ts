// SPDX-License-Identifier: AGPL-3.0-or-later
import { batchSoftDeleteResults, softDeleteResult } from '../../../domain/results'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ ids?: string[]; batchRunId?: string }>(event)

  if (body?.batchRunId) {
    return { deletedCount: batchSoftDeleteResults(body.batchRunId) }
  }

  if (!body?.ids || !Array.isArray(body.ids)) {
    throw createError({ statusCode: 400, message: 'Invalid or missing result IDs or batchRunId' })
  }
  
  let deletedCount = 0
  for (const id of body.ids) {
    if (softDeleteResult(id)) {
      deletedCount++
    }
  }
  
  return { deletedCount }
})
