<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { mobileNavigationItems, navigationItems } from '~/config/navigation'

const { t } = useI18n()
const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const sidebarMode = ref<'expanded' | 'collapsed'>('expanded')

const modeLabel = computed(() => (
  runtimeConfig.public.mode === 'cloud' ? t('app.modeCloud') : t('app.modeLan')
))

const shellClass = computed(() => ({
  'is-sidebar-collapsed': sidebarMode.value === 'collapsed'
}))

function isActivePath(target: string) {
  return route.path === target || (target !== '/' && route.path.startsWith(target))
}

function setSidebarMode(mode: 'expanded' | 'collapsed') {
  sidebarMode.value = mode
  if (import.meta.client) localStorage.setItem('flowmatrix.sidebar-mode', mode)
}

onMounted(() => {
  const saved = localStorage.getItem('flowmatrix.sidebar-mode')
  if (saved === 'collapsed' || saved === 'expanded') {
    sidebarMode.value = saved
  } else if (saved === 'hidden') {
    setSidebarMode('collapsed')
  }
})
</script>

<template>
  <div class="shell" :class="shellClass">
    <aside class="sidebar fm-panel fm-sidebar-surface">
      <div class="sidebar-top">
        <NuxtLink class="brand" to="/">
          <span class="brand-mark">
            <FmLogo />
          </span>
          <span class="brand-text">{{ t('app.name') }}</span>
        </NuxtLink>
        <div class="sidebar-actions">
          <ElButton
            class="sidebar-action"
            circle
            text
            :title="sidebarMode === 'collapsed' ? '展开导航' : '收起导航'"
            @click="setSidebarMode(sidebarMode === 'collapsed' ? 'expanded' : 'collapsed')"
          >
            <FmIcon :name="sidebarMode === 'collapsed' ? 'chevronsRight' : 'chevronsLeft'" />
          </ElButton>
        </div>
      </div>
      <ElTag class="mode-tag" type="success" effect="plain">{{ modeLabel }}</ElTag>
      <nav class="nav-list" aria-label="主导航">
        <NuxtLink
          v-for="item in navigationItems"
          :key="item.to"
          class="nav-item"
          :class="{ active: isActivePath(item.to) }"
          :to="item.to"
          :title="t(item.key)"
          :data-label="t(item.key)"
        >
          <FmIcon class="nav-icon" :name="item.icon" />
          <span class="nav-label">{{ t(item.key) }}</span>
        </NuxtLink>
      </nav>
    </aside>

    <main class="main">
      <slot />
    </main>

    <nav class="bottom-nav fm-panel" aria-label="移动端主导航">
      <NuxtLink
        v-for="item in mobileNavigationItems"
        :key="item.to"
        class="bottom-nav-item"
        :class="{ active: isActivePath(item.to) }"
        :to="item.to"
      >
        <FmIcon :name="item.icon" />
        <span>{{ t(item.key) }}</span>
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  width: 100%;
  max-width: 100vw;
  min-height: 100vh;
  gap: 18px;
  padding: 18px;
  overflow-x: clip;
  transition:
    grid-template-columns 180ms cubic-bezier(0.2, 0, 0.2, 1),
    gap 180ms ease,
    padding 180ms ease;
}

.shell.is-sidebar-collapsed {
  grid-template-columns: 86px minmax(0, 1fr);
}

.sidebar {
  position: sticky;
  top: 18px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 36px);
  padding: 18px;
  overflow: visible;
  transition:
    padding 180ms cubic-bezier(0.2, 0, 0.2, 1),
    border-color 160ms ease,
    background 160ms ease;
}

.sidebar-top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  min-width: 0;
}

.brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
  min-height: 46px;
  font-weight: 800;
  line-height: 1.2;
  min-width: 0;
}

.brand-mark {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  color: color-mix(in srgb, var(--fm-primary) 78%, var(--fm-text));
  transform: translateX(0);
  transition: transform 180ms cubic-bezier(0.2, 0, 0.2, 1);
}

.brand-text {
  position: absolute;
  right: 0;
  left: 48px;
  overflow: hidden;
  opacity: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: translateX(0);
  transition:
    opacity 120ms ease,
    transform 180ms ease;
}

.sidebar-actions {
  position: absolute;
  top: 4px;
  left: 204px;
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  transform: translate(0, 0);
  transition:
    left 180ms cubic-bezier(0.2, 0, 0.2, 1),
    transform 180ms cubic-bezier(0.2, 0, 0.2, 1);
}

.sidebar-action {
  color: var(--fm-muted);
}

.mode-tag {
  position: absolute;
  top: 82px;
  left: 18px;
  max-width: calc(100% - 36px);
  transform: translateY(0);
  transition:
    opacity 120ms ease,
    transform 180ms ease;
}

