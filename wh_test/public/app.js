/* =====================================================
   FLUXCHAT — Frontend App Logic
   Connects to the local proxy server which shells
   all Fluxbase credentials safely on the backend.
   ===================================================== */

// ---------- Constants ----------
const COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#f87171', '#fbbf24', '#f472b6', '#38bdf8', '#fb923c'];
const MAX_CHARS = 500;

// ---------- State ----------
let config = {};
let myColor = COLORS[0];
let myUsername = 'Guest';
let whCount = 0;
let sse = null;
let lastSender = null;

// ---------- DOM Refs ----------
const $ = (id) => document.getElementById(id);
const msgList    = $('js-messages');
const inputEl    = $('js-input');
const sendBtn    = $('js-send-btn');
const charCount  = $('js-char-count');
const usernameEl = $('js-username');
const avatarEl   = $('js-avatar');
const selfLabel  = $('js-self-label');
const fluxStatus = $('js-flux-status');
const rtStatus   = $('js-rt-status');
const whStatus   = $('js-wh-status');
const whLog      = $('js-wh-log');
const swatchCont = $('js-swatches');
const channelDesc= $('js-channel-desc');
const onlineList = $('js-online-list');

// =============================================================
// INIT
// =============================================================
async function init() {
    buildSwatches();
    syncProfile();
    bindEvents();

    try {
        const res = await fetch('/api/config');
        config = await res.json();
        channelDesc.textContent = `Fluxbase → ${config.table} · Project ${config.projectId?.slice(0, 8)}…`;

        setStatus(fluxStatus, 'Connected', 'ok');
        await loadHistory();
        connectSSE();
    } catch (e) {
        setStatus(fluxStatus, 'Error', 'err');
        toast('Could not reach the proxy server. Is it running?', 'error');
    }
}

// =============================================================
// COLOR SWATCHES
// =============================================================
function buildSwatches() {
    COLORS.forEach((hex, i) => {
        const el = document.createElement('div');
        el.className = 'swatch' + (i === 0 ? ' active' : '');
        el.style.background = hex;
        el.title = hex;
        el.addEventListener('click', () => {
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            el.classList.add('active');
            myColor = hex;
            avatarEl.style.background = hex;
        });
        swatchCont.appendChild(el);
    });
    avatarEl.style.background = myColor;
}

// =============================================================
// PROFILE SYNC
// =============================================================
function syncProfile() {
    usernameEl.addEventListener('input', () => {
        myUsername = usernameEl.value.trim() || 'Guest';
        avatarEl.textContent = myUsername.charAt(0).toUpperCase();
        selfLabel.textContent = myUsername + ' (you)';
    });
    myUsername = usernameEl.value.trim() || 'Guest';
    avatarEl.textContent = myUsername.charAt(0).toUpperCase();
}

// =============================================================
// LOAD HISTORY
// =============================================================
async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Remove welcome banner if we have messages
        if (data.messages?.length) {
            const banner = msgList.querySelector('.welcome-banner');
            if (banner) banner.remove();
        }

        data.messages?.forEach(row => renderMessage(row, false));
        scrollToBottom();
    } catch (e) {
        console.warn('History load failed:', e.message);
        channelDesc.textContent = `⚠️ Cannot load history. Check if table "${config.table}" exists.`;
    }
}

// =============================================================
// RENDER MESSAGE
// =============================================================
function renderMessage(row, isNew = false) {
    const username = row.username || 'Unknown';
    const content  = row.content  || '';
    const color    = row.color    || '#a78bfa';
    const ts       = row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const isFirst  = lastSender !== username;
    lastSender = username;

    const group = document.createElement('div');
    group.className = 'msg-item' + (isFirst ? ' msg-group first-in-group' : '');

    const avatarHtml = isFirst
        ? `<div class="msg-avatar" style="background:${color}">${username.charAt(0).toUpperCase()}</div>`
        : `<div class="msg-avatar hidden"></div>`;

    const metaHtml = isFirst
        ? `<div class="msg-meta">
               <span class="msg-username" style="color:${color}">${escHtml(username)}</span>
               <span class="msg-timestamp">${ts}</span>
               ${isNew ? '<span class="msg-new-badge">NEW</span>' : ''}
           </div>`
        : '';

    group.innerHTML = `
        ${avatarHtml}
        <div class="msg-body">
            ${metaHtml}
            <div class="msg-content">${escHtml(content)}</div>
        </div>
    `;

    msgList.appendChild(group);
    if (isNew) scrollToBottom();
}

// =============================================================
// SEND MESSAGE
// =============================================================
async function sendMessage() {
    const content = inputEl.value.trim();
    if (!content || content.length > MAX_CHARS) return;

    sendBtn.disabled = true;
    inputEl.value = '';
    updateCharCount();

    try {
        const res = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, username: myUsername, color: myColor }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        // SSE will deliver the message back — no need to render locally
    } catch (e) {
        toast(`Send failed: ${e.message}`, 'error');
        inputEl.value = content; // restore
    } finally {
        sendBtn.disabled = false;
        inputEl.focus();
    }
}

// =============================================================
// REAL-TIME SSE — Direct connection to Render (no proxy hop)
// =============================================================
let sseAbort = null;

