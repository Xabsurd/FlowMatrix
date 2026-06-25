// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { generateMatrix } from '../server/domain/batch'

describe('generateMatrix', () => {
  it('creates cartesian products for batch inputs', () => {
    const rows = generateMatrix({
      mode: 'cartesian',
      params: {
        prompt: ['a', 'b'],
        lora: ['x', 'y']
      }
    })

    expect(rows).toEqual([
      { prompt: 'a', lora: 'x' },
      { prompt: 'a', lora: 'y' },
      { prompt: 'b', lora: 'x' },
      { prompt: 'b', lora: 'y' }
    ])
  })

  it('zips inputs and cycles shorter columns', () => {
    const rows = generateMatrix({
      mode: 'zip',
      params: {
        prompt: ['a', 'b', 'c'],
        seed: [1]
      }
    })

    expect(rows).toEqual([
      { prompt: 'a', seed: 1 },
      { prompt: 'b', seed: 1 },
      { prompt: 'c', seed: 1 }
    ])
  })

  it('keeps table mode aligned by row index', () => {
    const rows = generateMatrix({
      mode: 'table',
      params: {
        prompt: ['a', 'b'],
        seed: [1, 2]
      }
    })

    expect(rows).toEqual([
      { prompt: 'a', seed: 1 },
      { prompt: 'b', seed: 2 }
    ])
  })

  it('creates one task when all preset params are fixed', () => {
    const rows = generateMatrix({
      mode: 'cartesian',
      params: {}
    })

    expect(rows).toEqual([{}])
  })
})
