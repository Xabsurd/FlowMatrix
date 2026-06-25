// SPDX-License-Identifier: AGPL-3.0-or-later
export default defineNuxtConfig({
  compatibilityDate: '2026-06-18',
  devtools: { enabled: true },
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/flowmatrix-icon.svg' }
      ]
    }
  },
  modules: [
    '@element-plus/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/i18n',
    '@nuxtjs/color-mode'
  ],
  css: [
    'element-plus/theme-chalk/dark/css-vars.css',
    '~/assets/css/palette.css',
    '~/assets/css/base.css',
    '~/assets/css/surfaces.css',
    '~/assets/css/forms.css',
    '~/assets/css/primitives.css'
  ],
  elementPlus: {
    importStyle: 'scss',
    defaultLocale: 'zh-cn'
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@use "~/assets/scss/element-plus.scss" as *;'
        }
      }
    }
  },
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: ''
  },
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'zh-CN',
    locales: [
      { code: 'zh-CN', name: '简体中文', file: 'zh-CN.json' },
      { code: 'en-US', name: 'English', file: 'en-US.json' }
    ],
    langDir: '../i18n/locales',
    detectBrowserLanguage: false,
    vueI18n: '../i18n/i18n.config.ts'
  },
  runtimeConfig: {
    appMode: process.env.FLOWMATRIX_MODE || 'lan',
    databaseUrl: process.env.DATABASE_URL || 'file:./data/flowmatrix.sqlite',
    storageRoot: process.env.FLOWMATRIX_STORAGE_ROOT || './data/results',
    providerEncryptionKey: process.env.PROVIDER_ENCRYPTION_KEY || '',
    public: {
      appName: 'FlowMatrix',
      defaultLocale: 'zh-CN',
      mode: process.env.FLOWMATRIX_MODE || 'lan'
    }
  },
  nitro: {
    experimental: {
      openAPI: true
    }
  },
  typescript: {
    strict: true,
    typeCheck: false
  }
})
