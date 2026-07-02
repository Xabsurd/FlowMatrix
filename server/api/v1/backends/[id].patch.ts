// SPDX-License-Identifier: GPL-3.0-or-later
import { updateBackend } from '../../../domain/backends'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const result = updateBackend(id, body)
  if (!result) throw createError({ statusCode: 404, message: 'Backend not found' })
  return result
})