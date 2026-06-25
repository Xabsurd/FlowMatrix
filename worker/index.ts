// SPDX-License-Identifier: AGPL-3.0-or-later
import * as queue from '../server/domain/queue'
import { executeComfyUITask } from './comfyui-executor'
import { startBatchRun, updateTaskStatus, incrementBatchProgress } from '../server/domain/batch'
import { getSqlite } from '../server/infrastructure/db/sqlite'

const WORKER_ID = `worker-${process.pid}`
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 1500)

async function runOnce() {
  queue.releaseStale()
  const queueJob = queue.claimNext(WORKER_ID)
  if (queueJob) {
    const db = getSqlite()
    const task = db.prepare('SELECT * FROM run_tasks WHERE id = ?').get(queueJob.taskId) as Record<string, unknown> | undefined
    if (task) {
      const batchRunId = task.batch_run_id as string
      startBatchRun(batchRunId)
      try {
        queue.markProcessing(queueJob.id)
        await executeComfyUITask(queueJob.taskId)
        queue.markCompleted(queueJob.id)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        queue.markFailed(queueJob.id, msg)
        updateTaskStatus(queueJob.taskId, 'failed', { errorMessage: msg })
        incrementBatchProgress(batchRunId, 'failed_tasks')
      }
      return
    }
  }
}

async function loop() {
  console.log(`FlowMatrix worker started. Poll interval: ${pollIntervalMs}ms`)

  while (true) {
    await runOnce()
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}

loop().catch((error) => {
  console.error(error)
  process.exit(1)
})
