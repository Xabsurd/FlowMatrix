// SPDX-License-Identifier: GPL-3.0-or-later
import { softDeleteResult } from '../../../domain/results'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const success = softDeleteResult(id)
  if (!success) {
    throw createError({ statusCode: 404, message: 'Result not found or already deleted' })
  }
  return { success: true }
})
