// SPDX-License-Identifier: GPL-3.0-or-later
import { createOnlineProviderBatchRun } from '../../../../domain/batch'
import { getBackend } from '../../../../domain/backends'
import { getRequestContext } from '../../../../domain/context'

interface RuntimeAsset {
  storageDriver: string
  storageKey: string
  fileName: string
  mimeType?: string
  fileSize?: number
}

export default defineEventHandler(async (event) => {
  const ctx = getRequestContext(event)
  const body = await readBody<{
    name?: string
    backendId?: string
    mode?: 'text-to-image' | 'image-to-image'
    prompts?: string[]
    imageGroups?: RuntimeAsset[][]
    size?: string
    quality?: string
    outputFormat?: string
    n?: number
    model?: string
  }>(event)

  const backendId = body.backendId?.trim()
  if (!backendId) throw createError({ statusCode: 400, message: '请选择在线 API 执行后端' })

  const backend = getBackend(backendId)
  if (!backend || backend.workspaceId !== ctx.workspaceId || backend.type !== 'provider') {
    throw createError({ statusCode: 400, message: '指定的在线 API 后端不存在' })
  }
  if (!backend.enabled || backend.paused) {
    throw createError({ statusCode: 400, message: '指定的在线 API 后端已禁用或暂停' })
  }

  const prompts = (body.prompts || []).map(prompt => prompt.trim()).filter(Boolean)
  if (!prompts.length) throw createError({ statusCode: 400, message: '请至少输入一个提示词' })
  if (prompts.length > 500) throw createError({ statusCode: 400, message: '单次最多提交 500 个提示词' })

  const mode = body.mode || 'text-to-image'
  const imageGroups = body.imageGroups || []
  if (mode === 'image-to-image') {
    if (!imageGroups.length) throw createError({ statusCode: 400, message: '图生图需要至少一组输入图' })
    if (imageGroups.length !== prompts.length) {
      throw createError({ statusCode: 400, message: '图生图的图片组数量需要和提示词数量一致' })
    }
    if (imageGroups.some(group => group.length < 1 || group.length > 16)) {
      throw createError({ statusCode: 400, message: '图生图每组图片数量需要在 1-16 张之间' })
    }
  }

  return createOnlineProviderBatchRun({
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    name: body.name,
    backendId,
    providerId: backend.endpoint || 'openai',
    mode,
    prompts,
    imageGroups,
    size: body.size,
    quality: body.quality,
    outputFormat: body.outputFormat,
    n: Math.max(1, Math.min(Number(body.n || 1), 10)),
    model: body.model?.trim() || undefined
  })
})
