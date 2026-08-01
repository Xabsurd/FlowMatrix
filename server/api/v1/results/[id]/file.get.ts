// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs'
import { resolve, normalize, join } from 'node:path'
import { getResult } from '../../../../domain/results'
import { getOutputStorageRoot } from '../../../../infrastructure/storage/outputs'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  console.log(`[file-api] Fetching file for result: ${id}`)
  
  try {
    const result = getResult(id)
    if (!result) {
      console.error(`[file-api] Result not found: ${id}`)
      throw createError({ statusCode: 404, message: 'Result not found' })
    }

    console.log(`[file-api] Found result: ${result.id}, storageDriver: ${result.storageDriver}, storageKey: ${result.storageKey}`)

    if (result.storageDriver !== 'local') {
      console.error(`[file-api] Unsupported storage driver: ${result.storageDriver}`)
      throw createError({ statusCode: 400, message: 'Only local files can be served directly' })
    }

    const storageRoot = getOutputStorageRoot()
    const allowedRoots = [
      storageRoot,
      join(storageRoot, 'gpt-image-2'),
      resolve(process.cwd(), './data/outputs')
    ]
    const filePath = resolve(process.cwd(), result.storageKey)
    
    const normalizedFile = normalize(filePath)
    const isAllowed = allowedRoots.some(root => normalizedFile.startsWith(normalize(root)))
    
    console.log(`[file-api] filePath: ${filePath}`)
    console.log(`[file-api] allowedRoots: ${allowedRoots}`)
    console.log(`[file-api] isAllowed: ${isAllowed}`)
    
    if (!isAllowed) {
      console.error(`[file-api] Access denied for path: ${filePath}`)
      throw createError({ statusCode: 403, message: 'Access denied' })
    }

    if (!existsSync(filePath)) {
      console.error(`[file-api] File not found: ${filePath}`)
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
  } catch (error) {
    console.error(`[file-api] Error fetching file ${id}:`, error)
    throw error
  }
})
