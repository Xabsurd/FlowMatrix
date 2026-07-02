// SPDX-License-Identifier: GPL-3.0-or-later
import * as queue from '../server/domain/queue'
import { executeComfyUITask } from './comfyui-executor'
import { executeProviderTask } from './provider-executor'
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
      const batchJobs = [queueJob, ...queue.claimPendingBatchJobs(batchRunId, WORKER_ID)]
      console.log(`Claimed ${batchJobs.length} task(s) for batch ${batchRunId.slice(0, 8)}. Submitting prompts together.`)
      await Promise.all(batchJobs.map(job => executeJob(job, batchRunId)))
      return
    }
  }
}

async function executeJob(queueJob: queue.QueueJob, batchRunId: string) {
  try {
    queue.markProcessing(queueJob.id)
    await executeTask(queueJob.taskId)
    queue.markCompleted(queueJob.id)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    queue.markFailed(queueJob.id, msg)
    updateTaskStatus(queueJob.taskId, 'failed', { errorMessage: msg })
    incrementBatchProgress(batchRunId, 'failed_tasks')
  }
}

async function executeTask(taskId: string) {
  const db = getSqlite()
  const task = db.prepare('SELECT preset_id, input_params, workspace_id FROM run_tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined
  if (!task) throw new Error(`Task ${taskId} not found`)

  const inputParams = JSON.parse((task.input_params as string) || '{}') as Record<string, unknown>
  const requestedBackendId = typeof inputParams._backendId === 'string' ? inputParams._backendId : ''
  const preset = db.prepare('SELECT backend_id FROM call_presets WHERE id = ?').get(task.preset_id as string) as { backend_id?: string | null } | undefined
  const backendId = requestedBackendId || preset?.backend_id || ''
  const backend = backendId
    ? db.prepare('SELECT type FROM backends WHERE id = ? AND workspace_id = ?').get(backendId, task.workspace_id as string) as { type?: string } | undefined
    : undefined

  if (backend?.type === 'provider') {
    await executeProviderTask(taskId)
    return
  }

  await executeComfyUITask(taskId)
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
