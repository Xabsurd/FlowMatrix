// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ModelSignature } from '../../../shared/types/app'

export type ComfyUIQueueEntry = unknown[] | Record<string, unknown>

export interface ComfyUIQueueInfo {
  exec_info?: {
    queue_running?: number
    queue_pending?: number
    queue_remaining?: number
  }
  queue_running?: ComfyUIQueueEntry[]
  queue_pending?: ComfyUIQueueEntry[]
}

export interface ComfyUISystemInfo {
  devices: Array<{
    name: string
    type: string
    vram_total: number
    vram_free: number
  }>
  python_version: string
  pytorch_version: string
}

export interface ComfyUIPromptResponse {
  prompt_id: string
  number?: number
}

export interface ComfyUIHistoryItem {
  prompt_id: string
  status: { status_str: string; completed: boolean; messages: Array<[string, unknown]> }
  outputs: Record<string, ComfyUIOutput>
}

export interface ComfyUIOutput {
  images?: Array<{ filename: string; subfolder: string; type: string }>
  text?: string[]
  [key: string]: unknown
}


const COMFY_ROUTE_SUFFIXES = [
  '/system_stats',
  '/object_info',
  '/prompt',
  '/view',
  '/upload/image',
  '/interrupt'
]

export function normalizeComfyEndpoint(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  const url = new URL(withProtocol)
  url.hash = ''
  url.search = ''

  let path = url.pathname.replace(/\/+$/, '')
  for (const suffix of COMFY_ROUTE_SUFFIXES) {
    if (path === suffix || path.endsWith(suffix)) {
      path = path.slice(0, -suffix.length)
      break
    }
  }
  path = path.replace(/\/history\/.*$/, '').replace(/\/+$/, '')
  url.pathname = path || '/'

  return url.toString().replace(/\/$/, '')
}

function buildComfyUrl(endpoint: string, path: string, params?: URLSearchParams): string {
  const base = normalizeComfyEndpoint(endpoint)
  if (!base) throw new Error('ComfyUI endpoint is empty')

  const baseUrl = new URL(base.endsWith('/') ? base : `${base}/`)
  const url = new URL(path.replace(/^\/+/, ''), baseUrl)
  if (params) url.search = params.toString()
  return url.toString()
}

