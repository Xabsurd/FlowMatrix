// SPDX-License-Identifier: GPL-3.0-or-later
import { listPresets } from '../../../domain/presets'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler((event) => {
  const ctx = getRequestContext(event)
  return listPresets(ctx.workspaceId)
})