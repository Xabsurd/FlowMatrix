// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  getComfyResourceDefinition,
  inferComfyResourceType,
  splitComfyResourceName
} from '../shared/utils/model-resources'

describe('ComfyUI model resource classification', () => {
  it.each([
    ['CheckpointLoaderSimple', 'ckpt_name', 'checkpoint'],
    ['UNETLoader', 'unet_name', 'unet'],
    ['VAELoader', 'vae_name', 'vae'],
    ['LoraLoader', 'lora_name', 'lora'],
    ['CLIPLoader', 'clip_name', 'clip'],
    ['DualCLIPLoader', 'clip_name1', 'clip'],
    ['TripleCLIPLoader', 'clip_name3', 'clip'],
    ['CLIPVisionLoader', 'clip_name', 'clip_vision'],
    ['ControlNetLoader', 'control_net_name', 'controlnet'],
    ['UpscaleModelLoader', 'model_name', 'upscale'],
    ['IPAdapterModelLoader', 'ipadapter_file', 'ipadapter'],
    ['ADE_AnimateDiffLoaderGen1', 'model_name', 'motion_model']
  ])('maps %s.%s to %s', (nodeType, inputName, expected) => {
    expect(inferComfyResourceType(nodeType, inputName)).toBe(expected)
  })

  it('provides folder metadata and splits nested model paths', () => {
    expect(getComfyResourceDefinition('checkpoint')?.folder).toBe('checkpoints')
    expect(splitComfyResourceName('illustrious\\characters\\hero.safetensors')).toEqual({
      fileName: 'hero.safetensors',
      directory: 'illustrious/characters'
    })
  })
})
