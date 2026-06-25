// SPDX-License-Identifier: AGPL-3.0-or-later
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const SECRET_FORMAT = 'v1'

function getSecretKey() {
  const rawKey = process.env.PROVIDER_ENCRYPTION_KEY || 'flowmatrix-local-lan-mode-development-key'
  return createHash('sha256').update(rawKey).digest()
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    SECRET_FORMAT,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join(':')
}

export function decryptSecret(value: string) {
  const [format, iv, tag, encrypted] = value.split(':')
  if (format !== SECRET_FORMAT || !iv || !tag || !encrypted) {
    throw new Error('Invalid encrypted secret format')
  }

  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final()
  ]).toString('utf8')
}
