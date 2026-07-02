// SPDX-License-Identifier: GPL-3.0-or-later
import { listOnlineProviders } from '../../infrastructure/providers/registry'

export default defineEventHandler(() => ({
  providers: listOnlineProviders()
}))
