// SPDX-License-Identifier: GPL-3.0-or-later

export type ComponentSize = 'large' | 'default' | 'small'

const COMPONENT_SIZE_STORAGE_KEY = 'flowmatrix.component-size'
const DEFAULT_COMPONENT_SIZE: ComponentSize = 'default'
const componentSizes = ['large', 'default', 'small'] as const

function isComponentSize(value: string | null): value is ComponentSize {
  return componentSizes.includes(value as ComponentSize)
}

export function useUiPreferences() {
  const componentSize = useState<ComponentSize>('flowmatrix-component-size', () => DEFAULT_COMPONENT_SIZE)
  const rowActionSize = computed(() => componentSize.value === 'small' ? 'small' : 'default')

  function setComponentSize(value: string | number) {
    const nextSize = isComponentSize(String(value)) ? String(value) as ComponentSize : DEFAULT_COMPONENT_SIZE
    componentSize.value = nextSize

    if (import.meta.client) {
      localStorage.setItem(COMPONENT_SIZE_STORAGE_KEY, nextSize)
    }
  }

  function hydrateUiPreferences() {
    if (!import.meta.client) return
    setComponentSize(localStorage.getItem(COMPONENT_SIZE_STORAGE_KEY) || DEFAULT_COMPONENT_SIZE)
  }

  return {
    componentSize,
    componentSizes,
    rowActionSize,
    hydrateUiPreferences,
    setComponentSize
  }
}
