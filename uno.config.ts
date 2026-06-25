// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [
    presetUno()
  ],
  shortcuts: {
    'fm-page': 'grid gap-5',
    'fm-page-header': 'flex items-center justify-between gap-4 px-0.5 pt-0.5 pb-1.5 lt-md:(items-stretch flex-col)',
    'fm-page-title': 'm-0 text-[30px] font-800 leading-[1.18] tracking-normal text-[var(--fm-text)]',
    'fm-page-subtitle': 'max-w-[760px] mt-2 mb-0 text-[var(--fm-muted)] leading-[1.7]',
    'fm-grid': 'grid gap-4',
    'fm-card-grid': 'grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 lt-md:grid-cols-1',
    'fm-card': 'p-4.5',
    'fm-card-header': 'flex items-start justify-between gap-3',
    'fm-card-body': 'grid gap-3 mt-3.5',
    'fm-card-actions': 'flex items-center justify-end flex-wrap gap-1.5 min-w-0',
    'fm-meta-row': 'flex items-center justify-between gap-3 text-[13px] text-[var(--fm-muted)]',
    'fm-label': 'text-[var(--fm-muted)]',
    'fm-value': 'text-[var(--fm-text)]',
    'fm-node-list': 'flex flex-wrap gap-1.5',
    'fm-tags': 'flex flex-wrap gap-1.5',
    'fm-section-head': 'flex items-center justify-between gap-3',
    'fm-actions': 'flex items-center justify-end flex-wrap gap-2 min-w-0',
    'fm-muted': 'text-[var(--fm-muted)]',
    'fm-text': 'text-[var(--fm-text)]',
    'fm-mono': 'font-mono text-3',
    'fm-stack': 'grid gap-3.5',
    'fm-stack-sm': 'grid gap-2',
    'fm-scroll-card': 'max-w-full overflow-auto border border-[var(--fm-border)] p-0'
  }
})
