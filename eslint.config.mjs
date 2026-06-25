// SPDX-License-Identifier: AGPL-3.0-or-later
import { createConfigForNuxt } from '@nuxt/eslint-config'

export default createConfigForNuxt({}, {
  ignores: ['.nuxt/**', '.output/**', 'node_modules/**', 'data/**', 'coverage/**']
})
