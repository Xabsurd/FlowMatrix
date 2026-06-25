// SPDX-License-Identifier: AGPL-3.0-or-later
import { getRequestContext } from '../../../domain/context'
import { upsertProviderSettings } from '../../../infrastructure/providers/settings'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const body = await readBody<{
    name?: string
    baseUrl?: string
    defaultModel?: string
    apiKey?: string
  }>(event)

  if (!body.baseUrl?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Base URL is required' })
  }

  if (!body.defaultModel?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Model is required' })
  }

  return upsertProviderSettings({
    workspaceId: ctx.workspaceId,
    providerId: 'openai',
    name: body.name,
    baseUrl: body.baseUrl.trim(),
    defaultModel: body.defaultModel.trim(),
    apiKey: body.apiKey?.trim()
  })
})