.nav-list {
  display: grid;
  gap: 8px;
  margin-top: 70px;
  transition:
    gap 180ms ease,
    margin-top 180ms cubic-bezier(0.2, 0, 0.2, 1);
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0;
  min-height: 42px;
  border-radius: var(--fm-radius);
  border: 1px solid transparent;
  padding: 0 12px;
  color: var(--fm-muted);
  transition:
    padding 180ms ease,
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.nav-icon {
  flex: 0 0 auto;
  transform: translateX(0);
  transition: transform 180ms cubic-bezier(0.2, 0, 0.2, 1);
}

.nav-label {
  position: absolute;
  right: 12px;
  left: 40px;
  overflow: hidden;
  opacity: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: translateX(0);
  transition:
    opacity 120ms ease,
    transform 180ms ease;
}

.nav-item.active,
.nav-item:hover {
  border-color: color-mix(in srgb, var(--fm-primary) 28%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-primary) 12%, var(--fm-panel-strong));
  color: color-mix(in srgb, var(--fm-primary) 72%, var(--fm-text));
}

.main {
  position: relative;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 10px 4px 36px;
}

.is-sidebar-collapsed .sidebar {
  padding: 18px 12px;
}

.is-sidebar-collapsed .brand-text,
.is-sidebar-collapsed .mode-tag,
.is-sidebar-collapsed .nav-label {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-4px);
}

.is-sidebar-collapsed .brand-mark {
  transform: translateX(12px);
}

.is-sidebar-collapsed .sidebar-actions {
  left: 15px;
  transform: translate(0, 46px);
}

.is-sidebar-collapsed .mode-tag {
  transform: translateY(-4px);
}

.is-sidebar-collapsed .nav-list,
.is-sidebar-collapsed .nav-item {
  width: 100%;
}

.is-sidebar-collapsed .nav-list {
  margin-top: 54px;
}

.is-sidebar-collapsed .nav-item {
  gap: 0;
  padding: 0 12px;
}

.is-sidebar-collapsed .nav-icon {
  transform: translateX(9px);
}

.is-sidebar-collapsed .nav-item::after {
  position: absolute;
  top: 50%;
  left: calc(100% + 10px);
  z-index: 120;
  display: block;
  max-width: 180px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  padding: 6px 9px;
  background: color-mix(in srgb, var(--fm-popper-bg) 88%, transparent);
  box-shadow: var(--fm-shadow);
  color: var(--fm-text);
  content: attr(data-label);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
  opacity: 0;
  pointer-events: none;
  transform: translate(4px, -50%);
  transition: opacity 120ms ease, transform 120ms ease;
  white-space: nowrap;
}

.is-sidebar-collapsed .nav-item:hover::after,
.is-sidebar-collapsed .nav-item:focus-visible::after {
  opacity: 1;
  transform: translate(0, -50%);
}

@media (min-width: 921px) and (max-width: 1100px) {
  .shell {
    grid-template-columns: minmax(220px, 238px) minmax(0, 1fr);
    gap: 14px;
    padding: 14px;
  }

  .sidebar {
    top: 14px;
    height: calc(100vh - 28px);
    padding: 14px;
  }

  .mode-tag {
    top: 78px;
    left: 14px;
    max-width: calc(100% - 28px);
  }

  .nav-item {
    padding-inline: 10px;
  }

  .sidebar-actions {
    left: calc(100% - 32px);
  }
}

.bottom-nav {
  display: none;
}

.bottom-nav-item {
  display: grid;
  place-items: center;
  gap: 2px;
  min-width: 0;
  min-height: 44px;
  border-radius: var(--fm-radius);
  color: var(--fm-muted);
  font-size: 13px;
  font-weight: 650;
}

.bottom-nav-item.active {
  background: color-mix(in srgb, var(--fm-primary) 13%, transparent);
  color: color-mix(in srgb, var(--fm-primary) 72%, var(--fm-text));
}

@media (max-width: 920px) {
  .shell {
    display: block;
    grid-template-columns: 1fr;
    width: 100%;
    max-width: 100vw;
    padding: 10px 10px 142px;
    overflow-x: hidden;
  }

  .sidebar {
    display: none !important;
  }

  .bottom-nav {
    position: fixed;
    right: 10px;
    bottom: 10px;
    left: 10px;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    padding: 6px;
    backdrop-filter: blur(var(--fm-blur)) saturate(1.12);
    -webkit-backdrop-filter: blur(var(--fm-blur)) saturate(1.12);
  }

  .main {
    width: 100%;
    max-width: 100%;
    padding-bottom: 24px;
    overflow-x: clip;
  }
}
</style>