function connectSSE() {
    setStatus(rtStatus, 'Connecting…', '');

    if (sseAbort) sseAbort.abort();
    sseAbort = new AbortController();

    const url = `${config.fluxUrl}/api/realtime/subscribe?projectId=${config.projectId}`;

    (async () => {
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${config.apiKey}` },
                signal: sseAbort.signal,
            });

            if (!response.ok) {
                throw new Error(`SSE ${response.status}: ${response.statusText}`);
            }

            setStatus(rtStatus, 'Live ⚡', 'ok');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep incomplete last line

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const raw = line.slice(6).trim();
                        if (!raw) continue;
                        try {
                            const payload = JSON.parse(raw);
                            if (payload.type === 'connected') continue;

                            const tbl = payload.table_id || payload.table_name;
                            if (tbl === config.table) {
                                const newRow = payload.data?.new;
                                const ev = payload.event_type || '';
                                if (newRow && (ev === 'row.inserted' || ev === 'INSERT')) {
                                    const banner = msgList.querySelector('.welcome-banner');
                                    if (banner) banner.remove();
                                    renderMessage(newRow, true);
                                    updateOnlineList(newRow.username);
                                }
                            }
                        } catch (_) {}
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') return; // intentional disconnect
            console.warn('SSE error, reconnecting in 4s:', err.message);
            setStatus(rtStatus, 'Reconnecting…', 'warn');
            setTimeout(connectSSE, 4000);
        }
    })();
}

// =============================================================
// ONLINE LIST (simple session-only tracking)
// =============================================================
const seenUsers = new Set();
function updateOnlineList(username) {
    if (!username || seenUsers.has(username)) return;
    seenUsers.add(username);
    const item = document.createElement('div');
    item.className = 'online-item';
    item.innerHTML = `<div class="online-dot"></div><span>${escHtml(username)}</span>`;
    onlineList.appendChild(item);
}

// =============================================================
// WEBHOOK PANEL (SSE event from /webhook route)
// =============================================================
function recordWebhook(entry) {
    whCount++;
    whStatus.textContent = `${whCount} received`;
    whStatus.className = 'badge badge-ok';

    const el = document.createElement('div');
    el.className = 'wh-entry';
    const verifiedClass = entry.verified ? 'wh-verified-yes' : 'wh-verified-no';
    const verifiedText  = entry.verified ? '✅ Verified' : entry.hasSecret ? '❌ Mismatch' : '⚠️ No secret';
    el.innerHTML = `
        <div class="wh-event">${escHtml(entry.event || '?')}</div>
        <div class="wh-detail">${escHtml(entry.table || '?')}</div>
        <div class="wh-time">${new Date().toLocaleTimeString()} <span class="${verifiedClass}">${verifiedText}</span></div>
    `;
    // Remove empty message
    const empty = whLog.querySelector('.wh-empty');
    if (empty) empty.remove();
    whLog.prepend(el);
    toast(`🔔 Webhook: ${entry.event}`, 'info');
}

// Poll for new webhook events (server-sent via a simple endpoint)
async function pollWebhooks() {
    // We piggyback on the server's console — no extra SSE needed.
    // For a richer demo, you could add a GET /api/webhook-events SSE endpoint.
}

// =============================================================
// INIT TABLE (create messages table if not exists)
// =============================================================
$('js-init-btn').addEventListener('click', async () => {
    try {
        const res = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '👋 FluxChat initialized!', username: 'System', color: '#22c55e' }),
        });
        const data = await res.json();
        if (data.error?.toLowerCase().includes('does not exist') || data.error?.toLowerCase().includes('no such table')) {
            toast('Table does not exist yet. Check your Fluxbase project.', 'error');
        } else {
            toast('Table OK — sent a ping!', 'success');
        }
    } catch (e) {
        toast(e.message, 'error');
    }
});

$('js-clear-btn').addEventListener('click', () => {
    msgList.innerHTML = '<div class="welcome-banner"><div class="welcome-icon">⚡</div><h2>View Cleared</h2><p>Messages still exist in Fluxbase.</p></div>';
    lastSender = null;
    seenUsers.clear();
    const selfItem = document.createElement('div');
    selfItem.className = 'online-item self-item';
    selfItem.innerHTML = `<div class="online-dot"></div><span id="js-self-label">${escHtml(myUsername)} (you)</span>`;
    onlineList.innerHTML = '';
    onlineList.appendChild(selfItem);
});

// =============================================================
// EVENTS
// =============================================================
function bindEvents() {
    sendBtn.addEventListener('click', sendMessage);

    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    inputEl.addEventListener('input', () => {
        updateCharCount();
        autoResize();
    });
}

function updateCharCount() {
    const len = inputEl.value.length;
    charCount.textContent = `${len} / ${MAX_CHARS}`;
    charCount.style.color = len > MAX_CHARS * 0.9 ? '#ef4444' : '';
    sendBtn.disabled = len === 0 || len > MAX_CHARS;
}

function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
}

// =============================================================
// HELPERS
// =============================================================
function scrollToBottom() {
    const wrapper = document.querySelector('.messages-wrapper');
    wrapper.scrollTop = wrapper.scrollHeight;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setStatus(el, text, cls) {
    el.textContent = text;
    el.className = 'badge' + (cls ? ` badge-${cls}` : '');
}

function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    $('js-toast-container').appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

// =============================================================
// BOOT
// =============================================================
document.addEventListener('DOMContentLoaded', init);
