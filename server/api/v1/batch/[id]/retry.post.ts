// SPDX-License-Identifier: AGPL-3.0-or-later
import { retryFailedTasks } from '../../../../domain/batch'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const count = retryFailedTasks(id)
  return { count }
})
