<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
const { componentSize, hydrateUiPreferences } = useUiPreferences()

onMounted(hydrateUiPreferences)
</script>

<template>
  <ElConfigProvider :size="componentSize">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </ElConfigProvider>
</template>
