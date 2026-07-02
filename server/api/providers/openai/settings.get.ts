// SPDX-License-Identifier: GPL-3.0-or-later
import { getRequestContext } from '../../../domain/context'
import { getProviderSettings } from '../../../infrastructure/providers/settings'

export default defineEventHandler((event) => {
  const ctx = getRequestContext(event)
  return getProviderSettings(ctx.workspaceId, 'openai')
})
