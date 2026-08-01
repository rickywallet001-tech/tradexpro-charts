import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// ── TradeX PRO shell auth bridge ───────────────────────────────────────────
// The Charts page on tradexpro.co.ke embeds this app as an iframe. The shell
// sends a TRADEXPRO_AUTH postMessage (same protocol as dtrader-template) with
// the logged-in user's token, loginid, and accounts list. We map those to the
// storage keys that getSocketURL() in config.ts actually reads, so the chart
// boots authenticated instead of falling through to the public unauthenticated
// WebSocket path.
const ALLOWED_PARENT_ORIGIN = 'https://tradexpro.co.ke';

function handleShellAuth(event: MessageEvent) {
    if (event.origin !== ALLOWED_PARENT_ORIGIN) return;
    const data = event.data;
    if (!data || data.type !== 'TRADEXPRO_AUTH') return;

    const { token, loginid, accounts } = data as {
        type: string;
        token: string;
        loginid: string;
        accounts: Array<{ account: string; token: string; currency: string }>;
    };

    if (!token || !loginid) return;

    // Map TradeX PRO's auth keys to what getSocketURL() looks for:
    // - accountsList: keyed by loginid, each entry has a token field
    // - active_loginid: the currently selected account
    const accountsList: Record<string, { token: string; currency: string }> = {};
    (accounts ?? []).forEach(acct => {
        accountsList[acct.account] = { token: acct.token, currency: acct.currency ?? '' };
    });
    // Always include the active account in case accounts array is sparse
    if (!accountsList[loginid]) {
        accountsList[loginid] = { token, currency: '' };
    }

    try {
        localStorage.setItem('accountsList', JSON.stringify(accountsList));
        localStorage.setItem('active_loginid', loginid);
    } catch {
        // Ignore storage errors (private-browsing, quota exceeded, etc.)
    }

    // Force api_base to tear down its current unauthenticated connection and
    // open a fresh one now that we have credentials. Lazy-import so this module
    // doesn't create a circular dependency with App.tsx which also imports api_base.
    import('@/external/bot-skeleton').then(({ api_base }) => {
        // bootPromise in App.tsx resolved before we had auth, so the connection
        // is already in an unauthenticated state. force_create_connection=true
        // bypasses the is_initializing guard and replaces the socket.
        api_base.init(true).catch(() => {});
    });
}

window.addEventListener('message', handleShellAuth);
// ─────────────────────────────────────────────────────────────────────────────

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(
        <StrictMode>
            <App />
        </StrictMode>
    );
}

// The initial-loader div in index.html renders before React mounts (see the
// inline script there) but nothing ever removes it afterward — that was
// missed when the branded shell was ported over. Fade it out and remove it
// once React has taken over.
const loader = document.getElementById('initial-loader');
if (loader) {
    loader.classList.add('fade-out');
    setTimeout(() => loader.remove(), 300);
}
