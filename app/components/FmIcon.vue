<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import arrowLeftIcon from '@iconify-icons/lucide/arrow-left'
import boxesIcon from '@iconify-icons/lucide/boxes'
import chevronDownIcon from '@iconify-icons/lucide/chevron-down'
import chevronLeftIcon from '@iconify-icons/lucide/chevron-left'
import chevronRightIcon from '@iconify-icons/lucide/chevron-right'
import chevronUpIcon from '@iconify-icons/lucide/chevron-up'
import chevronsLeftIcon from '@iconify-icons/lucide/chevrons-left'
import chevronsRightIcon from '@iconify-icons/lucide/chevrons-right'
import cpuIcon from '@iconify-icons/lucide/cpu'
import homeIcon from '@iconify-icons/lucide/home'
import imageIcon from '@iconify-icons/lucide/image'
import infoIcon from '@iconify-icons/lucide/info'
import listChecksIcon from '@iconify-icons/lucide/list-checks'
import moreVerticalIcon from '@iconify-icons/lucide/more-vertical'
import playIcon from '@iconify-icons/lucide/play'
import settingsIcon from '@iconify-icons/lucide/settings'
import uploadCloudIcon from '@iconify-icons/lucide/upload-cloud'
import workflowIcon from '@iconify-icons/lucide/workflow'
import xIcon from '@iconify-icons/lucide/x'

const props = defineProps<{
  name: string
  size?: number | string
}>()

const icons = {
  arrowLeft: arrowLeftIcon,
  boxes: boxesIcon,
  chevronDown: chevronDownIcon,
  chevronLeft: chevronLeftIcon,
  chevronRight: chevronRightIcon,
  chevronUp: chevronUpIcon,
  chevronsLeft: chevronsLeftIcon,
  chevronsRight: chevronsRightIcon,
  cpu: cpuIcon,
  home: homeIcon,
  image: imageIcon,
  info: infoIcon,
  listChecks: listChecksIcon,
  moreVertical: moreVerticalIcon,
  play: playIcon,
  settings: settingsIcon,
  uploadCloud: uploadCloudIcon,
  workflow: workflowIcon,
  x: xIcon
}

const icon = computed(() => icons[props.name as keyof typeof icons] ?? homeIcon)
</script>

<template>
  <Icon :icon="icon" :width="size ?? 18" :height="size ?? 18" aria-hidden="true" />
</template>
