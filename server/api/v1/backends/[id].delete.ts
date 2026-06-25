// SPDX-License-Identifier: AGPL-3.0-or-later
import { deleteBackend } from '../../../domain/backends'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  if (!deleteBackend(id)) throw createError({ statusCode: 404, message: 'Backend not found' })
  return { ok: true }
})