import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PluginMarketplaceSettingsTab } from './PluginMarketplaceSettingsTab.js'
import { en, zh, type MarketplaceLocaleKey } from './locales.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-plugin-installer': MarketplaceLocaleKey
  }
}

export const inject = ['slots', 'locale']

const NS = 'dsh-plugin-installer'

/** Add a narrow marketplace tab to the official Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-installer: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'marketplace',
    order: 20,
    label: () => t('tab'),
    locale: NS,
  }, PluginMarketplaceSettingsTab))
}
