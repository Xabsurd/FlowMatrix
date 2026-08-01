// SPDX-License-Identifier: GPL-3.0-or-later
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

  return upsertProviderSettings({
    workspaceId: ctx.workspaceId,
    providerId: 'gpt-image-2',
    name: body.name || 'GPT Image 2',
    baseUrl: body.baseUrl?.trim() || 'https://api.openai.com/v1',
    defaultModel: body.defaultModel?.trim() || 'gpt-image-1',
    apiKey: body.apiKey?.trim()
  })
})
