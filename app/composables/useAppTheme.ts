// SPDX-License-Identifier: AGPL-3.0-or-later
import { appThemes } from '~/config/themes'

const THEME_STORAGE_KEY = 'flowmatrix.theme'
const DEFAULT_THEME_ID = 'midnight'
const SYSTEM_DARK_THEME_ID = 'midnight'
const SYSTEM_LIGHT_THEME_ID = 'mist'

type SemanticColor = 'primary' | 'success' | 'warning' | 'danger' | 'info'
type ThemePalette = Record<string, string>

const elementPlusColorMap = {
  primary: ['--fm-primary', '--fm-primary-rgb', '#1774a6'],
  success: ['--fm-success', '--fm-success-rgb', '#218a61'],
  warning: ['--fm-warning', '--fm-warning-rgb', '#b98218'],
  danger: ['--fm-danger', '--fm-danger-rgb', '#c94a5a'],
  info: ['--fm-muted', '', '#647287']
} as const satisfies Record<SemanticColor, readonly [string, string, string]>

let appliedThemeVariables = new Set<string>()

function hexToRgb(value: string) {
  const match = value.trim().match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)

  if (!match) return ''

  return `${Number.parseInt(match[1]!, 16)}, ${Number.parseInt(match[2]!, 16)}, ${Number.parseInt(match[3]!, 16)}`
}

function mix(color: string, amount: number, target = 'transparent') {
  return `color-mix(in srgb, ${color} ${amount}%, ${target})`
}

function paletteValue(palette: ThemePalette, key: string, fallback: string) {
  return palette[key] || fallback
}

function buildElementPlusBaseVariables(palette: ThemePalette, isDark: boolean) {
  const panel = paletteValue(palette, '--fm-panel', '#ffffff')
  const panelMuted = paletteValue(palette, '--fm-panel-muted', '#e8eef5')
  const panelStrong = paletteValue(palette, '--fm-panel-strong', '#f8fafc')
  const popper = paletteValue(palette, '--fm-popper-bg', panel)
  const text = paletteValue(palette, '--fm-text', '#182333')
  const muted = paletteValue(palette, '--fm-muted', '#647287')
  const border = paletteValue(palette, '--fm-border', 'rgba(77, 96, 122, 0.18)')
  const edge = paletteValue(palette, '--fm-glass-edge', 'rgba(255, 255, 255, 0.72)')
  const mask = paletteValue(palette, '--fm-mask', 'rgba(18, 28, 42, 0.28)')
  const shadow = paletteValue(palette, '--fm-shadow', '0 18px 42px rgba(37, 54, 75, 0.12)')

  return {
    '--el-bg-color': mix(panel, 86),
    '--el-bg-color-page': paletteValue(palette, '--fm-bg', '#edf3f8'),
    '--el-bg-color-overlay': mix(popper, 90),
    '--el-fill-color': mix(panelMuted, 80),
    '--el-fill-color-light': mix(panelMuted, 26),
    '--el-fill-color-lighter': mix(panelMuted, 38),
    '--el-fill-color-extra-light': mix(panelStrong, 34),
    '--el-fill-color-dark': mix(panelMuted, 86, `${text} 6%`),
    '--el-fill-color-darker': mix(panelMuted, 78, `${text} 12%`),
    '--el-fill-color-blank': mix(panel, 68),
    '--el-border-color': border,
    '--el-border-color-light': mix(border, 70, edge),
    '--el-border-color-lighter': mix(border, 54, edge),
    '--el-border-color-extra-light': mix(border, 38, edge),
    '--el-border-color-dark': mix(border, 82, `${text} 14%`),
    '--el-border-color-darker': mix(border, 90, `${text} 20%`),
    '--el-text-color-primary': text,
    '--el-text-color-regular': mix(text, 88, muted),
    '--el-text-color-secondary': muted,
    '--el-text-color-placeholder': mix(muted, 72),
    '--el-text-color-disabled': mix(muted, 48),
    '--el-mask-color': mask,
    '--el-mask-color-extra-light': mix(mask, 66),
    '--el-box-shadow': shadow,
    '--el-box-shadow-light': shadow,
    '--el-box-shadow-lighter': isDark ? '0 10px 28px rgba(0, 0, 0, 0.26)' : '0 10px 26px rgba(37, 54, 75, 0.1)',
    '--el-popper-bg-color-dark': mix(popper, 82),
    '--el-popper-bg-color-light': mix(popper, 82)
  }
}

