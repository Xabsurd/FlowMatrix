// SPDX-License-Identifier: AGPL-3.0-or-later
import { createWorkflow } from '../../../domain/workflows'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const body = await readBody(event)

  if (!body.name || !body.rawJson) {
    throw createError({ statusCode: 400, message: 'name and rawJson are required' })
  }

  return createWorkflow({
    workspaceId: ctx.workspaceId,
    name: body.name,
    rawJson: body.rawJson,
    metadata: body.metadata
  })
})