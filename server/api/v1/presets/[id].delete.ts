// SPDX-License-Identifier: AGPL-3.0-or-later
import { deletePreset } from '../../../domain/presets'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  if (!deletePreset(id)) throw createError({ statusCode: 404, message: 'Preset not found' })
  return { ok: true }
})