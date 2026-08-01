// SPDX-License-Identifier: GPL-3.0-or-later
import { createBackend } from '../../../domain/backends'
import { getRequestContext } from '../../../domain/context'
import { upsertProviderSettings } from '../../../infrastructure/providers/settings'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const body = await readBody(event)

  if (!body.name || !body.endpoint) {
    throw createError({ statusCode: 400, message: 'name and endpoint are required' })
  }

  const backend = createBackend({
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

  if (body.type === 'provider' && body.apiKey) {
    upsertProviderSettings({
      workspaceId: ctx.workspaceId,
      providerId: body.endpoint,
      name: body.name,
      baseUrl: body.baseUrl || 'https://api.openai.com/v1',
      defaultModel: body.model || 'gpt-image-1',
      apiKey: body.apiKey
    })
  }

  return backend
})