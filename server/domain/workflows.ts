// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto'
import { getSqlite } from '../infrastructure/db/sqlite'
import { parseWorkflowNodes } from '../infrastructure/comfyui/client'

export interface WorkflowRow {
  id: string
  workspaceId: string
  name: string
  slug: string
  version: number
  rawJson: Record<string, unknown>
  parsedNodes: unknown[] | null
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface WorkflowNodeRow {
  id: string
  workflowId: string
  nodeId: string
  nodeType: string
  title: string | null
  inputs: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

function safeJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback
  try { return JSON.parse(val) as T } catch { return fallback }
}

function rowToWorkflow(row: Record<string, unknown>): WorkflowRow {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    slug: row.slug as string,
    version: Number(row.version),
    rawJson: safeJson(row.raw_json as string, {}),
    parsedNodes: safeJson(row.parsed_nodes as string, null),
    metadata: safeJson(row.metadata as string, null),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}

export function createWorkflow(input: {
  workspaceId: string
  name: string
  rawJson: Record<string, unknown>
  metadata?: Record<string, unknown>
}): WorkflowRow {
  const db = getSqlite()
  const id = randomUUID()
  const now = Date.now()
  const slug = input.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'workflow'

  const parsedNodes = parseWorkflowNodes(input.rawJson)

  db.prepare(`
    INSERT INTO workflows (id, workspace_id, name, slug, version, raw_json, parsed_nodes, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(id, input.workspaceId, input.name, slug, JSON.stringify(input.rawJson), JSON.stringify(parsedNodes), JSON.stringify(input.metadata ?? {}), now, now)

  // Store individual nodes
  for (const node of parsedNodes) {
    db.prepare(`
      INSERT INTO workflow_nodes (id, workflow_id, node_id, node_type, title, inputs, outputs, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, node.nodeId, node.nodeType, node.title ?? null, JSON.stringify(node.inputs), null, null)
  }

  return getWorkflow(id)!
}

export function getWorkflow(id: string): WorkflowRow | null {
  const db = getSqlite()
  const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToWorkflow(row) : null
}

export function listWorkflows(workspaceId: string): WorkflowRow[] {
  const db = getSqlite()
  const rows = db.prepare('SELECT * FROM workflows WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId) as Record<string, unknown>[]
  return rows.map(rowToWorkflow)
}

export function updateWorkflow(id: string, patch: Partial<{ name: string; rawJson: Record<string, unknown>; metadata: Record<string, unknown> }>): WorkflowRow | null {
  const existing = getWorkflow(id)
  if (!existing) return null
  const db = getSqlite()
  const now = Date.now()

  if (patch.rawJson) {
    const parsedNodes = parseWorkflowNodes(patch.rawJson)
    db.prepare('DELETE FROM workflow_nodes WHERE workflow_id = ?').run(id)
    for (const node of parsedNodes) {
      db.prepare(`
        INSERT INTO workflow_nodes (id, workflow_id, node_id, node_type, title, inputs, outputs, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), id, node.nodeId, node.nodeType, node.title ?? null, JSON.stringify(node.inputs), null, null)
    }
    db.prepare('UPDATE workflows SET raw_json = ?, parsed_nodes = ?, version = version + 1, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(patch.rawJson), JSON.stringify(parsedNodes), now, id)
  }

  if (patch.name) {
    db.prepare('UPDATE workflows SET name = ?, updated_at = ? WHERE id = ?').run(patch.name, now, id)
  }

  if (patch.metadata) {
    db.prepare('UPDATE workflows SET metadata = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify({ ...(existing.metadata || {}), ...patch.metadata }), now, id)
  }

  return getWorkflow(id)
}

export function deleteWorkflow(id: string): boolean {
  const db = getSqlite()
  db.prepare('DELETE FROM workflow_nodes WHERE workflow_id = ?').run(id)
  const result = db.prepare('DELETE FROM workflows WHERE id = ?').run(id)
  return result.changes > 0
}

export function getWorkflowNodes(workflowId: string): WorkflowNodeRow[] {
  const db = getSqlite()
  const rows = db.prepare('SELECT * FROM workflow_nodes WHERE workflow_id = ? ORDER BY node_id').all(workflowId) as Record<string, unknown>[]
  return rows.map(row => ({
    id: row.id as string,
    workflowId: row.workflow_id as string,
    nodeId: row.node_id as string,
    nodeType: row.node_type as string,
    title: (row.title as string) ?? null,
    inputs: safeJson(row.inputs as string, null),
    outputs: safeJson(row.outputs as string, null),
    metadata: safeJson(row.metadata as string, null)
  }))
}
