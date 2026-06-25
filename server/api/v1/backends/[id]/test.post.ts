// SPDX-License-Identifier: AGPL-3.0-or-later
import { testBackendConnection } from '../../../../domain/backends'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return testBackendConnection(id)
})
