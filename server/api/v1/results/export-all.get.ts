// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync, existsSync } from 'node:fs'
import { resolve, normalize } from 'node:path'
import { getRequestContext } from '../../../domain/context'
import { getSqlite } from '../../../infrastructure/db/sqlite'
import { getOutputStorageRoot } from '../../../infrastructure/storage/outputs'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const query = getQuery(event)
  const batchRunId = query.batchRunId ? String(query.batchRunId) : null

  if (!batchRunId) {
    throw createError({ statusCode: 400, message: 'batchRunId is required' })
  }

  console.log(`[export-api] Exporting all results for batch: ${batchRunId}`)

  try {
    const db = getSqlite()
    const rows = db.prepare(`
      SELECT id, file_name, storage_key, mime_type
      FROM run_results
      WHERE batch_run_id = ? AND workspace_id = ? AND is_deleted = 0 AND output_type = 'image'
      ORDER BY created_at ASC
    `).all(batchRunId, ctx.workspaceId) as Array<{ id: string; file_name: string; storage_key: string; mime_type: string }>

    console.log(`[export-api] Found ${rows.length} results`)

    if (rows.length === 0) {
      throw createError({ statusCode: 404, message: 'No results found' })
    }

    const storageRoot = getOutputStorageRoot()
    const allowedRoots = [
      storageRoot,
      resolve(storageRoot, 'gpt-image-2'),
      resolve(process.cwd(), './data/outputs')
    ]

    const files: Array<{ name: string; path: string }> = []
    for (const row of rows) {
      const filePath = resolve(process.cwd(), row.storage_key)
      const normalizedFile = normalize(filePath)
      const isAllowed = allowedRoots.some(root => normalizedFile.startsWith(normalize(root)))

      if (isAllowed && existsSync(filePath)) {
        files.push({ name: row.file_name, path: filePath })
      }
    }

    console.log(`[export-api] Found ${files.length} valid files`)

    if (files.length === 0) {
      throw createError({ statusCode: 404, message: 'No valid files found' })
    }

    // Use JSZip to create zip file
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()

    for (const file of files) {
      const buffer = readFileSync(file.path)
      zip.file(file.name, buffer)
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    setHeaders(event, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="export-${batchRunId.slice(0, 8)}.zip"`,
      'Cache-Control': 'no-cache'
    })

    return zipBuffer
  } catch (error) {
    console.error(`[export-api] Error exporting results:`, error)
    throw error
  }
})
