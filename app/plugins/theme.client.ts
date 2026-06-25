// SPDX-License-Identifier: AGPL-3.0-or-later
export default defineNuxtPlugin(() => {
  const { currentThemeId, hydrateTheme, applyTheme } = useAppTheme()

  hydrateTheme()

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const syncSystemTheme = () => {
    if (currentThemeId.value === 'system') {
      applyTheme('system')
    }
  }

  media.addEventListener('change', syncSystemTheme)
})
