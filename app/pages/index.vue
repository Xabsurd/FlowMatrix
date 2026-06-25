<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
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
  { key: 'queued', label: '排队', value: stats.value.taskStatuses.queued, color: 'var(--fm-warning)' },
  { key: 'running', label: '运行', value: stats.value.taskStatuses.running, color: 'var(--fm-primary)' },
  { key: 'succeeded', label: '成功', value: stats.value.taskStatuses.succeeded, color: 'var(--fm-success)' },
  { key: 'failed', label: '失败', value: stats.value.taskStatuses.failed, color: 'var(--fm-danger)' },
  { key: 'canceled', label: '取消', value: stats.value.taskStatuses.canceled, color: 'var(--fm-muted)' }
])

const quickStats = computed(() => [
  { label: '执行后端', value: stats.value.backends, detail: `${stats.value.healthyBackends} 可用` },
  { label: '工作流', value: stats.value.workflows, detail: '已导入' },
  { label: '调用配置', value: stats.value.presets, detail: '可复用预设' },
  { label: '结果', value: stats.value.results, detail: formatBytes(stats.value.storageBytes) }
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

    <div class="hero-grid">
      <ElCard class="overview-card queue-card" shadow="never">
        <template #header>运行概览</template>
        <div class="queue-main">
          <div class="queue-number">{{ activeTasks }}</div>
          <div>
            <div class="queue-label">活跃任务</div>
            <div class="queue-subtitle">{{ stats.queuePending }} 排队 · {{ stats.queueClaimed }} 已领取</div>
          </div>
        </div>

        <div class="status-bar" aria-label="任务状态分布">
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
        <template #header>完成质量</template>
        <div class="ring-wrap">
          <div class="ring" :style="{ '--ring-value': `${successRate}%` }">
            <span>{{ successRate }}%</span>
          </div>
          <div class="ring-meta">
            <div class="ring-title">成功率</div>
            <div class="ring-copy">{{ completedTasks }} 个已结束任务</div>
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
        <template #header>系统状态</template>
        <div class="system-list">
          <div class="system-row">
            <span>Web</span>
            <strong>OK</strong>
          </div>
          <div class="system-row">
            <span>数据库</span>
            <strong>{{ health?.database }}</strong>
          </div>
          <div class="system-row">
            <span>队列</span>
            <strong>{{ health?.queue }}</strong>
          </div>
          <div class="system-row">
            <span>模式</span>
            <strong>{{ health?.mode }}</strong>
          </div>
        </div>
      </ElCard>

      <ElCard class="overview-card" shadow="never">
        <template #header>配置完成度</template>
        <div class="setup-block">
          <ElProgress :percentage="setupProgress" :stroke-width="12" :show-text="false" />
          <div class="setup-percent">{{ setupProgress }}%</div>
          <div class="setup-actions">
            <ElButton @click="navigateTo('/backends')">执行后端</ElButton>
            <ElButton @click="navigateTo('/workflows')">工作流</ElButton>
            <ElButton type="primary" @click="navigateTo('/settings')">设置</ElButton>
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
