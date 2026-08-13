import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type MarketplaceLocaleKey } from './locales.js';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'dsh-plugin-installer': MarketplaceLocaleKey;
    }
}
export declare const inject: string[];
/** Add a narrow marketplace tab to the official Plugins settings section. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map