// SPDX-License-Identifier: GPL-3.0-or-later
import { createBatchRun, generateMatrix } from '../../../domain/batch'
import { getBackend } from '../../../domain/backends'
import { getRequestContext } from '../../../domain/context'
import type { BackendScheduleMode } from '../../../../shared/types/app'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const body = await readBody(event)

  if (!body.presetId || !body.workflowId || !body.matrix) {
    throw createError({ statusCode: 400, message: 'presetId, workflowId, and matrix are required' })
  }

  const requestedBackendId = body.backendId ? String(body.backendId) : ''
  if (requestedBackendId) {
    const backend = getBackend(requestedBackendId)
    if (!backend || backend.workspaceId !== ctx.workspaceId || !['comfyui', 'provider'].includes(backend.type)) {
      throw createError({ statusCode: 400, message: '指定的执行后端不存在' })
    }
    if (!backend.enabled || backend.paused) {
      throw createError({ statusCode: 400, message: '指定的执行后端已禁用或暂停' })
    }
  }

  const matrix = generateMatrix({
    params: body.matrix.params || {},
    mode: body.matrix.mode || 'cartesian'
  }).map(row => requestedBackendId ? { ...row, _backendId: requestedBackendId } : row)

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
