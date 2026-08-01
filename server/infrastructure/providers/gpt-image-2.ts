// SPDX-License-Identifier: GPL-3.0-or-later
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type {
  GenerateImageInput,
  OnlineProviderAdapter,
  ProviderRuntimeConfig
} from './types'

const execFileAsync = promisify(execFile)

function getOutputDir(): string {
  const storageRoot = process.env.FLOWMATRIX_STORAGE_ROOT || './data/results'
  const dir = join(resolve(process.cwd(), storageRoot), 'gpt-image-2')
  mkdirSync(dir, { recursive: true })
  return dir
}

interface CliResult {
  ok: boolean
  error?: {
    code: string
    message: string
    detail?: unknown
  }
  data?: unknown
  [key: string]: unknown
}

async function executeCli(binaryPath: string, args: string[], timeoutMs = 300_000): Promise<CliResult> {
  const fullArgs = ['--json', ...args]
  console.log(`[gpt-image-2] Executing: ${binaryPath} ${fullArgs.join(' ')}`)
  
  try {
    const { stdout } = await execFileAsync(binaryPath, fullArgs, {
      timeout: timeoutMs,
      env: {
        ...process.env,
        GPT_IMAGE_2_SKILL_SKIP_BOOTSTRAP: '1'
      },
      shell: true
    })
    console.log(`[gpt-image-2] stdout: ${stdout.trim().substring(0, 500)}`)
    return JSON.parse(stdout.trim())
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string; stdout?: string }
    console.error(`[gpt-image-2] Error: ${err.message}`)
    console.error(`[gpt-image-2] stderr: ${err.stderr}`)
    console.error(`[gpt-image-2] stdout: ${err.stdout}`)
    
    // Try to parse stderr as JSON
    if (err.stderr) {
      try {
        const parsed = JSON.parse(err.stderr.trim())
        console.log(`[gpt-image-2] Parsed stderr:`, parsed)
        return parsed
      } catch {
        // Ignore JSON parse errors from stderr
      }
    }
    
    // Try to parse stdout as JSON (some errors are in stdout)
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout.trim())
        console.log(`[gpt-image-2] Parsed stdout:`, parsed)
        return parsed
      } catch {
        // Ignore JSON parse errors from stdout
      }
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `CLI execution failed: ${err.message || 'Unknown error'}`
    })
  }
}

function resolveBinaryPath(_config: ProviderRuntimeConfig): string {
  // On Windows, use gpt-image-2-skill.cmd
  return 'gpt-image-2-skill.cmd'
}

function assertProviderConfig(_config: ProviderRuntimeConfig) {
  // CLI provider does not need apiKey
}

export const gptImage2ProviderAdapter: OnlineProviderAdapter = {
  descriptor: {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    kind: 'openai-compatible',
    capabilities: ['image-generation'],
    defaultBaseUrl: '',
    configurable: ['apiKey', 'baseUrl', 'model']
  },

  async testConnection(_config) {
    const binaryPath = resolveBinaryPath(_config)
    const startedAt = Date.now()

    try {
      const result = await executeCli(binaryPath, ['doctor'])
      if (result.ok) {
        return {
          ok: true,
          message: `OK ${Date.now() - startedAt}ms`
        }
      }
      return {
        ok: false,
        message: result.error?.message || 'CLI doctor check failed'
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Failed to execute CLI'
      }
    }
  },

  async listImageModels(_config) {
    return [
      'gpt-image-1',
      'dall-e-3',
      'dall-e-2'
    ]
  },

  async generateImage(config: ProviderRuntimeConfig, input: GenerateImageInput) {
    assertProviderConfig(config)
    const binaryPath = resolveBinaryPath(config)
    const model = input.model || config.model || 'gpt-image-1'
    
    // Use project output directory
    const outputDir = getOutputDir()
    const outPath = join(outputDir, `${randomUUID()}.png`)

    const args = ['--provider', 'codex', 'images', 'generate']
    args.push('--prompt', input.prompt)
    args.push('--size', mapSize(input.size || '1024x1024'))
    args.push('--format', input.outputFormat || 'png')
    args.push('--out', outPath)

    if (input.quality && input.quality !== 'auto') {
      args.push('--quality', input.quality)
    }

    const result = await executeCli(binaryPath, args)

    if (!result.ok) {
      throw createError({
        statusCode: 500,
        statusMessage: result.error?.message || 'Image generation failed'
      })
    }

    // Safely access nested properties
    const output = result.output as Record<string, unknown> | undefined
    const files = (output?.files || []) as Array<{ path?: string; bytes?: number }>
    
    // If no files in output, use the outPath we specified
    if (files.length === 0) {
      return {
        providerId: this.descriptor.id,
        model,
        artifacts: [{
          index: 0,
          mimeType: `image/${input.outputFormat || 'png'}`,
          url: outPath
        }],
        raw: result
      }
    }

    const artifacts = files.map((file, index) => ({
      index,
      mimeType: `image/${input.outputFormat || 'png'}`,
      url: file.path || outPath
    }))

    return {
      providerId: this.descriptor.id,
      model,
      artifacts,
      raw: result
    }
  }
}

function mapSize(size: string): string {
  const sizeMap: Record<string, string> = {
    '1K': '1024x1024',
    '2K': '2K',
    '4K': '4K',
    '1024x1024': '1024x1024',
    '1024x1536': '1024x1536',
    '1536x1024': '1536x1024',
    '1152x1536': '1152x1536',
    '1536x1152': '1536x1152',
    '1080x1920': '1080x1920',
    '1920x1080': '1920x1080',
    '1080x2520': '1080x2520',
    '2520x1080': '2520x1080',
    'auto': 'auto'
  }
  return sizeMap[size] || size
}
