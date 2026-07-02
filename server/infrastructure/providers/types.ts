// SPDX-License-Identifier: GPL-3.0-or-later
export type ProviderKind = 'openai-compatible'

export interface ProviderRuntimeConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs?: number
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
  size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto'
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
  generateImage(config: ProviderRuntimeConfig, input: GenerateImageInput): Promise<ProviderGenerateResult>
}
