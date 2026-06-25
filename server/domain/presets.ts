// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from 'node:crypto'
import { getSqlite } from '../infrastructure/db/sqlite'

export interface CallPresetRow {
  id: string
  workspaceId: string
  workflowId: string
  backendId: string | null
  backendGroupId: string | null
  name: string
  slug: string
  description: string | null
  nodeParams: NodeParamMapping[]
  scheduleMode: string
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface NodeParamMapping {
  nodeId: string
  nodeType: string
  inputName: string
  inferredType: string // STRING | INT | FLOAT | BOOLEAN | MODEL | SEED | JSON | IMAGE | FILE
  controlType: string // text | textarea | number | slider | switch | select | lora-select | seed-input | file-upload | json-editor
  runtimeInput?: boolean
  defaultValue?: unknown
  options?: unknown[]
}

function safeJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback
  try { return JSON.parse(val) as T } catch { return fallback }
}

function rowToPreset(row: Record<string, unknown>): CallPresetRow {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    workflowId: row.workflow_id as string,
    backendId: (row.backend_id as string) ?? null,
    backendGroupId: (row.backend_group_id as string) ?? null,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string) ?? null,
    nodeParams: safeJson(row.node_params as string, []),
    scheduleMode: (row.schedule_mode as string) ?? 'idle-first',
    metadata: safeJson(row.metadata as string, null),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}

