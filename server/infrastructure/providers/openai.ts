// SPDX-License-Identifier: GPL-3.0-or-later
import OpenAI, { toFile } from 'openai'
import { createError } from 'h3'
import type {
  GenerateImageInput,
  OnlineProviderAdapter,
  ProviderRuntimeConfig
} from './types'

function createClient(config: ProviderRuntimeConfig) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: config.timeoutMs || 120_000
  })
}

function assertProviderConfig(config: ProviderRuntimeConfig) {
  if (!config.apiKey) {
    throw createError({
      statusCode: 400,
      statusMessage: '请先在系统设置中保存在线 API Key'
    })
  }

  if (!config.baseUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provider baseURL is required'
    })
  }
}

function isUnsupportedModelsEndpoint(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: number }).status)
    : 0
  if ([404, 405, 501].includes(status)) return true

  const message = error instanceof Error ? error.message : String(error)
  return /\bmodels\b/i.test(message) && /not found|unsupported|not implemented|method not allowed/i.test(message)
}

function usesGptImageOptions(model: string) {
  return /^gpt-image(?:-|$)/i.test(model)
}

function isLikelyImageModel(model: string) {
  return /(?:gpt-image|dall-e|image|imagen|flux|stable-diffusion|sdxl|\bsd\d|qwen[-_.]?image|kolors|janus|hidream|ideogram|recraft|seedream)/i.test(model)
}

function sortModels(models: string[]) {
  return [...new Set(models)]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
}

function pickImageModels(models: string[]) {
  const sorted = sortModels(models)
  const imageModels = sorted.filter(isLikelyImageModel)
  return imageModels.length ? imageModels : sorted
}

function createImageRequest(input: GenerateImageInput, model: string) {
  const request: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    n: input.n || 1
  }

  if (input.size && input.size !== 'auto') request.size = input.size

  if (usesGptImageOptions(model)) {
    request.size = input.size || '1024x1024'
    request.quality = input.quality || 'auto'
    request.output_format = input.outputFormat || 'png'
  } else {
    request.response_format = 'b64_json'
    if (input.quality && input.quality !== 'auto') request.quality = input.quality
  }

  return request
}

export const openaiProviderAdapter: OnlineProviderAdapter = {
  descriptor: {
    id: 'openai',
    name: 'OpenAI Compatible',
    kind: 'openai-compatible',
    capabilities: ['image-generation', 'text-generation'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    configurable: ['apiKey', 'baseUrl', 'model']
  },

  async testConnection(config) {
    assertProviderConfig(config)

    const startedAt = Date.now()
    const client = createClient(config)
    try {
      await client.models.list()
      return {
        ok: true,
        message: `OK ${Date.now() - startedAt}ms`
      }
    } catch (error) {
      if (!isUnsupportedModelsEndpoint(error)) throw error
      return {
        ok: true,
        message: `OK ${Date.now() - startedAt}ms (provider does not expose /models)`
      }
    }
  },

  async listImageModels(config) {
    assertProviderConfig(config)

    const client = createClient(config)
    const response = await client.models.list()
    const models = response.data.map(model => model.id)
    return pickImageModels(models)
  },

  async generateImage(config: ProviderRuntimeConfig, input: GenerateImageInput) {
    assertProviderConfig(config)

    const client = createClient(config)
    const model = input.model || config.model
    const imageInputs = input.imageInputs || []
    const request = createImageRequest(input, model)
    const response = imageInputs.length
      ? await client.images.edit({
          ...request,
          image: await Promise.all(imageInputs.map(image => toFile(image.data, image.fileName, { type: image.mimeType })))
        } as unknown as Parameters<typeof client.images.edit>[0])
      : await client.images.generate(request as unknown as Parameters<typeof client.images.generate>[0])
    const images = 'data' in response && Array.isArray(response.data) ? response.data : []

    return {
      providerId: this.descriptor.id,
      model,
      artifacts: images.map((item, index) => ({
        index,
        mimeType: `image/${input.outputFormat || 'png'}`,
        b64Json: item.b64_json,
        url: item.url,
        revisedPrompt: item.revised_prompt
      })),
      raw: response
    }
  }
}
