// SPDX-License-Identifier: AGPL-3.0-or-later
import { deleteBatchRun } from '../../../domain/batch'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  try {
    const result = deleteBatchRun(id)
    if (result.deletedTasks === 0 && result.deletedResults === 0) {
      throw createError({ statusCode: 404, message: 'Batch not found' })
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('running or queued')) {
      throw createError({ statusCode: 409, message: '请先取消运行中的队列，再删除。' })
    }
    throw error
  }
})
