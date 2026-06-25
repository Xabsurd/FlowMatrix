// SPDX-License-Identifier: AGPL-3.0-or-later
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' })
const jsonText = (name: string) => text(name)

export const backendGroups = sqliteTable('backend_groups', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  tags: jsonText('tags'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const backends = sqliteTable('backends', {
  id: text('id').primaryKey(),
  groupId: text('group_id'),
  workspaceId: text('workspace_id').notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  endpoint: text('endpoint').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
  weight: real('weight').notNull().default(1),
  maxConcurrency: integer('max_concurrency').notNull().default(2),
  tags: jsonText('tags'),
  capabilities: jsonText('capabilities'),
  healthStatus: text('health_status').default('unknown'),
  lastHealthCheck: timestamp('last_health_check'),
  failureCount: integer('failure_count').notNull().default(0),
  lastFailureAt: timestamp('last_failure_at'),
  currentLoad: integer('current_load').notNull().default(0),
  queueLength: integer('queue_length').notNull().default(0),
  lastModelSignature: jsonText('last_model_signature'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const backendResources = sqliteTable('backend_resources', {
  id: text('id').primaryKey(),
  backendId: text('backend_id').notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  path: text('path'),
  metadata: jsonText('metadata'),
  lastSyncedAt: timestamp('last_synced_at').notNull()
})

export const backendHealth = sqliteTable('backend_health', {
  id: text('id').primaryKey(),
  backendId: text('backend_id').notNull(),
  status: text('status').notNull(),
  queueExecuting: integer('queue_executing').notNull().default(0),
  queuePending: integer('queue_pending').notNull().default(0),
  systemInfo: jsonText('system_info'),
  currentModel: jsonText('current_model'),
  checkedAt: timestamp('checked_at').notNull()
})

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  version: integer('version').notNull().default(1),
  rawJson: jsonText('raw_json').notNull(),
  parsedNodes: jsonText('parsed_nodes'),
  metadata: jsonText('metadata'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
}, table => ({
  workspaceSlug: uniqueIndex('idx_workflows_workspace_slug').on(table.workspaceId, table.slug)
}))

export const workflowNodes = sqliteTable('workflow_nodes', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  nodeId: text('node_id').notNull(),
  nodeType: text('node_type').notNull(),
  title: text('title'),
  inputs: jsonText('inputs'),
  outputs: jsonText('outputs'),
  metadata: jsonText('metadata')
})

export const callPresets = sqliteTable('call_presets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  workflowId: text('workflow_id').notNull(),
  backendId: text('backend_id'),
  backendGroupId: text('backend_group_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  nodeParams: jsonText('node_params').notNull(),
  scheduleMode: text('schedule_mode').notNull().default('idle-first'),
  metadata: jsonText('metadata'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
}, table => ({
  workspaceSlug: uniqueIndex('idx_call_presets_workspace_slug').on(table.workspaceId, table.slug)
}))

export const batchRuns = sqliteTable('batch_runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  actorId: text('actor_id').notNull(),
  presetId: text('preset_id').notNull(),
  workflowId: text('workflow_id').notNull(),
  name: text('name'),
  status: text('status').notNull(),
  combinationMode: text('combination_mode').notNull(),
  totalTasks: integer('total_tasks').notNull(),
  completedTasks: integer('completed_tasks').notNull().default(0),
  failedTasks: integer('failed_tasks').notNull().default(0),
  canceledTasks: integer('canceled_tasks').notNull().default(0),
  matrixJson: jsonText('matrix_json'),
  scheduleMode: text('schedule_mode').notNull(),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const runTasks = sqliteTable('run_tasks', {
  id: text('id').primaryKey(),
  batchRunId: text('batch_run_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  actorId: text('actor_id').notNull(),
  backendId: text('backend_id'),
  workflowId: text('workflow_id').notNull(),
  presetId: text('preset_id').notNull(),
  status: text('status').notNull(),
  inputParams: jsonText('input_params').notNull(),
  submittedPayload: jsonText('submitted_payload'),
  externalTaskId: text('external_task_id'),
  resultJson: jsonText('result_json'),
  errorMessage: text('error_message'),
  scheduleDecision: jsonText('schedule_decision'),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  timeoutSeconds: integer('timeout_seconds').notNull().default(300)
})

export const runResults = sqliteTable('run_results', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  batchRunId: text('batch_run_id'),
  workspaceId: text('workspace_id').notNull(),
  outputType: text('output_type').notNull(),
  storageDriver: text('storage_driver').notNull(),
  storageKey: text('storage_key').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  fileHash: text('file_hash'),
  thumbnailKey: text('thumbnail_key'),
  metadata: jsonText('metadata'),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull()
})

export const resultArchives = sqliteTable('result_archives', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  actorId: text('actor_id').notNull(),
  batchRunId: text('batch_run_id'),
  status: text('status').notNull(),
  fileCount: integer('file_count').notNull().default(0),
  totalBytes: integer('total_bytes').notNull().default(0),
  failedFiles: integer('failed_files').notNull().default(0),
  storageKey: text('storage_key'),
  fileName: text('file_name'),
  filterJson: jsonText('filter_json'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull(),
  finishedAt: timestamp('finished_at')
})

export const providerSecrets = sqliteTable('provider_secrets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  providerId: text('provider_id').notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  defaultModel: text('default_model').notNull(),
  encryptedApiKey: text('encrypted_api_key').notNull(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const taskQueue = sqliteTable('task_queue', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().unique(),
  priority: integer('priority').notNull().default(0),
  status: text('status').notNull(),
  claimedBy: text('claimed_by'),
  claimedAt: timestamp('claimed_at'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  error: text('error'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const systemSettings = sqliteTable('system_settings', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id'),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').notNull()
}, table => ({
  workspaceKey: uniqueIndex('idx_system_settings_workspace_key').on(table.workspaceId, table.key)
}))

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id'),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  details: jsonText('details'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').notNull()
})
