// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPreset } from '../../../domain/presets'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const body = await readBody(event)

  if (!body.workflowId || !body.name || !body.nodeParams) {
    throw createError({ statusCode: 400, message: 'workflowId, name, and nodeParams are required' })
  }

  return createPreset({
    workspaceId: ctx.workspaceId,
    workflowId: body.workflowId,
    name: body.name,
    nodeParams: body.nodeParams,
    backendId: body.backendId,
    backendGroupId: body.backendGroupId,
    description: body.description,
    scheduleMode: body.scheduleMode
  })
})