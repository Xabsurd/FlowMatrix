// SPDX-License-Identifier: GPL-3.0-or-later

export interface BatchRun {
  id: string
  name: string | null
  presetId: string
  workflowId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
  combinationMode: 'cartesian' | 'zip' | 'table'
  totalTasks: number
  completedTasks: number
  failedTasks: number
  canceledTasks: number
  createdAt: number
  finishedAt: number | null
}

export interface Task {
  id: string
  batchRunId: string
  workflowId: string
  presetId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'retrying'
  backendId: string | null
  externalTaskId: string | null
  inputParams: Record<string, unknown>
  errorMessage: string | null
  retryCount: number
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface ResultFile {
  id: string
  taskId: string
  batchRunId?: string
  outputType: string
  fileName: string
  mimeType?: string
  fileSize: number
  metadata: Record<string, unknown> | null
  inputParams?: Record<string, unknown>
  createdAt?: number
}

export interface ResultsResponse {
  results: ResultFile[]
  total: number
  limit: number
  offset: number
}

export interface BatchDetail extends BatchRun {
  tasks: Task[]
  results: ResultFile[]
  taskPage: {
    limit: number
    offset: number
    total: number
  }
  resultStats: {
    totalCount: number
    activeCount: number
    deletedCount: number
    totalSize: number
  }
  taskStatusStats: Partial<Record<Task['status'], number>>
}

export interface ResultFilterValue {
  valueKey: string
  label: string
  count: number
  hidden: boolean
}

export interface ResultFilterGroup {
  key: string
  label: string
  values: ResultFilterValue[]
}
