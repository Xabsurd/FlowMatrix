// SPDX-License-Identifier: GPL-3.0-or-later
import { cancelBatchRun } from '../../../../domain/batch'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const success = cancelBatchRun(id)
  if (!success) throw createError({ statusCode: 404, message: 'Batch run not found' })
  return { success }
})
