import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useSmartChartAdaptor } from '@/hooks/useSmartChartAdaptor';
import { ChartTitle, SmartChart } from '@deriv/deriv-charts';
import { useDevice } from '@deriv-com/ui';
import ToolbarWidgets from './toolbar-widgets';
import '@deriv/deriv-charts/dist/smartcharts.css';

const Chart = observer(({ show_digits_stats }: { show_digits_stats: boolean }) => {
    const barriers: [] = [];
    const { common, ui } = useStore();
    const { chart_store, run_panel, dashboard } = useStore();
    const [isSafari, setIsSafari] = useState(false);

    const {
        chart_type,
        granularity,
        onSymbolChange,
        setChartStatus,
        symbol,
        updateChartType,
        updateGranularity,
        updateSymbol,
    } = chart_store;
    const { isDesktop, isMobile } = useDevice();
    const { is_drawer_open } = run_panel;
    const { is_chart_modal_visible } = dashboard;
    const settings = {
        assetInformation: false,
        countdown: true,
        isHighestLowestMarkerEnabled: false,
        language: common.current_language.toLowerCase(),
        position: ui.is_chart_layout_default ? 'bottom' : 'left',
        theme: ui.is_dark_mode_on ? 'dark' : 'light',
    };

    // Real champion API: getQuotes / subscribeQuotes / unsubscribeQuotes / chartData.
    // requestAPI / requestSubscribe (the old shape) do not exist on this build of
    // @deriv-com/smartcharts-champion and were silently ignored, which is why the
    // canvas never painted.
    const { chartData, getQuotes, subscribeQuotes, unsubscribeQuotes, adapterInitialized } = useSmartChartAdaptor();

    // updateSymbol() reads api_base.active_symbols[0] synchronously. That data
    // arrives async over the WebSocket, so if this effect fires before it's
    // populated, updateSymbol() is a no-op (undefined -> undefined never
    // changes chart_store.symbol), and since the effect's deps never change
    // it never retries. Poll until active_symbols is actually there.
    useEffect(() => {
        if (symbol) return;
        updateSymbol();
        if (chart_store.symbol) return;

        const pollId = setInterval(() => {
            updateSymbol();
            if (chart_store.symbol) clearInterval(pollId);
        }, 100);

        return () => clearInterval(pollId);
    }, [symbol, updateSymbol, chart_store]);

    useState(() => {
        const isSafariBrowser = () => {
            const ua = navigator.userAgent.toLowerCase();
            return ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1 && ua.indexOf('android') === -1;
        };
        setIsSafari(isSafariBrowser());
    });

    if (!symbol || !adapterInitialized) return null;

    return (
        <div
            className={classNames('dashboard__chart-wrapper', {
                'dashboard__chart-wrapper--expanded': is_drawer_open && isDesktop,
                'dashboard__chart-wrapper--modal': is_chart_modal_visible && isDesktop,
                'dashboard__chart-wrapper--safari': isSafari,
            })}
            dir='ltr'
        >
            <SmartChart
                id='dbot'
                barriers={barriers}
                showLastDigitStats={show_digits_stats}
                chartControlsWidgets={null}
                enabledChartFooter={false}
                chartStatusListener={(v: boolean) => setChartStatus(!v)}
                toolbarWidget={() => (
                    <ToolbarWidgets
                        updateChartType={updateChartType}
                        updateGranularity={updateGranularity}
                        position={!isDesktop ? 'bottom' : 'top'}
                        isDesktop={isDesktop}
                    />
                )}
                chartType={chart_type}
                isMobile={isMobile}
                enabledNavigationWidget={isDesktop}
                granularity={granularity}
                chartData={chartData}
                getQuotes={getQuotes}
                subscribeQuotes={subscribeQuotes}
                unsubscribeQuotes={unsubscribeQuotes}
                settings={settings}
                symbol={symbol}
                topWidgets={() => <ChartTitle onChange={onSymbolChange} />}
                isConnectionOpened={adapterInitialized}
                isLive
                leftMargin={80}
            />
        </div>
    );
});

export default Chart;
