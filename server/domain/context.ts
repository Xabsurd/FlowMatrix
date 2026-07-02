// SPDX-License-Identifier: GPL-3.0-or-later
import type { H3Event } from 'h3'
import type { RequestContext, RuntimeMode } from '../../shared/types/app'

const LAN_ACTOR_ID = 'local-operator'
const LAN_WORKSPACE_ID = 'default-workspace'

export function getRequestContext(event: H3Event): RequestContext {
  const config = useRuntimeConfig(event)
  const mode = (config.appMode === 'cloud' ? 'cloud' : 'lan') satisfies RuntimeMode
  const locale = getHeader(event, 'accept-language')?.split(',')[0] || 'zh-CN'

  if (mode === 'lan') {
    return {
      mode,
      actorId: LAN_ACTOR_ID,
      workspaceId: LAN_WORKSPACE_ID,
      locale,
      permissions: ['*']
    }
  }

  return {
    mode,
    actorId: 'anonymous',
    workspaceId: 'unknown',
    locale,
    permissions: []
  }
}
