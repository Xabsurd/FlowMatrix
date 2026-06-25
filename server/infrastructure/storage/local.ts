// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface StoredObject {
  storage: 'local'
  relativePath: string
  absolutePath: string
  size: number
  mimeType: string
}

function getStorageRoot() {
  const config = typeof useRuntimeConfig === 'function'
    ? useRuntimeConfig()
    : { storageRoot: process.env.FLOWMATRIX_STORAGE_ROOT || './data/results' }

  return resolve(process.cwd(), config.storageRoot)
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return 'jpg'
  }

  if (mimeType === 'image/webp') {
    return 'webp'
  }

  return 'png'
}

export function saveBase64Artifact(params: {
  taskId: string
  index: number
  mimeType: string
  b64Json: string
}): StoredObject {
  const root = getStorageRoot()
  const ext = extensionForMime(params.mimeType)
  const relativePath = join('tasks', params.taskId, `image-${params.index}.${ext}`)
  const absolutePath = join(root, relativePath)
  const buffer = Buffer.from(params.b64Json, 'base64')

  mkdirSync(join(root, 'tasks', params.taskId), { recursive: true })
  writeFileSync(absolutePath, buffer)

  return {
    storage: 'local',
    relativePath: relativePath.replace(/\\/g, '/'),
    absolutePath,
    size: buffer.byteLength,
    mimeType: params.mimeType
  }
}
