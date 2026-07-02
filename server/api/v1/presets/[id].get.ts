// SPDX-License-Identifier: GPL-3.0-or-later
import { getPreset } from '../../../domain/presets'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const preset = getPreset(id)
  if (!preset) throw createError({ statusCode: 404, message: 'Preset not found' })
  return preset
})