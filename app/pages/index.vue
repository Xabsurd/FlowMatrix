<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
const { t } = useI18n()
const { data: health } = await useFetch('/api/health')

const stats = computed(() => health.value?.stats ?? {
  backends: 0,
  healthyBackends: 0,
  workflows: 0,
  presets: 0,
  batches: 0,
  results: 0,
  storageBytes: 0,
  queuePending: 0,
  queueClaimed: 0,
  taskStatuses: {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0
  }
})

const taskTotal = computed(() => Object.values(stats.value.taskStatuses).reduce((sum, value) => sum + value, 0))
const activeTasks = computed(() => stats.value.taskStatuses.queued + stats.value.taskStatuses.running)
const completedTasks = computed(() => stats.value.taskStatuses.succeeded + stats.value.taskStatuses.failed + stats.value.taskStatuses.canceled)
const successRate = computed(() => {
  const done = completedTasks.value
  return done > 0 ? Math.round((stats.value.taskStatuses.succeeded / done) * 100) : 0
})

const taskSegments = computed(() => [
  { key: 'queued', label: t('dashboard.statusQueued'), value: stats.value.taskStatuses.queued, color: 'var(--fm-warning)' },
  { key: 'running', label: t('dashboard.statusRunning'), value: stats.value.taskStatuses.running, color: 'var(--fm-primary)' },
  { key: 'succeeded', label: t('dashboard.statusSucceeded'), value: stats.value.taskStatuses.succeeded, color: 'var(--fm-success)' },
  { key: 'failed', label: t('dashboard.statusFailed'), value: stats.value.taskStatuses.failed, color: 'var(--fm-danger)' },
  { key: 'canceled', label: t('dashboard.statusCanceled'), value: stats.value.taskStatuses.canceled, color: 'var(--fm-muted)' }
])

const guideSteps = computed(() => [
  {
    title: t('dashboard.step1Title'),
    detail: stats.value.backends > 0 ? t('dashboard.step1Done', { count: stats.value.backends }) : t('dashboard.step1Todo'),
    done: stats.value.backends > 0,
    action: t('nav.backends'),
    to: '/backends'
  },
  {
    title: t('dashboard.step2Title'),
    detail: stats.value.workflows > 0 ? t('dashboard.step2Done', { count: stats.value.workflows }) : t('dashboard.step2Todo'),
    done: stats.value.workflows > 0,
    action: t('nav.workflows'),
    to: '/workflows'
  },
  {
    title: t('dashboard.step3Title'),
    detail: stats.value.presets > 0 ? t('dashboard.step3Done', { count: stats.value.presets }) : t('dashboard.step3Todo'),
    done: stats.value.presets > 0,
    action: t('nav.presets'),
    to: '/presets'
  },
  {
    title: t('dashboard.step4Title'),
    detail: stats.value.results > 0 ? t('dashboard.step4Done', { count: stats.value.results }) : t('dashboard.step4Todo'),
    done: stats.value.results > 0,
    action: t('run.start'),
    to: '/runs'
  }
])
const quickStats = computed(() => [
  { label: t('nav.backends'), value: stats.value.backends, detail: t('dashboard.available', { count: stats.value.healthyBackends }) },
  { label: t('nav.workflows'), value: stats.value.workflows, detail: t('dashboard.imported') },
  { label: t('nav.presets'), value: stats.value.presets, detail: t('dashboard.reusable') },
  { label: t('nav.result'), value: stats.value.results, detail: formatBytes(stats.value.storageBytes) }
])

const setupProgress = computed(() => {
  const steps = [
    stats.value.backends > 0,
    stats.value.workflows > 0,
    stats.value.presets > 0,
    stats.value.batches > 0 || stats.value.results > 0
  ]
  return Math.round((steps.filter(Boolean).length / steps.length) * 100)
})

function segmentWidth(value: number) {
  if (taskTotal.value === 0) return '0%'
  return `${Math.max((value / taskTotal.value) * 100, value > 0 ? 6 : 0)}%`
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
}
</script>

