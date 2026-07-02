// SPDX-License-Identifier: GPL-3.0-or-later
import { cancelBatchRun } from '../../../../domain/batch'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const success = cancelBatchRun(id)
  return { success }
})
