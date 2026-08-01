// SPDX-License-Identifier: GPL-3.0-or-later

export const COMFY_RESOURCE_TYPES = [
  'checkpoint',
  'lora',
  'vae',
  'unet',
  'clip',
  'clip_vision',
  'controlnet',
  'upscale',
  'embedding',
  'style_model',
  'gligen',
  'hypernetwork',
  'ipadapter',
  'motion_model'
] as const

export type ComfyResourceType = typeof COMFY_RESOURCE_TYPES[number]

export interface ComfyResourceDefinition {
  type: ComfyResourceType
  label: string
  folder: string
}

export const COMFY_RESOURCE_DEFINITIONS: readonly ComfyResourceDefinition[] = [
  { type: 'checkpoint', label: 'Checkpoint', folder: 'checkpoints' },
  { type: 'lora', label: 'LoRA', folder: 'loras' },
  { type: 'vae', label: 'VAE', folder: 'vae' },
  { type: 'unet', label: 'Diffusion / UNet', folder: 'diffusion_models' },
  { type: 'clip', label: 'Text Encoder / CLIP', folder: 'text_encoders' },
  { type: 'clip_vision', label: 'CLIP Vision', folder: 'clip_vision' },
  { type: 'controlnet', label: 'ControlNet', folder: 'controlnet' },
  { type: 'upscale', label: 'Upscale Model', folder: 'upscale_models' },
  { type: 'embedding', label: 'Embedding', folder: 'embeddings' },
  { type: 'style_model', label: 'Style Model', folder: 'style_models' },
  { type: 'gligen', label: 'GLIGEN', folder: 'gligen' },
  { type: 'hypernetwork', label: 'Hypernetwork', folder: 'hypernetworks' },
  { type: 'ipadapter', label: 'IP-Adapter', folder: 'ipadapter' },
  { type: 'motion_model', label: 'Motion Model', folder: 'animatediff_models' }
] as const

const SPECIFIC_INPUT_NAME_RULES: Array<{ type: ComfyResourceType; pattern: RegExp }> = [
  { type: 'checkpoint', pattern: /^(ckpt|checkpoint)_?name$/i },
  { type: 'lora', pattern: /^lora_?name$/i },
  { type: 'vae', pattern: /^vae_?name$/i },
  { type: 'unet', pattern: /^(unet|diffusion_model)_?name$/i },
  { type: 'clip_vision', pattern: /^clip_?vision_?name$/i },
  { type: 'controlnet', pattern: /^control_?net_?name$/i },
  { type: 'embedding', pattern: /^embedding_?name$/i },
  { type: 'style_model', pattern: /^style_?model_?name$/i },
  { type: 'gligen', pattern: /^gligen_?name$/i },
  { type: 'hypernetwork', pattern: /^hypernetwork_?name$/i },
  { type: 'ipadapter', pattern: /^ip_?adapter(_model)?(_name|_file)?$/i },
  { type: 'motion_model', pattern: /^(motion|animatediff)_?model(_name)?$/i }
]

const NODE_TYPE_RULES: Array<{ type: ComfyResourceType; pattern: RegExp }> = [
  { type: 'clip_vision', pattern: /clip.?vision/i },
  { type: 'checkpoint', pattern: /checkpoint|ckpt/i },
  { type: 'lora', pattern: /lora/i },
  { type: 'vae', pattern: /vae/i },
  { type: 'unet', pattern: /unet|diffusion.?model/i },
  { type: 'clip', pattern: /(^|[^a-z])clip/i },
  { type: 'controlnet', pattern: /control.?net/i },
  { type: 'upscale', pattern: /upscale/i },
  { type: 'embedding', pattern: /embedding/i },
  { type: 'style_model', pattern: /style.?model/i },
  { type: 'gligen', pattern: /gligen/i },
  { type: 'hypernetwork', pattern: /hypernetwork/i },
  { type: 'ipadapter', pattern: /ip.?adapter/i },
  { type: 'motion_model', pattern: /animatediff|motion.?model/i }
]

export function inferComfyResourceType(nodeType: string, inputName: string): ComfyResourceType | '' {
  const inputRule = SPECIFIC_INPUT_NAME_RULES.find(rule => rule.pattern.test(inputName))
  if (inputRule) return inputRule.type

  const nodeRule = NODE_TYPE_RULES.find(rule => rule.pattern.test(nodeType))
  if (nodeRule && /name|model|file|ckpt|lora|vae|clip|embedding/i.test(inputName)) return nodeRule.type

  if (/^clip_?name\d*$/i.test(inputName)) return 'clip'

  return ''
}

export function getComfyResourceDefinition(type: string): ComfyResourceDefinition | undefined {
  return COMFY_RESOURCE_DEFINITIONS.find(item => item.type === type)
}

export function splitComfyResourceName(name: string): { fileName: string; directory: string } {
  const normalized = name.replaceAll('\\', '/')
  const segments = normalized.split('/').filter(Boolean)
  return {
    fileName: segments.pop() || name,
    directory: segments.join('/')
  }
}
