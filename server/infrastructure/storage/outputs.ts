// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function getOutputStorageRoot() {
  const config = typeof useRuntimeConfig === 'function'
    ? useRuntimeConfig()
    : { storageRoot: process.env.FLOWMATRIX_STORAGE_ROOT || './data/results' }

  return resolve(process.cwd(), config.storageRoot)
}

export function ensureBatchImageOutputDir(params: {
  batchRunId: string
  createdAt?: number
}) {
  const date = new Date(params.createdAt || Date.now())
  const year = String(date.getFullYear())
  const month = padDatePart(date.getMonth() + 1)
  const day = padDatePart(date.getDate())
  const dir = join(getOutputStorageRoot(), year, month, day, params.batchRunId)

  mkdirSync(dir, { recursive: true })
  return dir
}

export function sanitizeOutputFileName(fileName: string) {
  return fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    || 'output'
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}
