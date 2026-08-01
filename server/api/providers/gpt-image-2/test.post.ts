// SPDX-License-Identifier: GPL-3.0-or-later
import { getRequestContext } from '../../../domain/context'
import { getOnlineProvider } from '../../../infrastructure/providers/registry'
import { getProviderRuntimeConfig } from '../../../infrastructure/providers/settings'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const provider = getOnlineProvider('gpt-image-2')
  return provider.testConnection(getProviderRuntimeConfig(ctx.workspaceId, 'gpt-image-2'))
})
