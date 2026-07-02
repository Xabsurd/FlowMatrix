// SPDX-License-Identifier: GPL-3.0-or-later
import { deleteWorkflow } from '../../../domain/workflows'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  if (!deleteWorkflow(id)) throw createError({ statusCode: 404, message: 'Workflow not found' })
  return { ok: true }
})