export function createPreset(input: {
  workspaceId: string
  workflowId: string
  name: string
  nodeParams: NodeParamMapping[]
  backendId?: string
  backendGroupId?: string
  description?: string
  scheduleMode?: string
  metadata?: Record<string, unknown>
}): CallPresetRow {
  const db = getSqlite()
  const id = randomUUID()
  const now = Date.now()
  const slug = input.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'preset'

  db.prepare(`
    INSERT INTO call_presets (id, workspace_id, workflow_id, backend_id, backend_group_id, name, slug, description, node_params, schedule_mode, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.workspaceId, input.workflowId,
    input.backendId ?? null, input.backendGroupId ?? null,
    input.name, slug, input.description ?? null,
    JSON.stringify(input.nodeParams),
    input.scheduleMode ?? 'idle-first',
    JSON.stringify(input.metadata ?? {}),
    now, now
  )
  return getPreset(id)!
}

export function getPreset(id: string): CallPresetRow | null {
  const db = getSqlite()
  const row = db.prepare('SELECT * FROM call_presets WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToPreset(row) : null
}

export function listPresets(workspaceId: string): CallPresetRow[] {
  const db = getSqlite()
  const rows = db.prepare('SELECT * FROM call_presets WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId) as Record<string, unknown>[]
  return rows.map(rowToPreset)
}

export function updatePreset(id: string, patch: Partial<{
  name: string
  description: string
  nodeParams: NodeParamMapping[]
  backendId: string | null
  backendGroupId: string | null
  scheduleMode: string
}>): CallPresetRow | null {
  const existing = getPreset(id)
  if (!existing) return null
  const db = getSqlite()
  const sets: string[] = []
  const vals: unknown[] = []

  if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name) }
  if (patch.description !== undefined) { sets.push('description = ?'); vals.push(patch.description) }
  if (patch.nodeParams !== undefined) { sets.push('node_params = ?'); vals.push(JSON.stringify(patch.nodeParams)) }
  if (patch.backendId !== undefined) { sets.push('backend_id = ?'); vals.push(patch.backendId) }
  if (patch.backendGroupId !== undefined) { sets.push('backend_group_id = ?'); vals.push(patch.backendGroupId) }
  if (patch.scheduleMode !== undefined) { sets.push('schedule_mode = ?'); vals.push(patch.scheduleMode) }

  if (sets.length === 0) return existing
  sets.push('updated_at = ?')
  vals.push(Date.now())
  vals.push(id)

  db.prepare(`UPDATE call_presets SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return getPreset(id)
}

export function deletePreset(id: string): boolean {
  const db = getSqlite()
  const result = db.prepare('DELETE FROM call_presets WHERE id = ?').run(id)
  return result.changes > 0
}

// ============================================
// 参数类型推断
// ============================================

export function inferParamType(nodeType: string, inputName: string, inputSpec: unknown): {
  inferredType: string
  controlType: string
  options?: unknown[]
} {
  // Check by node type + input name first for well-known ComfyUI nodes
  const wellKnown = WELL_KNOWN_PARAMS[`${nodeType}.${inputName}`]
  if (wellKnown) return wellKnown

  // Infer from input spec
  if (typeof inputSpec === 'object' && inputSpec !== null) {
    const spec = inputSpec as { type?: string; options?: unknown[]; default?: unknown }
    if (spec.type === 'STRING') return { inferredType: 'STRING', controlType: spec.options ? 'select' : 'text' }
    if (spec.type === 'INT') return { inferredType: 'INT', controlType: 'number' }
    if (spec.type === 'FLOAT') return { inferredType: 'FLOAT', controlType: 'number' }
    if (spec.type === 'BOOLEAN') return { inferredType: 'BOOLEAN', controlType: 'switch' }
    if (Array.isArray(spec.options)) return { inferredType: 'ENUM', controlType: 'select', options: spec.options }
  }

  // Fallback: infer from input name
  const nameLower = inputName.toLowerCase()
  if (nameLower === 'seed') return { inferredType: 'SEED', controlType: 'seed-input' }
  if (nameLower === 'text' || nameLower === 'prompt') return { inferredType: 'STRING', controlType: 'textarea' }
  if (nameLower.includes('lora')) return { inferredType: 'MODEL', controlType: 'lora-select' }
  if (nameLower.includes('ckpt') || nameLower.includes('checkpoint')) return { inferredType: 'MODEL', controlType: 'select' }
  if (nameLower.includes('image') || nameLower.includes('mask') || nameLower.includes('photo') || nameLower.includes('picture')) {
    return { inferredType: 'IMAGE', controlType: 'file-upload' }
  }
  if (nameLower.includes('file') || nameLower.includes('video') || nameLower.includes('audio')) {
    return { inferredType: 'FILE', controlType: 'file-upload' }
  }

  return { inferredType: 'STRING', controlType: 'text' }
}

const WELL_KNOWN_PARAMS: Record<string, { inferredType: string; controlType: string }> = {
  'CLIPTextEncode.text': { inferredType: 'STRING', controlType: 'textarea' },
  'KSampler.seed': { inferredType: 'SEED', controlType: 'seed-input' },
  'KSampler.steps': { inferredType: 'INT', controlType: 'slider' },
  'KSampler.cfg': { inferredType: 'FLOAT', controlType: 'slider' },
  'KSampler.sampler_name': { inferredType: 'ENUM', controlType: 'select' },
  'KSampler.scheduler': { inferredType: 'ENUM', controlType: 'select' },
  'KSampler.denoise': { inferredType: 'FLOAT', controlType: 'slider' },
  'EmptyLatentImage.width': { inferredType: 'INT', controlType: 'number' },
  'EmptyLatentImage.height': { inferredType: 'INT', controlType: 'number' },
  'EmptyLatentImage.batch_size': { inferredType: 'INT', controlType: 'number' },
  'LoraLoader.lora_name': { inferredType: 'MODEL', controlType: 'lora-select' },
  'LoraLoader.strength_model': { inferredType: 'FLOAT', controlType: 'slider' },
  'LoraLoader.strength_clip': { inferredType: 'FLOAT', controlType: 'slider' },
  'CheckpointLoaderSimple.ckpt_name': { inferredType: 'MODEL', controlType: 'select' },
  'VAELoader.vae_name': { inferredType: 'MODEL', controlType: 'select' },
  'UNETLoader.unet_name': { inferredType: 'MODEL', controlType: 'select' }
}
