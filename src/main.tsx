import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// ── TradeX PRO shell auth bridge ───────────────────────────────────────────
// The Charts page on tradexpro.co.ke embeds this app as an iframe. The shell
// sends a TRADEXPRO_AUTH postMessage (same protocol as dtrader-template) with
// the logged-in user's token and loginid.
//
// getSocketURL() in config.ts checks two auth formats, in this order:
//  1. PKCE: sessionStorage['auth_info'].access_token -> fetches an
//     OTP-signed WebSocket URL (DerivWSAccountsService). This is the path
//     that actually works with tradexpro's OAuth token.
//  2. Legacy: localStorage['accountsList'] + ['active_loginid'] -> connects
//     to the classic wss://ws.derivws.com/websockets/v3 endpoint and calls
//     api.authorize(token) directly. Confirmed via live console: this
//     rejects tradexpro's OAuth token outright ("HTTP Authentication
//     failed; no valid credentials available"), repeatedly, before
//     eventually falling back to the public/unauthenticated connection.
//
// Originally wrote the legacy format only, which is exactly why this kept
// failing. Writing the PKCE format instead routes through the path that
// actually works.
const ALLOWED_PARENT_ORIGIN = 'https://tradexpro.co.ke';

function handleShellAuth(event: MessageEvent) {
    if (event.origin !== ALLOWED_PARENT_ORIGIN) return;
    const data = event.data;
    if (!data || data.type !== 'TRADEXPRO_AUTH') return;

    const { token, loginid } = data as {
        type: string;
        token: string;
        loginid: string;
        accounts?: Array<{ account: string; token: string; currency: string }>;
    };

    if (!token || !loginid) return;

    try {
        sessionStorage.setItem(
            'auth_info',
            JSON.stringify({
                access_token: token,
                token_type: 'Bearer',
                expires_in: 3600,
                expires_at: Date.now() + 3600 * 1000,
            })
        );
        // getAuthenticatedWebSocketURL() honours this for account selection
        // (falls back to accounts[0] if absent), and fetches the accounts
        // list itself via the access_token if not already cached -- no need
        // to duplicate that list here ourselves.
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
