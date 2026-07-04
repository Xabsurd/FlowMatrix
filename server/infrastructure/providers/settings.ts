// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto'
import { getSqlite } from '../db/sqlite'
import { decryptSecret, encryptSecret } from '../crypto/secrets'
import type { ProviderRuntimeConfig } from './types'

interface ProviderSettingsRow {
  id: string
  workspace_id: string
  provider_id: string
  name: string
  base_url: string
  default_model: string
  encrypted_api_key: string
  created_at: number
  updated_at: number
}

export interface ProviderSettingsView {
  providerId: string
  name: string
  baseUrl: string
  defaultModel: string
  hasApiKey: boolean
  updatedAt: number
}

export interface ProviderSettingsInput {
  workspaceId: string
  providerId: string
  name?: string
  baseUrl: string
  defaultModel: string
  apiKey?: string
}

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-image-1'

function toView(row: ProviderSettingsRow): ProviderSettingsView {
  return {
    providerId: row.provider_id,
    name: row.name,
    baseUrl: row.base_url,
    defaultModel: row.default_model,
    hasApiKey: Boolean(row.encrypted_api_key),
    updatedAt: row.updated_at
  }
}

export function getProviderSettings(workspaceId: string, providerId = 'openai'): ProviderSettingsView {
  const row = getSqlite().prepare(`
    SELECT * FROM provider_secrets
    WHERE workspace_id = ? AND provider_id = ?
  `).get(workspaceId, providerId) as ProviderSettingsRow | undefined

  if (!row) {
    return {
      providerId,
      name: 'OpenAI Compatible',
      baseUrl: DEFAULT_OPENAI_BASE_URL,
      defaultModel: DEFAULT_OPENAI_MODEL,
      hasApiKey: false,
      updatedAt: 0
    }
  }

  return toView(row)
}

export function upsertProviderSettings(input: ProviderSettingsInput) {
  const db = getSqlite()
  const now = Date.now()
  const existing = db.prepare(`
    SELECT * FROM provider_secrets
    WHERE workspace_id = ? AND provider_id = ?
  `).get(input.workspaceId, input.providerId) as ProviderSettingsRow | undefined

  const encryptedApiKey = input.apiKey
    ? encryptSecret(input.apiKey)
    : existing?.encrypted_api_key || ''

  if (existing) {
    db.prepare(`
      UPDATE provider_secrets
      SET name = ?, base_url = ?, default_model = ?, encrypted_api_key = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.name || existing.name,
      input.baseUrl,
      input.defaultModel,
      encryptedApiKey,
      now,
      existing.id
    )
  } else {
    db.prepare(`
      INSERT INTO provider_secrets (
        id, workspace_id, provider_id, name, base_url, default_model,
        encrypted_api_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.workspaceId,
      input.providerId,
      input.name || 'OpenAI Compatible',
      input.baseUrl,
      input.defaultModel,
      encryptedApiKey,
      now,
      now
    )
  }

  return getProviderSettings(input.workspaceId, input.providerId)
}

export function resolveProviderRuntimeConfig(input: {
  workspaceId: string
  providerId?: string
  baseUrl?: string
  model?: string
  apiKey?: string
}): ProviderRuntimeConfig {
  const providerId = input.providerId || 'openai'
  const row = getSqlite().prepare(`
    SELECT * FROM provider_secrets
    WHERE workspace_id = ? AND provider_id = ?
  `).get(input.workspaceId, providerId) as ProviderSettingsRow | undefined

  const apiKey = input.apiKey?.trim() || (row?.encrypted_api_key ? decryptSecret(row.encrypted_api_key) : '')
  const baseUrl = input.baseUrl?.trim() || row?.base_url || ''
  const model = input.model?.trim() || row?.default_model || DEFAULT_OPENAI_MODEL

  if (!baseUrl) {
    throw new Error('请先填写在线 API Base URL')
  }

  if (!apiKey) {
    throw new Error('请先填写或保存在线 API Key')
  }

  return { apiKey, baseUrl, model }
}

export function getProviderRuntimeConfig(workspaceId: string, providerId = 'openai'): ProviderRuntimeConfig {
  const config = resolveProviderRuntimeConfig({ workspaceId, providerId })
  if (!config.baseUrl) {
    throw new Error('请先在系统设置中保存在线 API 配置')
  }
  if (!config.apiKey) {
    throw new Error('请先在系统设置中保存在线 API Key')
  }
  return config
}
