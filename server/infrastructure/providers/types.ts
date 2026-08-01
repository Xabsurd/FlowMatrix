// SPDX-License-Identifier: GPL-3.0-or-later
export type ProviderKind = 'openai-compatible' | 'cli-command'

export interface ProviderRuntimeConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs?: number
  binaryPath?: string
}

export interface ProviderDescriptor {
  id: string
  name: string
  kind: ProviderKind
  capabilities: Array<'image-generation' | 'text-generation'>
  defaultBaseUrl: string
  configurable: Array<'apiKey' | 'baseUrl' | 'model'>
}

export interface GenerateImageInput {
  prompt: string
  model?: string
  size?: '1K' | '2K' | '4K' | '1024x1024' | '1024x1536' | '1536x1024' | '1152x1536' | '1536x1152' | '1080x1920' | '1920x1080' | '1080x2520' | '2520x1080' | 'auto'
  quality?: 'low' | 'medium' | 'high' | 'auto'
  outputFormat?: 'png' | 'webp' | 'jpeg'
  n?: number
  imageInputs?: Array<{
    data: Uint8Array
    fileName: string
    mimeType?: string
  }>
}

export interface ProviderImageArtifact {
  index: number
  mimeType: string
  b64Json?: string
  url?: string
  revisedPrompt?: string
}

export interface ProviderGenerateResult {
  providerId: string
  model: string
  artifacts: ProviderImageArtifact[]
  raw: unknown
}

export interface OnlineProviderAdapter {
  descriptor: ProviderDescriptor
  testConnection(config: ProviderRuntimeConfig): Promise<{ ok: boolean, message: string }>
  listImageModels(config: ProviderRuntimeConfig): Promise<string[]>
  generateImage(config: ProviderRuntimeConfig, input: GenerateImageInput): Promise<ProviderGenerateResult>
}
