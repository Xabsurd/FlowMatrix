<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
const config = useRuntimeConfig()
</script>

<template>
  <section class="fm-page">
    <ElCard shadow="never">
      <h1 class="fm-page-title">登录</h1>
      <p v-if="config.public.mode !== 'cloud'" class="fm-page-subtitle">
        当前为局域网模式，无需登录即可使用。
      </p>
      <p v-else class="fm-page-subtitle">
        上线模式将启用用户、工作区和权限隔离。
      </p>
      <ElButton type="primary" @click="navigateTo('/')">返回主页</ElButton>
    </ElCard>
  </section>
</template>
