// SPDX-License-Identifier: AGPL-3.0-or-later
import { openaiProviderAdapter } from './openai'
import { createError } from 'h3'
import type { OnlineProviderAdapter } from './types'

const providerAdapters = new Map<string, OnlineProviderAdapter>([
  [openaiProviderAdapter.descriptor.id, openaiProviderAdapter]
])

export function listOnlineProviders() {
  return Array.from(providerAdapters.values()).map((adapter) => adapter.descriptor)
}

export function getOnlineProvider(providerId: string) {
  const adapter = providerAdapters.get(providerId)
  if (!adapter) {
    throw createError({
      statusCode: 404,
      statusMessage: `Unknown provider: ${providerId}`
    })
  }

  return adapter
}
