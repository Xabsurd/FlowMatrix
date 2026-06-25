// SPDX-License-Identifier: AGPL-3.0-or-later
import { listOnlineProviders } from '../../infrastructure/providers/registry'

export default defineEventHandler(() => ({
  providers: listOnlineProviders()
}))
