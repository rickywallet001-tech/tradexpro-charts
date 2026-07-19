/**
 * Services layer wrapper for SmartCharts Champion Adapter
 * Wraps the existing ApiHelpers to match the TServices interface
 */

import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { tradingTimesService } from '@/components/shared/services/trading-times-service';
import type { TServices } from './types';

// Logger utility for services layer
const logger = {
    log: () => {}, // Disabled in production
    warn: console.warn.bind(console, '[SmartCharts Services]'),
    error: console.error.bind(console, '[SmartCharts Services]'),
};

/**
 * NOTE: This used to route through ApiHelpers.instance (a bot-skeleton
 * singleton normally populated by the Blockly/bot-workspace bootstrap).
 * That singleton was never actually initialized correctly in this
 * standalone extraction - ApiHelpers.setInstance() didn't even exist on
 * the stub class here, which threw a silent, un-logged TypeError and
 * permanently killed the adapter's one-shot init retry loop. This is the
 * root cause of the blank chart canvas.
 *
 * Fix: bypass ApiHelpers entirely. api_base.active_symbols is already
 * populated by app boot (see App.tsx's bootApiBase), and
 * tradingTimesService already fetches trading_times directly over
 * api_base.api. Both are confirmed working independently of ApiHelpers.
 */

/**
 * Flatten the raw trading_times markets/submarkets/symbols tree into a
 * per-symbol map of { open, close, settlement }, matching the shape
 * toTradingTimesMap() in index.ts already expects.
 */
function flattenTradingTimes(raw: any): Record<string, { open: string[]; close: string[]; settlement?: string }> {
    const flattened: Record<string, { open: string[]; close: string[]; settlement?: string }> = {};

    if (!raw?.markets || !Array.isArray(raw.markets)) {
        return flattened;
    }

    raw.markets.forEach((market: any) => {
        market.submarkets?.forEach((submarket: any) => {
            submarket.symbols?.forEach((symbolData: any) => {
                const symbolCode = symbolData.symbol;
                if (!symbolCode) return;

                const times = symbolData.times;
                if (!times) return;

                flattened[symbolCode] = {
                    open: Array.isArray(times.open) ? times.open : [times.open].filter(Boolean),
                    close: Array.isArray(times.close) ? times.close : [times.close].filter(Boolean),
                    settlement: times.settlement,
                };
            });
        });
    });

    return flattened;
}

/**
 * Create services wrapper — pulls directly from api_base / tradingTimesService
 * instead of the broken ApiHelpers singleton.
 * @returns TServices implementation
 */
export function createServices(): TServices {
    return {
        /**
         * Get active symbols data
         * @returns Promise resolving to active symbols array
         */
        async getActiveSymbols(): Promise<any> {
            try {
                if (Array.isArray(api_base.active_symbols) && api_base.active_symbols.length > 0) {
                    return api_base.active_symbols;
                }

                // Not populated yet (boot race) - wait for the in-flight promise if there is one.
                if (api_base.active_symbols_promise) {
                    await api_base.active_symbols_promise.catch(() => {});
                }

                if (Array.isArray(api_base.active_symbols) && api_base.active_symbols.length > 0) {
                    return api_base.active_symbols;
                }

                logger.warn('No active symbols available from api_base');
                return [];
            } catch (error) {
                logger.error('Error getting active symbols:', error);
                return [];
            }
        },

        /**
         * Get trading times data
         * @returns Promise resolving to a per-symbol { open, close, settlement } map
         */
        async getTradingTimes(): Promise<any> {
            try {
                const raw = await tradingTimesService.getTradingTimes();
                const flattened = flattenTradingTimes(raw);

                if (Object.keys(flattened).length === 0) {
                    // TEMP DEBUG - remove once shape is confirmed
                    logger.warn(
                        'Trading times flattened to an empty map. Raw markets[0]:',
                        JSON.stringify(raw?.markets?.[0], null, 2)?.slice(0, 3000)
                    );
                    logger.warn('Raw top-level keys:', raw ? Object.keys(raw) : 'raw is falsy');
                }

                return flattened;
            } catch (error) {
                logger.error('Error getting trading times:', error);
                return {};
            }
        },
    };
}
