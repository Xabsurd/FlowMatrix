<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { appLocales } from '~/config/locales'
import { appThemes } from '~/config/themes'

const { t, locale, setLocale } = useI18n()
const { currentThemeId, applyTheme } = useAppTheme()
const { componentSize, componentSizes, setComponentSize } = useUiPreferences()

const settingsEntries = [
  { to: '/backends', titleKey: 'nav.backends', descriptionKey: 'settings.backendsDescription' },
  { to: '/workflows', titleKey: 'nav.workflows', descriptionKey: 'settings.workflowsDescription' },
  { to: '/presets', titleKey: 'nav.presets', descriptionKey: 'settings.presetsDescription' },
  { to: '/batch', titleKey: 'nav.batch', descriptionKey: 'settings.batchDescription' }
]

const providerForm = reactive({
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-1'
})

const saving = ref(false)
const testing = ref(false)
const loadingModels = ref(false)
const providerStatus = ref('')
const hasSavedApiKey = ref(false)
const providerModels = ref<string[]>([])
let providerModelTimer: ReturnType<typeof setTimeout> | undefined

const enabledLocales = computed(() => appLocales.filter((item) => item.enabled))
const enabledThemes = computed(() => appThemes.filter((item) => item.enabled))
const componentSizeOptions = computed(() => componentSizes.map(size => ({
  label: t({
    large: 'settings.componentSizeLarge',
    default: 'settings.componentSizeDefault',
    small: 'settings.componentSizeSmall'
  }[size]),
  value: size
})))

async function changeLocale(value: string) {
  await setLocale(value as typeof locale.value)
}

function changeTheme(value: string | number) {
  applyTheme(String(value))
}

async function loadProviderSettings() {
  const settings = await $fetch<{
    baseUrl: string
    defaultModel: string
    hasApiKey: boolean
  }>('/api/providers/openai/settings')

  providerForm.baseUrl = settings.baseUrl
  providerForm.model = settings.defaultModel
  providerForm.apiKey = ''
  hasSavedApiKey.value = settings.hasApiKey
  if (settings.hasApiKey) void fetchProviderModels(true)
}

async function fetchProviderModels(silent = false) {
  if (!providerForm.baseUrl.trim()) return
  if (!providerForm.apiKey.trim() && !hasSavedApiKey.value) {
    if (!silent) providerStatus.value = t('settings.apiKeyPlaceholder')
    return
  }

  loadingModels.value = true
  if (!silent) providerStatus.value = ''

  try {
    const result = await $fetch<{ models: string[] }>('/api/providers/openai/models', {
      method: 'POST',
      body: {
        baseUrl: providerForm.baseUrl,
        model: providerForm.model,
        apiKey: providerForm.apiKey
      }
    })
    providerModels.value = result.models
    if (!providerForm.model || !providerModels.value.includes(providerForm.model)) {
      providerForm.model = providerModels.value[0] || ''
    }
    providerStatus.value = providerModels.value.length
      ? t('settings.providerModelsLoaded', { count: providerModels.value.length })
      : t('settings.providerModelsEmpty')
  } catch (error) {
    if (!silent) providerStatus.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingModels.value = false
  }
}

