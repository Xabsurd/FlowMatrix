// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelPrompt, getPromptQueueState } from '../server/infrastructure/comfyui/client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ComfyUI prompt cancellation', () => {
  it('finds prompt IDs in ComfyUI queue entries', () => {
    expect(getPromptQueueState({
      queue_running: [[1, 'running-prompt', {}, {}]],
      queue_pending: [[2, 'pending-prompt', {}, {}]]
    }, 'running-prompt')).toBe('running')

    expect(getPromptQueueState({
      queue_running: [],
      queue_pending: [[2, 'pending-prompt', {}, {}]]
    }, 'pending-prompt')).toBe('pending')
  })

  it('deletes only the selected pending prompt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        queue_running: [],
        queue_pending: [[2, 'prompt-123', {}, {}]]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(cancelPrompt('http://127.0.0.1:8188', 'prompt-123')).resolves.toBe('pending')
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8188/queue', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ delete: ['prompt-123'] })
    }))
  })

  it('interrupts a prompt only when it is currently running', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        queue_running: [[1, 'prompt-456', {}, {}]],
        queue_pending: []
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(cancelPrompt('http://127.0.0.1:8188/', 'prompt-456')).resolves.toBe('running')
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8188/interrupt', { method: 'POST' })
  })
})
