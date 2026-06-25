// SPDX-License-Identifier: AGPL-3.0-or-later
import { listBackends } from '../../../domain/backends'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler((event) => {
  const ctx = getRequestContext(event)
  return listBackends(ctx.workspaceId)
})