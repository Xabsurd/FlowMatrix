// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs'
import { resolve, normalize } from 'node:path'
import { getResult } from '../../../../domain/results'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const result = getResult(id)
  if (!result) throw createError({ statusCode: 404, message: 'Result not found' })

  if (result.storageDriver !== 'local') {
    throw createError({ statusCode: 400, message: 'Only local files can be served directly' })
  }

  const rootDir = resolve(process.cwd(), './data/outputs')
  const filePath = resolve(process.cwd(), result.storageKey)
  
  const normalizedRoot = normalize(rootDir)
  const normalizedFile = normalize(filePath)
  
  if (!normalizedFile.startsWith(normalizedRoot)) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: 'File not found on disk' })
  }

  const query = getQuery(event)
  if (query.download !== undefined) {
    setHeaders(event, {
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`
    })
  }

  setHeaders(event, {
    'Content-Type': result.mimeType || 'image/png',
    'Cache-Control': 'public, max-age=31536000, immutable'
  })

  return readFileSync(filePath)
})