function buildElementPlusColorVariables(palette: ThemePalette, isDark: boolean) {
  const lightMix = isDark ? 'black' : 'white'
  const darkMix = isDark ? 'white' : 'black'
  const variables: Record<string, string> = {
    '--fm-el-light-mix': lightMix,
    '--fm-el-dark-mix': darkMix
  }

  for (const [name, [colorKey, rgbKey, fallback]] of Object.entries(elementPlusColorMap)) {
    const color = paletteValue(palette, colorKey, fallback)
    variables[`--el-color-${name}`] = color
    variables[`--el-color-${name}-rgb`] = rgbKey ? paletteValue(palette, rgbKey, hexToRgb(color)) : hexToRgb(color)
    variables[`--el-color-${name}-light-3`] = mix(color, 70, lightMix)
    variables[`--el-color-${name}-light-5`] = mix(color, 50, lightMix)
    variables[`--el-color-${name}-light-7`] = mix(color, 30, lightMix)
    variables[`--el-color-${name}-light-8`] = mix(color, 20, lightMix)
    variables[`--el-color-${name}-light-9`] = mix(color, 10, lightMix)
    variables[`--el-color-${name}-dark-2`] = mix(color, 80, darkMix)
  }

  for (const suffix of ['', '-rgb', '-light-3', '-light-5', '-light-7', '-light-8', '-light-9', '-dark-2']) {
    variables[`--el-color-error${suffix}`] = variables[`--el-color-danger${suffix}`]!
  }

  return variables
}

function buildElementPlusVariables(palette: ThemePalette) {
  const isDark = palette['--fm-color-scheme'] === 'dark'

  return {
    ...buildElementPlusBaseVariables(palette, isDark),
    ...buildElementPlusColorVariables(palette, isDark)
  }
}

function getTheme(id: string) {
  return appThemes.find(theme => theme.id === id && theme.enabled) ?? appThemes.find(theme => theme.id === DEFAULT_THEME_ID)!
}

function applyCssVariables(root: HTMLElement, variables: ThemePalette) {
  for (const variable of appliedThemeVariables) {
    root.style.removeProperty(variable)
  }

  appliedThemeVariables = new Set(Object.keys(variables))

  for (const [variable, value] of Object.entries(variables)) {
    root.style.setProperty(variable, value)
  }
}

export function useAppTheme() {
  const colorMode = useColorMode()
  const currentThemeId = useState<string>('flowmatrix-theme-id', () => DEFAULT_THEME_ID)

  function getSystemThemeId() {
    if (!import.meta.client) {
      return colorMode.value === 'dark' ? SYSTEM_DARK_THEME_ID : SYSTEM_LIGHT_THEME_ID
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? SYSTEM_DARK_THEME_ID
      : SYSTEM_LIGHT_THEME_ID
  }

  function applyTheme(id = currentThemeId.value) {
    const theme = getTheme(id)
    const resolvedTheme = theme.mode === 'auto' ? getTheme(getSystemThemeId()) : theme
    currentThemeId.value = theme.id

    if (import.meta.client) {
      const root = document.documentElement
      root.dataset.fmTheme = theme.id
      root.dataset.fmResolvedTheme = resolvedTheme.id
      applyCssVariables(root, {
        ...resolvedTheme.palette,
        ...buildElementPlusVariables(resolvedTheme.palette)
      })
      localStorage.setItem(THEME_STORAGE_KEY, theme.id)
    }

    colorMode.preference = theme.mode === 'auto'
      ? 'system'
      : resolvedTheme.palette['--fm-color-scheme'] === 'dark' ? 'dark' : 'light'
  }

  function hydrateTheme() {
    if (import.meta.client) {
      currentThemeId.value = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME_ID
    }

    applyTheme(currentThemeId.value)
  }

  return {
    appThemes,
    currentThemeId,
    applyTheme,
    hydrateTheme,
    getSystemThemeId
  }
}
