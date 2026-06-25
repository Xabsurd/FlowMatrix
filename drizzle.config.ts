// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/infrastructure/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL?.replace(/^file:/, '') || './data/flowmatrix.sqlite'
  }
})
