// SPDX-License-Identifier: GPL-3.0-or-later
import { updatePreset } from '../../../domain/presets'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const result = updatePreset(id, body)
  if (!result) throw createError({ statusCode: 404, message: 'Preset not found' })
  return result
})