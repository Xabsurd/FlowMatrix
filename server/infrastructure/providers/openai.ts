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
    await client.models.list()

    return {
      ok: true,
      message: `OK ${Date.now() - startedAt}ms`
    }
  },

  async generateImage(config: ProviderRuntimeConfig, input: GenerateImageInput) {
    assertProviderConfig(config)

    const client = createClient(config)
    const model = input.model || config.model
    const imageInputs = input.imageInputs || []
    const response = imageInputs.length
      ? await client.images.edit({
          model,
          image: await Promise.all(imageInputs.map(image => toFile(image.data, image.fileName, { type: image.mimeType }))),
          prompt: input.prompt,
          n: input.n || 1,
          size: input.size || '1024x1024',
          quality: input.quality || 'auto',
          output_format: input.outputFormat || 'png'
        } as Parameters<typeof client.images.edit>[0])
      : await client.images.generate({
          model,
          prompt: input.prompt,
          n: input.n || 1,
          size: input.size || '1024x1024',
          quality: input.quality || 'auto',
          output_format: input.outputFormat || 'png'
        } as Parameters<typeof client.images.generate>[0])
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
