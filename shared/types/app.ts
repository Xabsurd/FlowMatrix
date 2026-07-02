// SPDX-License-Identifier: GPL-3.0-or-later
export type RuntimeMode = 'lan' | 'cloud'

export interface RequestContext {
  mode: RuntimeMode
  actorId: string
  workspaceId: string
  locale: string
  permissions: string[]
}

export interface AppLocale {
  code: string
  name: string
  nativeName: string
  enabled: boolean
  fallback?: string
}

export interface AppTheme {
  id: string
  nameKey: string
  mode: 'light' | 'dark' | 'auto' | 'custom'
  enabled: boolean
  palette: Record<string, string>
}

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceling'
  | 'canceled'
  | 'retrying'

export type ExecutionBackendType = 'comfyui' | 'provider'

export interface ExecutionBackend {
  id: string
  groupId?: string
  type: ExecutionBackendType
  name: string
  endpoint: string
  enabled: boolean
  weight: number
  maxConcurrency: number
  tags: string[]
  capabilities: string[]
}

export type BackendScheduleMode =
  | 'manual'
  | 'idle-first'
  | 'least-queue'
  | 'least-estimated-time'
  | 'same-base-model'
  | 'resource-match'
  | 'weighted-round-robin'
  | 'weighted-least-load'
  | 'backend-affinity'
  | 'failover'
  | 'smart'

export interface BackendScheduleDecision {
  backendId: string
  mode: BackendScheduleMode
  score: number
  reasons: string[]
  rejectedBackends: Array<{
    backendId: string
    reason: string
  }>
}

export interface ModelSignature {
  checkpoint?: string
  unet?: string
  vae?: string
  loras: string[]
}
