// SPDX-License-Identifier: AGPL-3.0-or-later
import { createBackend } from '../../../domain/backends'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const body = await readBody(event)

  if (!body.name || !body.endpoint) {
    throw createError({ statusCode: 400, message: 'name and endpoint are required' })
  }

  return createBackend({
    workspaceId: ctx.workspaceId,
    type: body.type || 'comfyui',
    name: body.name,
    endpoint: body.endpoint,
    groupId: body.groupId,
    weight: body.weight,
    maxConcurrency: body.maxConcurrency,
    tags: body.tags,
    capabilities: body.capabilities
  })
})