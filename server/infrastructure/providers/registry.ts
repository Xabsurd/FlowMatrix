// SPDX-License-Identifier: GPL-3.0-or-later
import { openaiProviderAdapter } from './openai'
import { createError } from 'h3'
import type { OnlineProviderAdapter } from './types'

const providerAdapters = new Map<string, OnlineProviderAdapter>([
  [openaiProviderAdapter.descriptor.id, openaiProviderAdapter]
])

export function normalizeProviderId(endpointOrProviderId: string | null | undefined) {
  const value = endpointOrProviderId?.trim().toLowerCase() || ''
  return value && !value.startsWith('http') ? value : openaiProviderAdapter.descriptor.id
}

export function listOnlineProviders() {
  return Array.from(providerAdapters.values()).map((adapter) => adapter.descriptor)
}

export function getOnlineProvider(providerId: string) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const adapter = providerAdapters.get(normalizedProviderId)
  if (!adapter) {
    throw createError({
      statusCode: 404,
      statusMessage: `Unknown provider: ${providerId}`
    })
  }

  return adapter
}
