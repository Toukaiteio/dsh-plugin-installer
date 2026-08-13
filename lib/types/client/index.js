import { PluginMarketplaceSettingsTab } from './PluginMarketplaceSettingsTab.js';
import { en, zh } from './locales.js';
export const inject = ['slots', 'locale'];
const NS = 'dsh-plugin-installer';
/** Add a narrow marketplace tab to the official Plugins settings section. */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-installer: dictionaries');
    const t = ctx.locale.bind(NS);
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'marketplace',
        order: 20,
        label: () => t('tab'),
        locale: NS,
    }, PluginMarketplaceSettingsTab));
}
