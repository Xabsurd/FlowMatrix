<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<template>
  <section class="fm-page run-workspace">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">{{ $t('run.title') }}</h1>
        <p class="fm-page-subtitle">{{ $t('run.subtitle') }}</p>
      </div>
    </div>

    <ElTabs v-model="activeTab" class="run-tabs">
      <ElTabPane :label="$t('run.workflowTab')" name="workflow">
        <BatchRunWorkspace embedded />
      </ElTabPane>
      <ElTabPane :label="$t('run.onlineTab')" name="online">
        <OnlineApiRunWorkspace />
      </ElTabPane>
    </ElTabs>
  </section>
</template>

<script setup lang="ts">
const route = useRoute()
const activeTab = ref('workflow')

watch(activeTab, (tab) => {
  if (import.meta.client) localStorage.setItem('flowmatrix.run-tab', tab)
})

onMounted(() => {
  if (typeof route.query.presetId === 'string') {
    activeTab.value = 'workflow'
    return
  }
  const requested = route.query.mode
  const saved = localStorage.getItem('flowmatrix.run-tab')
  if (requested === 'online' || requested === 'workflow') activeTab.value = requested
  else if (saved === 'online' || saved === 'workflow') activeTab.value = saved
})
</script>

<style scoped>
.run-workspace :deep(.fm-page) {
  padding: 0;
}

.run-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}
</style>
