// SPDX-License-Identifier: AGPL-3.0-or-later
import { softDeleteResult } from '../../../domain/results'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ ids: string[] }>(event)
  if (!body?.ids || !Array.isArray(body.ids)) {
    throw createError({ statusCode: 400, message: 'Invalid or missing result IDs' })
  }
  
  let deletedCount = 0
  for (const id of body.ids) {
    if (softDeleteResult(id)) {
      deletedCount++
    }
  }
  
  return { deletedCount }
})