<template>
  <section class="fm-page home-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">{{ t('dashboard.title') }}</h1>
        <p class="fm-page-subtitle">{{ t('dashboard.subtitle') }}</p>
      </div>
    </div>

    <section class="guide-panel fm-panel">
      <div class="guide-copy">
        <span>{{ t('dashboard.quickStart') }}</span>
        <h2>{{ t('dashboard.guideTitle') }}</h2>
        <p>{{ t('dashboard.guideSubtitle') }}</p>
      </div>
      <div class="guide-steps">
        <NuxtLink v-for="step in guideSteps" :key="step.title" :to="step.to" class="guide-step" :class="{ done: step.done }">
          <span class="guide-check">{{ step.done ? 'OK' : step.title.slice(0, 1) }}</span>
          <div>
            <strong>{{ step.title }}</strong>
            <small>{{ step.detail }}</small>
          </div>
          <em>{{ step.action }}</em>
        </NuxtLink>
      </div>
    </section>
    <div class="hero-grid">
      <ElCard class="overview-card queue-card" shadow="never">
        <template #header>{{ t('dashboard.overview') }}</template>
        <div class="queue-main">
          <div class="queue-number">{{ activeTasks }}</div>
          <div>
            <div class="queue-label">{{ t('dashboard.activeTasks') }}</div>
            <div class="queue-subtitle">{{ t('dashboard.queueSubtitle', { pending: stats.queuePending, claimed: stats.queueClaimed }) }}</div>
          </div>
        </div>

        <div class="status-bar" :aria-label="t('dashboard.statusDistribution')">
          <span
            v-for="segment in taskSegments"
            :key="segment.key"
            class="status-segment"
            :style="{ width: segmentWidth(segment.value), background: segment.color }"
          />
        </div>

        <div class="status-legend">
          <div v-for="segment in taskSegments" :key="segment.key" class="legend-item">
            <span class="legend-dot" :style="{ background: segment.color }" />
            <span>{{ segment.label }}</span>
            <strong>{{ segment.value }}</strong>
          </div>
        </div>
      </ElCard>

      <ElCard class="overview-card ring-card" shadow="never">
        <template #header>{{ t('dashboard.quality') }}</template>
        <div class="ring-wrap">
          <div class="ring" :style="{ '--ring-value': `${successRate}%` }">
            <span>{{ successRate }}%</span>
          </div>
          <div class="ring-meta">
            <div class="ring-title">{{ t('dashboard.successRate') }}</div>
            <div class="ring-copy">{{ t('dashboard.completedTasks', { count: completedTasks }) }}</div>
          </div>
        </div>
      </ElCard>
    </div>

    <div class="metric-grid">
      <ElCard v-for="item in quickStats" :key="item.label" class="metric-card" shadow="never">
        <div class="metric-label">{{ item.label }}</div>
        <div class="metric-value">{{ item.value }}</div>
        <div class="metric-detail">{{ item.detail }}</div>
      </ElCard>
    </div>

    <div class="home-grid">
      <ElCard class="overview-card" shadow="never">
        <template #header>{{ t('dashboard.systemStatus') }}</template>
        <div class="system-list">
          <div class="system-row">
            <span>Web</span>
            <strong>OK</strong>
          </div>
          <div class="system-row">
            <span>{{ t('dashboard.database') }}</span>
            <strong>{{ health?.database }}</strong>
          </div>
          <div class="system-row">
            <span>{{ t('dashboard.queue') }}</span>
            <strong>{{ health?.queue }}</strong>
          </div>
          <div class="system-row">
            <span>{{ t('dashboard.mode') }}</span>
            <strong>{{ health?.mode }}</strong>
          </div>
        </div>
      </ElCard>

      <ElCard class="overview-card" shadow="never">
        <template #header>{{ t('dashboard.setupProgress') }}</template>
        <div class="setup-block">
          <ElProgress :percentage="setupProgress" :stroke-width="12" :show-text="false" />
          <div class="setup-percent">{{ setupProgress }}%</div>
          <div class="setup-actions">
            <ElButton @click="navigateTo('/backends')">{{ t('nav.backends') }}</ElButton>
            <ElButton @click="navigateTo('/workflows')">{{ t('nav.workflows') }}</ElButton>
            <ElButton type="primary" @click="navigateTo('/settings')">{{ t('nav.settings') }}</ElButton>
          </div>
        </div>
      </ElCard>
    </div>
  </section>