async function saveProviderSettings() {
  saving.value = true
  providerStatus.value = ''

  try {
    if (!providerForm.model) {
      await fetchProviderModels(false)
    }

    const settings = await $fetch<{
      hasApiKey: boolean
    }>('/api/providers/openai/settings', {
      method: 'PUT',
      body: {
        baseUrl: providerForm.baseUrl,
        defaultModel: providerForm.model,
        apiKey: providerForm.apiKey
      }
    })

    hasSavedApiKey.value = settings.hasApiKey
    providerForm.apiKey = ''
    providerStatus.value = t('settings.providerSaved')
  } catch (error) {
    providerStatus.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function testProvider() {
  testing.value = true
  providerStatus.value = ''

  try {
    const result = await $fetch<{ ok: boolean, message: string }>('/api/providers/openai/test', {
      method: 'POST'
    })
    providerStatus.value = result.message
  } catch (error) {
    providerStatus.value = error instanceof Error ? error.message : String(error)
  } finally {
    testing.value = false
  }
}

watch(() => [providerForm.baseUrl, providerForm.apiKey], () => {
  if (providerModelTimer) clearTimeout(providerModelTimer)
  providerModelTimer = setTimeout(() => {
    void fetchProviderModels(true)
  }, 700)
})

onMounted(() => {
  void loadProviderSettings()
})

</script>

<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">{{ t('settings.title') }}</h1>
        <p class="fm-page-subtitle">{{ t('settings.subtitle') }}</p>
      </div>
    </div>

    <div class="settings-entry-grid">
      <NuxtLink
        v-for="entry in settingsEntries"
        :key="entry.to"
        class="settings-entry fm-panel"
        :to="entry.to"
      >
        <span class="settings-entry-title">{{ t(entry.titleKey) }}</span>
        <span class="settings-entry-description">{{ t(entry.descriptionKey) }}</span>
      </NuxtLink>
    </div>

    <div class="fm-grid two">
      <ElCard shadow="never">
        <template #header>{{ t('settings.language') }}</template>
        <ElSelect :model-value="locale" @change="changeLocale">
          <ElOption
            v-for="item in enabledLocales"
            :key="item.code"
            :label="item.nativeName"
            :value="item.code"
          />
        </ElSelect>
      </ElCard>

      <ElCard shadow="never">
        <template #header>{{ t('settings.theme') }}</template>
        <ElSegmented
          :model-value="currentThemeId"
          :options="enabledThemes.map((item) => ({
            label: t(item.nameKey),
            value: item.id
          }))"
          @change="changeTheme"
        />
      </ElCard>

      <ElCard shadow="never">
        <template #header>{{ t('settings.componentSize') }}</template>
        <ElSegmented
          :model-value="componentSize"
          :options="componentSizeOptions"
          @change="setComponentSize"
        />
      </ElCard>
    </div>

    <ElCard shadow="never">
      <template #header>{{ t('providers.title') }}</template>
      <ElForm label-position="top" class="provider-form">
      <div class="provider-guide">
        <div>
          <strong>{{ t('settings.providerGuideTitle') }}</strong>
          <span>{{ t('settings.providerGuideText') }}</span>
        </div>
        <ElButton @click="navigateTo('/backends')">{{ t('settings.addOnlineBackend') }}</ElButton>
      </div>

        <div class="provider-grid">
          <ElFormItem :label="t('providers.baseUrl')">
            <ElInput v-model="providerForm.baseUrl" placeholder="https://api.openai.com/v1" />
          </ElFormItem>
          <ElFormItem :label="t('providers.model')">
            <div class="model-picker">
              <ElSelect
                v-model="providerForm.model"
                filterable
                :loading="loadingModels"
                :placeholder="t('settings.providerModelPlaceholder')"
                style="width: 100%"
              >
                <ElOption
                  v-for="model in providerModels"
                  :key="model"
                  :label="model"
                  :value="model"
                />
              </ElSelect>
              <ElButton :loading="loadingModels" @click="fetchProviderModels(false)">
                {{ t('settings.fetchProviderModels') }}
              </ElButton>
            </div>
          </ElFormItem>
        </div>

        <ElFormItem :label="t('providers.apiKey')">
          <ElInput
            v-model="providerForm.apiKey"
            type="password"
            show-password
            :placeholder="hasSavedApiKey ? t('settings.savedApiKeyPlaceholder') : t('settings.apiKeyPlaceholder')"
          />
        </ElFormItem>

        <div class="actions">
          <ElButton type="primary" :loading="saving" @click="saveProviderSettings">
            {{ t('common.save') }}
          </ElButton>
          <ElButton :loading="testing" @click="testProvider">{{ t('common.test') }}</ElButton>
        </div>

        <ElAlert
          v-if="providerStatus"
          class="status-alert"
          :title="providerStatus"
          type="info"
          show-icon
          :closable="false"
        />
      </ElForm>
    </ElCard>
  </section>
</template>

<style scoped>
.settings-entry-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.settings-entry {
  display: grid;
  gap: 6px;
  min-height: 92px;
  padding: 16px;
  color: var(--fm-text);
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.settings-entry:hover {
  border-color: color-mix(in srgb, var(--fm-primary) 30%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-primary) 9%, var(--fm-panel-strong));
}

.settings-entry-title {
  font-size: 15px;
  font-weight: 760;
}

.settings-entry-description {
  color: var(--fm-muted);
  font-size: 13px;
  line-height: 1.45;
}

.provider-guide {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--fm-primary) 26%, var(--fm-border));
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-primary) 8%, var(--fm-panel-muted));
}

.provider-guide div {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.provider-guide strong {
  color: var(--fm-text);
  font-size: 14px;
}

.provider-guide span {
  color: var(--fm-muted);
  font-size: 13px;
  line-height: 1.55;
}
.provider-form {
  max-width: 920px;
}

.provider-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.model-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.status-alert {
  margin-top: 16px;
}

@media (max-width: 760px) {
  .settings-entry-grid {
    grid-template-columns: 1fr;
  }

  .provider-guide,
  .provider-grid {
    grid-template-columns: 1fr;
  }
}
</style>
