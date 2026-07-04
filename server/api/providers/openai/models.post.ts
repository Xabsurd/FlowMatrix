// SPDX-License-Identifier: GPL-3.0-or-later
import { getRequestContext } from '../../../domain/context'
import { getOnlineProvider } from '../../../infrastructure/providers/registry'
import { resolveProviderRuntimeConfig } from '../../../infrastructure/providers/settings'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const body = await readBody<{
    baseUrl?: string
    model?: string
    apiKey?: string
  }>(event)

  const provider = getOnlineProvider('openai')
  const models = await provider.listImageModels(resolveProviderRuntimeConfig({
    workspaceId: ctx.workspaceId,
    providerId: 'openai',
    baseUrl: body.baseUrl,
    model: body.model,
    apiKey: body.apiKey
  }))

  return { models }
})