</template>

<style scoped>
.home-page {
  gap: 16px;
}

.guide-panel {
  display: grid;
  grid-template-columns: minmax(240px, 0.72fr) minmax(0, 1.28fr);
  gap: 18px;
  padding: 18px;
}

.guide-copy {
  display: grid;
  align-content: start;
  gap: 8px;
}

.guide-copy span,
.guide-step small,
.guide-step em {
  color: var(--fm-muted);
  font-size: 12px;
}

.guide-copy h2 {
  margin: 0;
  color: var(--fm-text);
  font-size: 20px;
}

.guide-copy p {
  margin: 0;
  color: var(--fm-muted);
  line-height: 1.6;
}

.guide-steps {
  display: grid;
  gap: 8px;
}

.guide-step {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 66%, transparent);
  color: var(--fm-text);
}

.guide-step:hover {
  border-color: color-mix(in srgb, var(--fm-primary) 36%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-primary) 9%, var(--fm-panel-muted));
}

.guide-step div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.guide-step strong,
.guide-step small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guide-check {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--fm-border);
  border-radius: 999px;
  color: var(--fm-text);
  font-size: 12px;
  font-weight: 800;
}

.guide-step.done .guide-check {
  border-color: color-mix(in srgb, var(--fm-success) 58%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-success) 16%, transparent);
}
.hero-grid,
.home-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.55fr);
}

.overview-card {
  min-width: 0;
}

.queue-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.queue-number {
  font-size: 52px;
  font-weight: 820;
  line-height: 1;
}

.queue-label,
.ring-title {
  color: var(--fm-text);
  font-size: 16px;
  font-weight: 760;
}

.queue-subtitle,
.ring-copy,
.metric-detail {
  margin-top: 6px;
  color: var(--fm-muted);
  font-size: 13px;
}

.status-bar {
  display: flex;
  gap: 3px;
  height: 12px;
  margin-top: 24px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--fm-field-bg);
}

.status-segment {
  min-width: 0;
}

.status-legend {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 18px;
}

.legend-item {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--fm-muted);
  font-size: 12px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.legend-item strong {
  color: var(--fm-text);
  font-size: 15px;
}

.ring-wrap {
  display: grid;
  place-items: center;
  gap: 14px;
  min-height: 226px;
  text-align: center;
}

.ring {
  --ring-value: 0%;
  display: grid;
  place-items: center;
  width: 150px;
  aspect-ratio: 1;
  border-radius: 999px;
  background:
    radial-gradient(circle at center, var(--fm-panel) 58%, transparent 59%),
    conic-gradient(var(--fm-success) var(--ring-value), var(--fm-field-bg) 0);
}

.ring span {
  color: var(--fm-text);
  font-size: 26px;
  font-weight: 820;
}

.metric-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric-card :deep(.el-card__body) {
  display: grid;
  gap: 8px;
}

.metric-label {
  color: var(--fm-muted);
  font-size: 13px;
}

.metric-value {
  color: var(--fm-text);
  font-size: 34px;
  font-weight: 820;
  line-height: 1;
}

.system-list {
  display: grid;
  gap: 10px;
}

.system-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 42px;
  border-bottom: 1px solid var(--fm-border);
  color: var(--fm-muted);
}

.system-row:last-child {
  border-bottom: 0;
}

.system-row strong {
  color: var(--fm-text);
}

.setup-block {
  display: grid;
  gap: 16px;
}

.setup-percent {
  color: var(--fm-text);
  font-size: 34px;
  font-weight: 820;
}

.setup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 980px) {
  .guide-panel,
  .hero-grid,
  .home-grid,
  .metric-grid {
    grid-template-columns: 1fr;
  }

  .status-legend {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .queue-main {
    align-items: flex-start;
    flex-direction: column;
  }

  .queue-number {
    font-size: 44px;
  }

  .status-legend {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
