// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto'
import { getSqlite } from '../infrastructure/db/sqlite'
import * as comfyui from '../infrastructure/comfyui/client'
import { getOnlineProvider } from '../infrastructure/providers/registry'
import { getProviderRuntimeConfig } from '../infrastructure/providers/settings'
import type { BackendScheduleMode, BackendScheduleDecision, ModelSignature } from '../../shared/types/app'

export interface BackendRow {
  id: string
  groupId: string | null
  workspaceId: string
  type: string
  name: string
  endpoint: string
  enabled: boolean
  paused: boolean
  weight: number
  maxConcurrency: number
  tags: string[]
  capabilities: string[]
  healthStatus: string
  lastHealthCheck: number | null
  failureCount: number
  currentLoad: number
  queueLength: number
  lastModelSignature: ModelSignature | null
  createdAt: number
  updatedAt: number
}

export interface BackendGroupRow {
  id: string
  workspaceId: string
  name: string
  description: string | null
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface ResourceRow {
  id: string
  backendId: string
  type: string
  name: string
  path: string | null
  metadata: string | null
  lastSyncedAt: number
}

function safeJsonParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback
  try { return JSON.parse(val) as T } catch { return fallback }
}

function rowToBackend(row: Record<string, unknown>): BackendRow {
  return {
    id: row.id as string,
    groupId: (row.group_id as string) ?? null,
    workspaceId: row.workspace_id as string,
    type: row.type as string,
    name: row.name as string,
    endpoint: row.endpoint as string,
    enabled: Boolean(row.enabled),
    paused: Boolean(row.paused),
    weight: Number(row.weight),
    maxConcurrency: Number(row.max_concurrency),
    tags: safeJsonParse(row.tags as string, []),
    capabilities: safeJsonParse(row.capabilities as string, []),
    healthStatus: (row.health_status as string) ?? 'unknown',
    lastHealthCheck: (row.last_health_check as number) ?? null,
    failureCount: Number(row.failure_count),
    currentLoad: Number(row.current_load),
    queueLength: Number(row.queue_length),
    lastModelSignature: safeJsonParse(row.last_model_signature as string, null),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}

// ============================================
// 后端 CRUD
// ============================================

export function createBackend(input: {
  workspaceId: string
  type: string
  name: string
  endpoint: string
  groupId?: string
  weight?: number
  maxConcurrency?: number
  tags?: string[]
  capabilities?: string[]
}): BackendRow {
  const db = getSqlite()
  const id = randomUUID()
  const now = Date.now()
  const endpoint = input.type === 'comfyui' ? comfyui.normalizeComfyEndpoint(input.endpoint) : input.endpoint.trim()
  db.prepare(`
    INSERT INTO backends (id, group_id, workspace_id, type, name, endpoint, enabled, paused, weight, max_concurrency, tags, capabilities, health_status, failure_count, current_load, queue_length, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, 'unknown', 0, 0, 0, ?, ?)
  `).run(
    id, input.groupId ?? null, input.workspaceId, input.type, input.name, endpoint,
    input.weight ?? 1, input.maxConcurrency ?? 2,
    JSON.stringify(input.tags ?? []), JSON.stringify(input.capabilities ?? []),
    now, now
  )
  return getBackend(id)!
}

export function getBackend(id: string): BackendRow | null {
  const db = getSqlite()
  const row = db.prepare('SELECT * FROM backends WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToBackend(row) : null
}

export function listBackends(workspaceId: string): BackendRow[] {
  const db = getSqlite()
  const rows = db.prepare('SELECT * FROM backends WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[]
  return rows.map(rowToBackend)
}

export function updateBackend(id: string, patch: Partial<{
  name: string
  endpoint: string
  enabled: boolean
  paused: boolean
  weight: number
  maxConcurrency: number
  groupId: string | null
  tags: string[]
  capabilities: string[]
}>): BackendRow | null {
  const existing = getBackend(id)
  if (!existing) return null

  const sets: string[] = []
  const vals: unknown[] = []

  if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name) }
  if (patch.endpoint !== undefined) {
    sets.push('endpoint = ?')
    vals.push(existing.type === 'comfyui' ? comfyui.normalizeComfyEndpoint(patch.endpoint) : patch.endpoint.trim())
  }
  if (patch.enabled !== undefined) { sets.push('enabled = ?'); vals.push(patch.enabled ? 1 : 0) }
  if (patch.paused !== undefined) { sets.push('paused = ?'); vals.push(patch.paused ? 1 : 0) }
  if (patch.weight !== undefined) { sets.push('weight = ?'); vals.push(patch.weight) }
  if (patch.maxConcurrency !== undefined) { sets.push('max_concurrency = ?'); vals.push(patch.maxConcurrency) }
  if (patch.groupId !== undefined) { sets.push('group_id = ?'); vals.push(patch.groupId) }
  if (patch.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(patch.tags)) }
  if (patch.capabilities !== undefined) { sets.push('capabilities = ?'); vals.push(JSON.stringify(patch.capabilities)) }

  if (sets.length === 0) return existing
  sets.push('updated_at = ?')
  vals.push(Date.now())
  vals.push(id)

  const db = getSqlite()
  db.prepare(`UPDATE backends SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return getBackend(id)
}

export function deleteBackend(id: string): boolean {
  const db = getSqlite()
  db.prepare('DELETE FROM backend_resources WHERE backend_id = ?').run(id)
  db.prepare('DELETE FROM backend_health WHERE backend_id = ?').run(id)
  const result = db.prepare('DELETE FROM backends WHERE id = ?').run(id)
  return result.changes > 0
}

// ============================================
// 连接测试
// ============================================

export async function testBackendConnection(id: string): Promise<{ ok: boolean; version?: string; error?: string }> {
  const backend = getBackend(id)
  if (!backend) return { ok: false, error: 'Backend not found' }
  if (backend.type === 'provider') {
    const providerId = backend.endpoint.trim() || 'openai'
    const now = Date.now()
    try {
      const provider = getOnlineProvider(providerId)
      const result = await provider.testConnection(getProviderRuntimeConfig(backend.workspaceId, providerId))
      getSqlite().prepare('UPDATE backends SET health_status = ?, last_health_check = ?, failure_count = 0, updated_at = ? WHERE id = ?')
        .run('healthy', now, now, id)
      return { ok: true, version: result.message }
    } catch (error) {
      getSqlite().prepare('UPDATE backends SET health_status = ?, last_health_check = ?, failure_count = failure_count + 1, last_failure_at = ?, updated_at = ? WHERE id = ?')
        .run('unhealthy', now, now, now, id)
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  if (backend.type !== 'comfyui') return { ok: false, error: 'Unknown backend type' }

  const result = await comfyui.testConnection(backend.endpoint)
  const db = getSqlite()
  const now = Date.now()

  if (result.ok) {
    db.prepare('UPDATE backends SET health_status = ?, last_health_check = ?, failure_count = 0, updated_at = ? WHERE id = ?')
      .run('healthy', now, now, id)
  } else {
    db.prepare('UPDATE backends SET health_status = ?, last_health_check = ?, failure_count = failure_count + 1, last_failure_at = ?, updated_at = ? WHERE id = ?')
      .run('unhealthy', now, now, now, id)
  }
  return result
}

// ============================================
// 资源同步
// ============================================

const RESOURCE_TYPES = ['checkpoint', 'lora', 'vae', 'unet', 'controlnet', 'upscale', 'embedding']

export async function refreshBackendResources(backendId: string): Promise<{ synced: number; errors: string[] }> {
  const backend = getBackend(backendId)
  if (!backend || backend.type !== 'comfyui') return { synced: 0, errors: ['Not a ComfyUI backend'] }

  const db = getSqlite()
  const errors: string[] = []
  let synced = 0

  for (const type of RESOURCE_TYPES) {
    try {
      const models = await comfyui.listModels(backend.endpoint, type)
      db.prepare('DELETE FROM backend_resources WHERE backend_id = ? AND type = ?').run(backendId, type)
      const now = Date.now()
      for (const name of models) {
        db.prepare('INSERT INTO backend_resources (id, backend_id, type, name, last_synced_at) VALUES (?, ?, ?, ?, ?)')
          .run(randomUUID(), backendId, type, name, now)
        synced++
      }
    } catch (error) {
      errors.push(`${type}: ${String(error)}`)
    }
  }
  return { synced, errors }
}

export function getBackendResources(backendId: string, type?: string): ResourceRow[] {
  const db = getSqlite()
  const rows = type
    ? db.prepare('SELECT * FROM backend_resources WHERE backend_id = ? AND type = ? ORDER BY type, name').all(backendId, type) as Record<string, unknown>[]
    : db.prepare('SELECT * FROM backend_resources WHERE backend_id = ? ORDER BY type, name').all(backendId) as Record<string, unknown>[]
  return rows.map(row => ({
    id: row.id as string,
    backendId: row.backend_id as string,
    type: row.type as string,
    name: row.name as string,
    path: (row.path as string) ?? null,
    metadata: (row.metadata as string) ?? null,
    lastSyncedAt: Number(row.last_synced_at)
  }))
}

// ============================================
// 后端组
// ============================================

export function createBackendGroup(input: { workspaceId: string; name: string; description?: string; tags?: string[] }): BackendGroupRow {
  const db = getSqlite()
  const id = randomUUID()
  const now = Date.now()
  db.prepare('INSERT INTO backend_groups (id, workspace_id, name, description, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, input.workspaceId, input.name, input.description ?? null, JSON.stringify(input.tags ?? []), now, now)
  return getBackendGroup(id)!
}

export function getBackendGroup(id: string): BackendGroupRow | null {
  const db = getSqlite()
  const row = db.prepare('SELECT * FROM backend_groups WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    tags: safeJsonParse(row.tags as string, []),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}

export function listBackendGroups(workspaceId: string): BackendGroupRow[] {
  const db = getSqlite()
  const rows = db.prepare('SELECT * FROM backend_groups WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[]
  return rows.map(row => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    tags: safeJsonParse(row.tags as string, []),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }))
}

export function deleteBackendGroup(id: string): boolean {
  const db = getSqlite()
  db.prepare('UPDATE backends SET group_id = NULL WHERE group_id = ?').run(id)
  const result = db.prepare('DELETE FROM backend_groups WHERE id = ?').run(id)
  return result.changes > 0
}

// ============================================
// 资源差异对比
// ============================================

export function diffResources(backendIds: string[]): Record<string, Record<string, string[]>> {
  const allResources: Record<string, Record<string, Set<string>>> = {}
  for (const id of backendIds) {
    const resources = getBackendResources(id)
    const backendResources: Record<string, Set<string>> = {}
    allResources[id] = backendResources
    for (const r of resources) {
      const resourceSet = backendResources[r.type] ?? (backendResources[r.type] = new Set())
      resourceSet.add(r.name)
    }
  }

  const allTypes = new Set<string>()
  for (const backend of Object.values(allResources)) {
    for (const type of Object.keys(backend)) allTypes.add(type)
  }

  const diff: Record<string, Record<string, string[]>> = {}
  for (const type of allTypes) {
    const union = new Set<string>()
    for (const backend of Object.values(allResources)) {
      for (const name of backend[type] ?? []) union.add(name)
    }
    for (const backendId of backendIds) {
      const have = allResources[backendId]?.[type] ?? new Set()
      const missing = [...union].filter(n => !have.has(n))
      if (missing.length > 0) {
        if (!diff[backendId]) diff[backendId] = {}
        diff[backendId][type] = missing
      }
    }
  }
  return diff
}

// ============================================
// 调度器
// ============================================

export interface ScheduleInput {
  backendType?: string
  backendIds?: string[]
  groupId?: string
  requiredResources?: { type: string; name: string }[]
  modelSignature?: ModelSignature
  mode: BackendScheduleMode
}

export function selectBackend(input: ScheduleInput, workspaceId: string): BackendScheduleDecision {
  const db = getSqlite()

  let backends: BackendRow[]
  if (input.backendIds?.length) {
    backends = input.backendIds.map(id => getBackend(id)).filter((b): b is BackendRow => b !== null)
  } else if (input.groupId) {
    const rows = db.prepare('SELECT * FROM backends WHERE group_id = ? AND enabled = 1 AND paused = 0 AND workspace_id = ?')
      .all(input.groupId, workspaceId) as Record<string, unknown>[]
    backends = rows.map(rowToBackend)
  } else {
    backends = listBackends(workspaceId).filter(b => b.enabled && !b.paused && b.type === (input.backendType || 'comfyui'))
  }

  const rejected: Array<{ backendId: string; reason: string }> = []
  const candidates: Array<{ backend: BackendRow; score: number; reasons: string[] }> = []

  for (const b of backends) {
    const reasons: string[] = []
    let score = 0

    if (!b.enabled || b.paused) { rejected.push({ backendId: b.id, reason: 'disabled or paused' }); continue }
    if (b.currentLoad >= b.maxConcurrency) { rejected.push({ backendId: b.id, reason: 'at max concurrency' }); continue }

    // Resource check
    if (input.requiredResources?.length) {
      const resources = getBackendResources(b.id)
      const resourceMap = new Map<string, Set<string>>()
      for (const r of resources) {
        if (!resourceMap.has(r.type)) resourceMap.set(r.type, new Set())
        resourceMap.get(r.type)!.add(r.name)
      }
      if (resourceMap.size > 0) {
        const missing = input.requiredResources.filter(r => !resourceMap.get(r.type)?.has(r.name))
        if (missing.length > 0) {
          rejected.push({ backendId: b.id, reason: `missing: ${missing.map(m => m.name).join(', ')}` })
          continue
        }
        reasons.push('resources OK')
        score += 10
      } else {
        reasons.push('resource index empty')
      }
    }

    // Model affinity
    if (input.modelSignature && b.lastModelSignature) {
      const sig = b.lastModelSignature
      if (input.modelSignature.checkpoint && sig.checkpoint === input.modelSignature.checkpoint) { score += 20; reasons.push('checkpoint match') }
      if (input.modelSignature.unet && sig.unet === input.modelSignature.unet) { score += 15; reasons.push('unet match') }
      if (input.modelSignature.vae && sig.vae === input.modelSignature.vae) { score += 10; reasons.push('vae match') }
    }

    switch (input.mode) {
      case 'idle-first':
      case 'weighted-least-load':
        score += (b.maxConcurrency - b.currentLoad) * 5
        reasons.push(`load: ${b.currentLoad}/${b.maxConcurrency}`)
        break
      case 'least-queue':
        score -= b.queueLength * 2
        reasons.push(`queue: ${b.queueLength}`)
        break
      case 'weighted-round-robin':
        score += b.weight * 10
        break
      case 'same-base-model':
        break // handled above
      default:
        score += b.weight * 5 + (b.maxConcurrency - b.currentLoad) * 3
        reasons.push('mixed scoring')
    }

    score += b.weight * 2
    if (b.healthStatus === 'healthy') score += 5
    if (b.healthStatus === 'unhealthy') {
      score -= 5
      reasons.push('health previously failed')
    }
    reasons.push(`weight: ${b.weight}`)
    candidates.push({ backend: b, score, reasons })
  }

  if (candidates.length === 0) {
    return { backendId: '', mode: input.mode, score: 0, reasons: ['no eligible backends'], rejectedBackends: rejected }
  }

  candidates.sort((a, b) => b.score - a.score)
  const winner = candidates[0]!

  return {
    backendId: winner.backend.id,
    mode: input.mode,
    score: winner.score,
    reasons: winner.reasons,
    rejectedBackends: [...rejected, ...candidates.slice(1).map(c => ({
      backendId: c.backend.id,
      reason: `scored lower (${c.score.toFixed(1)} vs ${winner.score.toFixed(1)})`
    }))]
  }
}

// ============================================
// 负载 / 状态更新
// ============================================

export function updateBackendLoad(id: string, load: number, queueLength: number): void {
  const db = getSqlite()
  db.prepare('UPDATE backends SET current_load = ?, queue_length = ?, updated_at = ? WHERE id = ?')
    .run(load, queueLength, Date.now(), id)
}

export function updateBackendModelSignature(id: string, sig: ModelSignature): void {
  const db = getSqlite()
  db.prepare('UPDATE backends SET last_model_signature = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(sig), Date.now(), id)
}

export function markBackendUnhealthy(id: string): void {
  const db = getSqlite()
  db.prepare('UPDATE backends SET health_status = ?, failure_count = failure_count + 1, last_failure_at = ?, updated_at = ? WHERE id = ?')
    .run('unhealthy', Date.now(), Date.now(), id)
}