function formatFetchError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause
    const causeMessage = cause instanceof Error ? cause.message : ''
    if (error.name === 'TimeoutError' || causeMessage.includes('timed out')) return '连接超时，请确认 ComfyUI 已启动且端口可访问'
    if (causeMessage.includes('ECONNREFUSED')) return '连接被拒绝，请确认端口正确且 ComfyUI 正在监听该地址'
    if (causeMessage.includes('ENOTFOUND')) return '无法解析主机名，请检查端点地址'
    return causeMessage || error.message
  }
  return String(error)
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init })
  if (!res.ok) throw new Error(`ComfyUI ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function testConnection(endpoint: string): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const data = await fetchJson<{ version?: string }>(buildComfyUrl(endpoint, '/system_stats'))
    return { ok: true, version: data.version }
  } catch (error) {
    return { ok: false, error: formatFetchError(error) }
  }
}

export async function getQueueInfo(endpoint: string): Promise<ComfyUIQueueInfo> {
  return fetchJson<ComfyUIQueueInfo>(buildComfyUrl(endpoint, '/prompt'))
}

export function getQueueCounts(queue: ComfyUIQueueInfo): { running: number; pending: number } {
  const running = Array.isArray(queue.queue_running)
    ? queue.queue_running.length
    : Number(queue.exec_info?.queue_running ?? 0)
  const pending = Array.isArray(queue.queue_pending)
    ? queue.queue_pending.length
    : Number(queue.exec_info?.queue_pending ?? queue.exec_info?.queue_remaining ?? 0)
  return { running, pending }
}

export function getPromptQueueState(queue: ComfyUIQueueInfo, promptId: string): 'running' | 'pending' | 'unknown' {
  if (queue.queue_running?.some(entry => queueEntryHasPromptId(entry, promptId))) return 'running'
  if (queue.queue_pending?.some(entry => queueEntryHasPromptId(entry, promptId))) return 'pending'
  return 'unknown'
}

function queueEntryHasPromptId(entry: unknown, promptId: string): boolean {
  if (typeof entry === 'string') return entry === promptId
  if (Array.isArray(entry)) return entry.some(item => queueEntryHasPromptId(item, promptId))
  if (typeof entry !== 'object' || entry === null) return false

  const record = entry as Record<string, unknown>
  if (record.prompt_id === promptId || record.promptId === promptId) return true
  return Object.values(record).some(value => queueEntryHasPromptId(value, promptId))
}

export async function getSystemInfo(endpoint: string): Promise<ComfyUISystemInfo> {
  return fetchJson<ComfyUISystemInfo>(buildComfyUrl(endpoint, '/system_stats'))
}

export async function getObjectInfo(endpoint: string): Promise<Record<string, ComfyUINodeInfo>> {
  return fetchJson<Record<string, ComfyUINodeInfo>>(buildComfyUrl(endpoint, '/object_info'))
}

export interface ComfyUINodeInfo {
  name: string
  display_name: string
  description: string
  category: string
  input: {
    required?: Record<string, [string | unknown[], ...unknown[]]>
    optional?: Record<string, [string | unknown[], ...unknown[]]>
  }
  output: unknown[]
  output_name: string[]
  output_node: boolean
}

export async function listModels(endpoint: string, type: string): Promise<string[]> {
  const info = await getObjectInfo(endpoint)
  const nodeName = MODEL_NODE_MAP[type]
  if (!nodeName || !info[nodeName]) return []

  const inputKey = MODEL_INPUT_MAP[type]
  if (!inputKey) return []
  const inputs = info[nodeName]?.input?.required
  const input = inputs?.[inputKey]
  if (!input) return []

  const values = input[0]
  return Array.isArray(values) ? values as string[] : []
}

const MODEL_NODE_MAP: Record<string, string> = {
  checkpoint: 'CheckpointLoaderSimple',
  lora: 'LoraLoader',
  vae: 'VAELoader',
  unet: 'UNETLoader',
  controlnet: 'ControlNetLoader',
  upscale: 'UpscaleModelLoader',
  embedding: 'EmbeddingLoader'
}

const MODEL_INPUT_MAP: Record<string, string> = {
  checkpoint: 'ckpt_name',
  lora: 'lora_name',
  vae: 'vae_name',
  unet: 'unet_name',
  controlnet: 'control_net_name',
  upscale: 'model_name',
  embedding: 'embedding_name'
}

export async function submitPrompt(
  endpoint: string,
  workflow: Record<string, unknown>,
  clientId?: string
): Promise<ComfyUIPromptResponse> {
  const body: Record<string, unknown> = { prompt: workflow }
  if (clientId) body.client_id = clientId
  return fetchJson<ComfyUIPromptResponse>(buildComfyUrl(endpoint, '/prompt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export async function getHistory(endpoint: string, promptId: string): Promise<ComfyUIHistoryItem | null> {
  const data = await fetchJson<Record<string, ComfyUIHistoryItem>>(buildComfyUrl(endpoint, `/history/${promptId}`))
  return data[promptId] ?? null
}

export async function getImage(endpoint: string, filename: string, subfolder: string, type: string): Promise<Buffer> {
  const params = new URLSearchParams({ filename, subfolder, type })
  const res = await fetch(buildComfyUrl(endpoint, '/view', params))
  if (!res.ok) throw new Error(`ComfyUI image ${res.status}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

export async function uploadImage(
  endpoint: string,
  file: Buffer,
  filename: string,
  mimeType = 'image/png'
): Promise<{ name: string; subfolder: string; type: string }> {
  const form = new FormData()
  form.append('image', new Blob([Uint8Array.from(file)], { type: mimeType }), filename)
  form.append('overwrite', 'true')

  const res = await fetch(buildComfyUrl(endpoint, '/upload/image'), {
    method: 'POST',
    body: form
  })
  if (!res.ok) throw new Error(`ComfyUI upload ${res.status}: ${await res.text()}`)
  return res.json() as Promise<{ name: string; subfolder: string; type: string }>
}

export async function interruptPrompt(endpoint: string): Promise<void> {
  await fetch(buildComfyUrl(endpoint, '/interrupt'), { method: 'POST' })
}

export function extractModelSignature(workflow: Record<string, unknown>): ModelSignature {
  const sig: ModelSignature = { loras: [] }
  for (const node of Object.values(workflow)) {
    const n = node as { class_type?: string; inputs?: Record<string, unknown> }
    if (!n.class_type || !n.inputs) continue
    switch (n.class_type) {
      case 'CheckpointLoaderSimple':
        if (typeof n.inputs.ckpt_name === 'string') sig.checkpoint = n.inputs.ckpt_name
        if (typeof n.inputs.vae_name === 'string') sig.vae = n.inputs.vae_name
        break
      case 'UNETLoader':
        if (typeof n.inputs.unet_name === 'string') sig.unet = n.inputs.unet_name
        break
      case 'VAELoader':
        if (typeof n.inputs.vae_name === 'string') sig.vae = n.inputs.vae_name
        break
      case 'LoraLoader':
        if (typeof n.inputs.lora_name === 'string') sig.loras.push(n.inputs.lora_name)
        break
    }
  }
  return sig
}

export function parseWorkflowNodes(rawJson: Record<string, unknown>): Array<{
  nodeId: string
  nodeType: string
  title?: string
  inputs: Record<string, { type: string; options?: unknown[]; default?: unknown }>
}> {
  const nodes: Array<{
    nodeId: string
    nodeType: string
    title?: string
    inputs: Record<string, { type: string; options?: unknown[]; default?: unknown }>
  }> = []

  for (const [nodeId, nodeRaw] of Object.entries(rawJson)) {
    const node = nodeRaw as { class_type?: string; _meta?: { title?: string }; inputs?: Record<string, unknown> }
    if (!node.class_type) continue

    const inputs: Record<string, { type: string; options?: unknown[]; default?: unknown }> = {}
    if (node.inputs) {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'number') {
          inputs[key] = primitiveInputSpec(node.class_type, key, value)
        } else if (typeof value === 'string') {
          inputs[key] = { type: 'STRING', default: value }
        } else if (typeof value === 'number') {
          inputs[key] = { type: Number.isInteger(value) ? 'INT' : 'FLOAT', default: value }
        } else if (typeof value === 'boolean') {
          inputs[key] = { type: 'BOOLEAN', default: value }
        } else {
          inputs[key] = { type: 'JSON', default: value }
        }
      }
    }

    nodes.push({
      nodeId,
      nodeType: node.class_type,
      title: node._meta?.title,
      inputs
    })
  }
  return nodes
}

function primitiveInputSpec(nodeType: string, inputName: string, value: unknown[]) {
  if (inputName !== 'value') return { type: 'link', default: value }
  if (/PrimitiveString/i.test(nodeType)) return { type: 'STRING', default: '' }
  if (/Primitive(Boolean|Bool)/i.test(nodeType)) return { type: 'BOOLEAN', default: false }
  if (/Primitive(Float|Number)/i.test(nodeType)) return { type: 'FLOAT', default: 0 }
  if (/Primitive(Int|Integer)/i.test(nodeType)) return { type: 'INT', default: 0 }
  return { type: 'link', default: value }
}
