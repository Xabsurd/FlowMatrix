// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { getRequestContext } from '../../../domain/context'

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, message: 'No files uploaded' })
  }

  const dir = resolve(process.cwd(), 'data/runtime-assets', ctx.workspaceId)
  mkdirSync(dir, { recursive: true })

  const files = form.filter(part => part.name === 'files' && part.filename && part.data?.length)
  if (!files.length) {
    throw createError({ statusCode: 400, message: 'No files uploaded' })
  }

  return files.map((part) => {
    const ext = normalizeExt(part.filename || '')
    const fileName = `${randomUUID()}${ext}`
    const storageKey = join(dir, fileName)
    writeFileSync(storageKey, part.data)

    return {
      storageDriver: 'local',
      storageKey,
      fileName: part.filename,
      mimeType: part.type || 'application/octet-stream',
      fileSize: part.data.length
    }
  })
})

function normalizeExt(fileName: string) {
  const ext = extname(fileName).toLowerCase()
  if (!ext || ext.length > 16) return ''
  return /^[.\w-]+$/.test(ext) ? ext : ''
}
