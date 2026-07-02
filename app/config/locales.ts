// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppLocale } from '~~/shared/types/app'

export const appLocales: AppLocale[] = [
  {
    code: 'zh-CN',
    name: 'Chinese Simplified',
    nativeName: '简体中文',
    enabled: true
  },
  {
    code: 'en-US',
    name: 'English',
    nativeName: 'English',
    enabled: true,
    fallback: 'zh-CN'
  }
]
