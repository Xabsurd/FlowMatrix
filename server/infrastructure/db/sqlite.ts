// SPDX-License-Identifier: GPL-3.0-or-later
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let db: Database.Database | undefined
const SCHEMA_VERSION = 2

function resolveSqlitePath(databaseUrl: string) {
  if (databaseUrl.startsWith('file:')) {
    return resolve(process.cwd(), databaseUrl.slice(5))
  }

  return resolve(process.cwd(), databaseUrl)
}

export function getSqlite() {
  if (db) {
    return db
  }

  const config = typeof useRuntimeConfig === 'function'
    ? useRuntimeConfig()
    : { databaseUrl: process.env.DATABASE_URL || 'file:./data/flowmatrix.sqlite' }
  const databasePath = resolveSqlitePath(config.databaseUrl)
  mkdirSync(dirname(databasePath), { recursive: true })
  db = new Database(databasePath)
  db.pragma('journal_mode = WAL')
  migrateLite(db)
  return db
}

function migrateLite(database: Database.Database) {
  resetOutdatedSchema(database)
  database.exec(`
    -- ============================================
    -- 执行后端分组
    -- ============================================
    CREATE TABLE IF NOT EXISTS backend_groups (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_backend_groups_workspace
      ON backend_groups (workspace_id);

    -- ============================================
    -- 执行后端
    -- ============================================
    CREATE TABLE IF NOT EXISTS backends (
      id TEXT PRIMARY KEY,
      group_id TEXT,
      workspace_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      paused INTEGER NOT NULL DEFAULT 0,
      weight REAL NOT NULL DEFAULT 1,
      max_concurrency INTEGER NOT NULL DEFAULT 2,
      tags TEXT,
      capabilities TEXT,
      health_status TEXT DEFAULT 'unknown',
      last_health_check INTEGER,
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_failure_at INTEGER,
      current_load INTEGER NOT NULL DEFAULT 0,
      queue_length INTEGER NOT NULL DEFAULT 0,
      last_model_signature TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_backends_workspace_status
      ON backends (workspace_id, enabled, health_status);

    -- ============================================
    -- 后端资源
    -- ============================================
    CREATE TABLE IF NOT EXISTS backend_resources (
      id TEXT PRIMARY KEY,
      backend_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT,
      metadata TEXT,
      last_synced_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_backend_resources_backend
      ON backend_resources (backend_id, type);

    -- ============================================
    -- 后端健康状态
    -- ============================================
    CREATE TABLE IF NOT EXISTS backend_health (
      id TEXT PRIMARY KEY,
      backend_id TEXT NOT NULL,
      status TEXT NOT NULL,
      queue_executing INTEGER NOT NULL DEFAULT 0,
      queue_pending INTEGER NOT NULL DEFAULT 0,
      system_info TEXT,
      current_model TEXT,
      checked_at INTEGER NOT NULL
    );

    -- ============================================
    -- 工作流
    -- ============================================
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      raw_json TEXT NOT NULL,
      parsed_nodes TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(workspace_id, slug)
    );

    CREATE INDEX IF NOT EXISTS idx_workflows_workspace
      ON workflows (workspace_id);

    -- ============================================
    -- 工作流节点
    -- ============================================
    CREATE TABLE IF NOT EXISTS workflow_nodes (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      node_type TEXT NOT NULL,
      title TEXT,
      inputs TEXT,
      outputs TEXT,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow
      ON workflow_nodes (workflow_id);

    -- ============================================
    -- 调用配置
    -- ============================================
    CREATE TABLE IF NOT EXISTS call_presets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      backend_id TEXT,
      backend_group_id TEXT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      node_params TEXT NOT NULL,
      schedule_mode TEXT DEFAULT 'idle-first',
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(workspace_id, slug)
    );

    CREATE INDEX IF NOT EXISTS idx_call_presets_workspace
      ON call_presets (workspace_id, workflow_id);

    -- ============================================
    -- 批量运行
    -- ============================================
    CREATE TABLE IF NOT EXISTS batch_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      preset_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL,
      combination_mode TEXT NOT NULL,
      total_tasks INTEGER NOT NULL,
      completed_tasks INTEGER NOT NULL DEFAULT 0,
      failed_tasks INTEGER NOT NULL DEFAULT 0,
      canceled_tasks INTEGER NOT NULL DEFAULT 0,
      matrix_json TEXT,
      schedule_mode TEXT NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_batch_runs_workspace_status
      ON batch_runs (workspace_id, status, created_at DESC);

    -- ============================================
    -- 运行任务
    -- ============================================
    CREATE TABLE IF NOT EXISTS run_tasks (
      id TEXT PRIMARY KEY,
      batch_run_id TEXT,
      workspace_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      backend_id TEXT,
      workflow_id TEXT NOT NULL,
      preset_id TEXT NOT NULL,
      status TEXT NOT NULL,
      input_params TEXT NOT NULL,
      submitted_payload TEXT,
      external_task_id TEXT,
      result_json TEXT,
      error_message TEXT,
      schedule_decision TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      finished_at INTEGER,
      timeout_seconds INTEGER DEFAULT 300
    );

    CREATE INDEX IF NOT EXISTS idx_run_tasks_workspace_status
      ON run_tasks (workspace_id, status, created_at);

    CREATE INDEX IF NOT EXISTS idx_run_tasks_batch
      ON run_tasks (batch_run_id, status);

    CREATE INDEX IF NOT EXISTS idx_run_tasks_backend
      ON run_tasks (backend_id, status);

    -- ============================================
    -- 运行结果
    -- ============================================
    CREATE TABLE IF NOT EXISTS run_results (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      batch_run_id TEXT,
      workspace_id TEXT NOT NULL,
      output_type TEXT NOT NULL,
      storage_driver TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      file_hash TEXT,
      thumbnail_key TEXT,
      metadata TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_run_results_task
      ON run_results (task_id);

    CREATE INDEX IF NOT EXISTS idx_run_results_batch
      ON run_results (batch_run_id, workspace_id);

    -- ============================================
    -- 结果归档
    -- ============================================
    CREATE TABLE IF NOT EXISTS result_archives (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      batch_run_id TEXT,
      status TEXT NOT NULL,
      file_count INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER NOT NULL DEFAULT 0,
      failed_files INTEGER NOT NULL DEFAULT 0,
      storage_key TEXT,
      file_name TEXT,
      filter_json TEXT,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      finished_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_result_archives_workspace
      ON result_archives (workspace_id, status);

    -- ============================================
    -- Provider 密钥
    -- ============================================
    CREATE TABLE IF NOT EXISTS provider_secrets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      default_model TEXT NOT NULL,
      encrypted_api_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- ============================================
    -- 任务队列
    -- ============================================
    CREATE TABLE IF NOT EXISTS task_queue (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL UNIQUE,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      claimed_by TEXT,
      claimed_at INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_task_queue_status
      ON task_queue (status, priority DESC, created_at);

    -- ============================================
    -- 系统设置
    -- ============================================
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(workspace_id, key)
    );

    -- ============================================
    -- 审计日志
    -- ============================================
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      actor_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace
      ON audit_logs (workspace_id, created_at DESC);
  `)

  database.prepare(`
    INSERT INTO system_settings (id, workspace_id, key, value, updated_at)
    VALUES ('schema-version', NULL, 'schema.version', ?, ?)
    ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(String(SCHEMA_VERSION), Date.now())
}

function resetOutdatedSchema(database: Database.Database) {
  const userTables = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>

  if (!userTables.length) return

  let version = ''
  if (userTables.some(table => table.name === 'system_settings')) {
    version = String((database.prepare(`
      SELECT value FROM system_settings WHERE id = 'schema-version'
    `).get() as { value?: string } | undefined)?.value || '')
  }

  if (version === String(SCHEMA_VERSION)) return

  database.exec('PRAGMA foreign_keys = OFF')
  for (const table of userTables) {
    database.prepare(`DROP TABLE IF EXISTS "${table.name}"`).run()
  }
  database.exec('PRAGMA foreign_keys = ON')
}
