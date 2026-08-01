// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)

const TEST_DIR = join(process.cwd(), 'data', 'results', 'test-gpt-image-2')
const CLI_CMD = 'gpt-image-2-skill.cmd'

describe('GPT Image 2 CLI Integration', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterAll(() => {
    // Cleanup test files
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should run doctor command successfully', async () => {
    const { stdout } = await execFileAsync(CLI_CMD, ['--json', 'doctor'], {
      shell: true,
      timeout: 30000
    })
    const result = JSON.parse(stdout.trim())
    expect(result.ok).toBe(true)
    expect(result.version).toBeDefined()
  }, 30000)

  it('should generate image with codex provider', async () => {
    const outPath = join(TEST_DIR, `${randomUUID()}.png`)
    
    const { stdout } = await execFileAsync(CLI_CMD, [
      '--json',
      '--provider', 'codex',
      'images', 'generate',
      '--prompt', '"A simple red circle on white background"',
      '--size', '1024x1024',
      '--format', 'png',
      '--out', outPath
    ], {
      shell: true,
      timeout: 120000
    })
    
    const result = JSON.parse(stdout.trim())
    console.log('CLI result:', JSON.stringify(result, null, 2))
    
    expect(result.ok).toBe(true)
    expect(result.output).toBeDefined()
    expect(result.output.files).toBeDefined()
    expect(result.output.files.length).toBeGreaterThan(0)
    
    const filePath = result.output.files[0].path
    console.log('Generated file path:', filePath)
    
    // Check file was created
    expect(existsSync(filePath)).toBe(true)
    
    // Check file has content
    const stats = readFileSync(filePath)
    expect(stats.length).toBeGreaterThan(0)
  }, 120000)

  it('should extract file path from CLI result', async () => {
    const outPath = join(TEST_DIR, `${randomUUID()}.png`)
    
    const { stdout } = await execFileAsync(CLI_CMD, [
      '--json',
      '--provider', 'codex',
      'images', 'generate',
      '--prompt', '"A blue square"',
      '--size', '1024x1024',
      '--format', 'png',
      '--out', outPath
    ], {
      shell: true,
      timeout: 120000
    })
    
    const result = JSON.parse(stdout.trim())
    console.log('CLI result:', JSON.stringify(result, null, 2))
    
    expect(result.ok).toBe(true)
    expect(result.output).toBeDefined()
    expect(result.output.files).toBeDefined()
    expect(result.output.files.length).toBeGreaterThan(0)
    
    const filePath = result.output.files[0].path
    
    console.log('Extracted file path:', filePath)
    
    // Should be a valid Windows path
    expect(filePath).toMatch(/^[A-Z]:\\/)
    expect(existsSync(filePath)).toBe(true)
  }, 120000)

  it('should read file using path detection', async () => {
    const outPath = join(TEST_DIR, `${randomUUID()}.png`)
    
    const { stdout } = await execFileAsync(CLI_CMD, [
      '--json',
      '--provider', 'codex',
      'images', 'generate',
      '--prompt', '"A green triangle"',
      '--size', '1024x1024',
      '--format', 'png',
      '--out', outPath
    ], {
      shell: true,
      timeout: 120000
    })
    
    const result = JSON.parse(stdout.trim())
    console.log('CLI result:', JSON.stringify(result, null, 2))
    
    expect(result.ok).toBe(true)
    expect(result.output).toBeDefined()
    expect(result.output.files).toBeDefined()
    expect(result.output.files.length).toBeGreaterThan(0)
    
    const filePath = result.output.files[0].path
    
    // Test path detection logic
    const isWindowsPath = /^[A-Z]:\\/.test(filePath)
    const isUnixPath = filePath.startsWith('/')
    const isLocalPath = isWindowsPath || isUnixPath
    
    console.log('Path detection:', { filePath, isWindowsPath, isUnixPath, isLocalPath })
    
    expect(isLocalPath).toBe(true)
    
    // Test file reading
    if (isLocalPath) {
      const buffer = readFileSync(filePath)
      expect(buffer.length).toBeGreaterThan(0)
      console.log('File size:', buffer.length, 'bytes')
    }
  }, 120000)
})
