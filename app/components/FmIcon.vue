<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import boxesIcon from '@iconify-icons/lucide/boxes'
import chevronsLeftIcon from '@iconify-icons/lucide/chevrons-left'
import chevronsRightIcon from '@iconify-icons/lucide/chevrons-right'
import cpuIcon from '@iconify-icons/lucide/cpu'
import homeIcon from '@iconify-icons/lucide/home'
import imageIcon from '@iconify-icons/lucide/image'
import listChecksIcon from '@iconify-icons/lucide/list-checks'
import moreVerticalIcon from '@iconify-icons/lucide/more-vertical'
import playIcon from '@iconify-icons/lucide/play'
import settingsIcon from '@iconify-icons/lucide/settings'
import uploadCloudIcon from '@iconify-icons/lucide/upload-cloud'
import workflowIcon from '@iconify-icons/lucide/workflow'

const props = defineProps<{
  name: string
  size?: number | string
}>()

const icons = {
  boxes: boxesIcon,
  chevronsLeft: chevronsLeftIcon,
  chevronsRight: chevronsRightIcon,
  cpu: cpuIcon,
  home: homeIcon,
  image: imageIcon,
  listChecks: listChecksIcon,
  moreVertical: moreVerticalIcon,
  play: playIcon,
  settings: settingsIcon,
  uploadCloud: uploadCloudIcon,
  workflow: workflowIcon
}

const icon = computed(() => icons[props.name as keyof typeof icons] ?? homeIcon)
</script>

<template>
  <Icon :icon="icon" :width="size ?? 18" :height="size ?? 18" aria-hidden="true" />
</template>
