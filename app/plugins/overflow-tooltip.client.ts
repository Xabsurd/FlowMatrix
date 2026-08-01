// SPDX-License-Identifier: GPL-3.0-or-later
const TOOLTIP_ID = 'fm-global-overflow-tooltip'
const SHOW_DELAY = 180
const VIEWPORT_MARGIN = 8
const TOOLTIP_OFFSET = 9

const KNOWN_TRUNCATION_TARGETS = [
  '[data-overflow-tooltip]',
  '.el-select-dropdown__item',
  '.el-select__selected-item',
  '.el-select__placeholder',
  '.el-table .cell',
  '.el-table-v2__header-cell',
  '.el-table-v2__row-cell',
  '.el-dropdown-menu__item',
  '.el-cascader-node__label',
  '.el-tree-node__label',
  '.el-tabs__item',
  '.el-menu-item',
  '.el-sub-menu__title',
  '.el-tag__content',
  '.el-breadcrumb__inner'
].join(',')

function isLineClamped(style: CSSStyleDeclaration) {
  const lineClamp = style.getPropertyValue('-webkit-line-clamp')
  return Boolean(lineClamp && lineClamp !== 'none' && lineClamp !== '0')
}

function isTruncationTarget(element: HTMLElement) {
  if (element.matches('[data-overflow-tooltip="off"]')) return false
  const style = window.getComputedStyle(element)
  return element.matches(KNOWN_TRUNCATION_TARGETS)
    || style.textOverflow === 'ellipsis'
    || isLineClamped(style)
}

function isOverflowing(element: HTMLElement) {
  return element.scrollWidth > element.clientWidth + 1
    || element.scrollHeight > element.clientHeight + 1
}

function tooltipText(element: HTMLElement) {
  const customText = element.dataset.overflowTooltip
  if (customText && customText !== 'true') return customText.trim()
  return (element.getAttribute('title') || element.innerText || element.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function findOverflowTarget(event: Event) {
  for (const node of event.composedPath()) {
    if (!(node instanceof HTMLElement)) continue
    if (node.id === TOOLTIP_ID || node === document.body || node === document.documentElement) break
    if (node.closest('[data-overflow-tooltip="off"]')) return null
    if (isTruncationTarget(node) && isOverflowing(node) && tooltipText(node)) return node
  }
  return null
}

export default defineNuxtPlugin(() => {
  const tooltip = document.createElement('div')
  tooltip.id = TOOLTIP_ID
  tooltip.className = 'fm-overflow-tooltip'
  tooltip.setAttribute('role', 'tooltip')
  tooltip.hidden = true
  document.body.appendChild(tooltip)

  let activeTarget: HTMLElement | null = null
  let nativeTitle: string | null = null
  let showTimer: number | undefined
  let positionFrame: number | undefined

  function clearPending() {
    if (showTimer !== undefined) {
      window.clearTimeout(showTimer)
      showTimer = undefined
    }
    if (positionFrame !== undefined) {
      window.cancelAnimationFrame(positionFrame)
      positionFrame = undefined
    }
  }

  function restoreNativeTitle() {
    if (activeTarget && nativeTitle !== null && !activeTarget.hasAttribute('title')) {
      activeTarget.setAttribute('title', nativeTitle)
    }
    nativeTitle = null
  }

  function hideTooltip() {
    clearPending()
    tooltip.classList.remove('is-visible')
    tooltip.hidden = true
    restoreNativeTitle()
    activeTarget = null
  }

  function positionTooltip() {
    if (!activeTarget || tooltip.hidden) return
    const targetRect = activeTarget.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN)
    const centeredLeft = targetRect.left + (targetRect.width - tooltipRect.width) / 2
    const left = Math.min(Math.max(centeredLeft, VIEWPORT_MARGIN), maxLeft)
    const topPlacement = targetRect.top - tooltipRect.height - TOOLTIP_OFFSET
    const fitsAbove = topPlacement >= VIEWPORT_MARGIN
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN)
    const top = fitsAbove
      ? topPlacement
      : Math.min(targetRect.bottom + TOOLTIP_OFFSET, maxTop)

    tooltip.dataset.placement = fitsAbove ? 'top' : 'bottom'
    tooltip.style.left = `${Math.round(left)}px`
    tooltip.style.top = `${Math.round(top)}px`
  }

  function showTooltip(target: HTMLElement) {
    if (activeTarget !== target || !target.isConnected || !isOverflowing(target)) {
      hideTooltip()
      return
    }
    const text = tooltipText(target)
    if (!text) {
      hideTooltip()
      return
    }

    nativeTitle = target.getAttribute('title')
    if (nativeTitle !== null) target.removeAttribute('title')
    tooltip.textContent = text
    tooltip.hidden = false
    positionFrame = window.requestAnimationFrame(() => {
      positionFrame = undefined
      positionTooltip()
      tooltip.classList.add('is-visible')
    })
  }

  function scheduleTooltip(target: HTMLElement, immediate = false) {
    if (activeTarget === target && (!tooltip.hidden || showTimer !== undefined)) return
    hideTooltip()
    activeTarget = target
    if (immediate) {
      showTooltip(target)
      return
    }
    showTimer = window.setTimeout(() => {
      showTimer = undefined
      showTooltip(target)
    }, SHOW_DELAY)
  }

  function handlePointerOver(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    const target = findOverflowTarget(event)
    if (target) scheduleTooltip(target)
    else hideTooltip()
  }

  function handlePointerOut(event: PointerEvent) {
    if (!activeTarget) return
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && activeTarget.contains(relatedTarget)) return
    hideTooltip()
  }

  function handleFocusIn(event: FocusEvent) {
    const target = findOverflowTarget(event)
    if (target) scheduleTooltip(target, true)
  }

  function handleFocusOut(event: FocusEvent) {
    if (!activeTarget) return
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && activeTarget.contains(relatedTarget)) return
    hideTooltip()
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') hideTooltip()
  }

  document.addEventListener('pointerover', handlePointerOver, true)
  document.addEventListener('pointerout', handlePointerOut, true)
  document.addEventListener('focusin', handleFocusIn, true)
  document.addEventListener('focusout', handleFocusOut, true)
  document.addEventListener('keydown', handleKeydown, true)
  window.addEventListener('resize', hideTooltip)
  window.addEventListener('scroll', hideTooltip, true)

  const cleanup = () => {
    document.removeEventListener('pointerover', handlePointerOver, true)
    document.removeEventListener('pointerout', handlePointerOut, true)
    document.removeEventListener('focusin', handleFocusIn, true)
    document.removeEventListener('focusout', handleFocusOut, true)
    document.removeEventListener('keydown', handleKeydown, true)
    window.removeEventListener('resize', hideTooltip)
    window.removeEventListener('scroll', hideTooltip, true)
    hideTooltip()
    tooltip.remove()
  }

  import.meta.hot?.dispose(cleanup)
})