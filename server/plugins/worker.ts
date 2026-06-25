// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()

  if (
    config.public.mode !== 'lan' ||
    process.env.FLOWMATRIX_DISABLE_WORKER === '1' ||
    process.env.npm_lifecycle_event === 'dev:web'
  ) {
    return
  }

  const tsxCli = resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs')
  const workerEntry = resolve(process.cwd(), 'worker/index.ts')

  if (!existsSync(tsxCli) || !existsSync(workerEntry)) {
    console.warn('[FlowMatrix] Worker auto-start skipped: missing tsx or worker entry.')
    return
  }

  const workerProcess = spawn(process.execPath, [tsxCli, workerEntry], {
    stdio: 'inherit',
    shell: false,
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: config.databaseUrl,
      FLOWMATRIX_STORAGE_ROOT: config.storageRoot
    }
  })

  workerProcess.on('error', (err) => {
    console.error('[FlowMatrix] Failed to start worker process:', err)
  })

  process.once('exit', () => {
    workerProcess.kill()
  })
})
