// SPDX-License-Identifier: AGPL-3.0-or-later
import { listWorkflows } from '../../../domain/workflows'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler((event) => {
  const ctx = getRequestContext(event)
  return listWorkflows(ctx.workspaceId)
})