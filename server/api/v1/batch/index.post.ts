// SPDX-License-Identifier: AGPL-3.0-or-later
import { createBatchRun, generateMatrix } from '../../../domain/batch'
import { getRequestContext } from '../../../domain/context'
import type { BackendScheduleMode } from '../../../../shared/types/app'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const body = await readBody(event)

  if (!body.presetId || !body.workflowId || !body.matrix) {
    throw createError({ statusCode: 400, message: 'presetId, workflowId, and matrix are required' })
  }

  const matrix = generateMatrix({
    params: body.matrix.params || {},
    mode: body.matrix.mode || 'cartesian'
  })

  return createBatchRun({
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    presetId: body.presetId,
    workflowId: body.workflowId,
    name: body.name,
    combinationMode: body.matrix.mode || 'cartesian',
    matrix,
    scheduleMode: (body.scheduleMode || 'idle-first') as BackendScheduleMode
  })
})
