// SPDX-License-Identifier: AGPL-3.0-or-later
import { getBackendResources } from '../../../../domain/backends'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const type = getQuery(event).type as string | undefined
  return getBackendResources(id, type || undefined)
})
