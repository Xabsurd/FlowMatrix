// SPDX-License-Identifier: GPL-3.0-or-later
import { updateWorkflow } from '../../../domain/workflows'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const result = updateWorkflow(id, {
    name: body.name,
    rawJson: body.rawJson,
    metadata: body.metadata
  })
  if (!result) throw createError({ statusCode: 404, message: 'Workflow not found' })
  return result
})
