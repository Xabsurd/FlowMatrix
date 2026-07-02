<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<template>
  <svg
    class="fm-logo"
    viewBox="0 0 48 48"
    role="img"
    aria-label="FlowMatrix logo"
  >
    <path
      class="fm-logo-frame"
      d="M10 8H38C39.1 8 40 8.9 40 10V38C40 39.1 39.1 40 38 40H10C8.9 40 8 39.1 8 38V10C8 8.9 8.9 8 10 8Z"
    />
    <path
      class="fm-logo-flow"
      d="M16 32C20 32 19 16 24 16C29 16 28 32 34 32"
    />
    <path
      class="fm-logo-grid"
      d="M16 14H20V18H16V14ZM28 14H32V18H28V14ZM16 30H20V34H16V30ZM28 30H32V34H28V30ZM22 22H26V26H22V22Z"
    />
  </svg>
</template>

<style scoped>
.fm-logo {
  display: block;
  width: 100%;
  height: 100%;
}

.fm-logo-frame {
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
}

.fm-logo-grid {
  fill: currentColor;
}

.fm-logo-flow {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 4;
}
</style>
