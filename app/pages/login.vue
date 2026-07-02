<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
const { t } = useI18n()
const config = useRuntimeConfig()
</script>

<template>
  <section class="fm-page">
    <ElCard shadow="never">
      <h1 class="fm-page-title">{{ t('login.title') }}</h1>
      <p v-if="config.public.mode !== 'cloud'" class="fm-page-subtitle">
        {{ t('login.lan') }}
      </p>
      <p v-else class="fm-page-subtitle">
        {{ t('login.cloud') }}
      </p>
      <ElButton type="primary" @click="navigateTo('/')">{{ t('login.backHome') }}</ElButton>
    </ElCard>
  </section>
</template>
