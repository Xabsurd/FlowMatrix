// SPDX-License-Identifier: AGPL-3.0-or-later
import { getWorkflow, getWorkflowNodes } from '../../../domain/workflows'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const workflow = getWorkflow(id)
  if (!workflow) throw createError({ statusCode: 404, message: 'Workflow not found' })
  const nodes = getWorkflowNodes(id)
  return { ...workflow, nodes }
})