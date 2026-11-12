/* spacepussy.ai/explorer — a static page over a node's read API (cybernode rs/src/node/chain_routes.rs)
   and the files of its indexer (site/explorer/indexer: data/history.json, stakes.json, summary.json, and once per settled epoch
   axons.json, neurons.json, particles.json, phi/<xx>.json; network.json for the network tab, drawn by network.js).
   the node answers at /explorer/api/<path> on the same origin; ?api=<base> points the page at another node.
   live: /tip once a second while the tab is visible, /status every few seconds and on every new block.
   no build, no framework: one file, hash routes, big integers kept as strings or BigInt, never floats for amounts.
   the work: on a node with settlement mining (cybernode feat/ticket-pow, tru specs/rewards.md §7) the header is 200 bytes and its
   last 32 are `sample`, the block's ticket; the page detects it from the genesis header's length (LIVE.work = 'tickets') and reads
   tickets/s where it read H/s. until the alpha redeploys, its 168-byte headers keep every page as it was (LIVE.work = 'hashes'). */
'use strict';

const QS = new URLSearchParams(location.search);
const API = (QS.get('api') || '/explorer/api').replace(/\/+$/, '');
const DATA = (QS.get('data') || '/explorer/data').replace(/\/+$/, '');
const CIDS = (QS.get('cids') || '/explorer/cids').replace(/\/+$/, '');
// a signal (cybergraph/specs/signal.md) is what a neuron commits in one step; the node's read API still names it `tx`
// (/explorer/api/tx/<id>). when the node renames it (plan row P12) this is the one line to change.
const SIGNAL_API = '/tx';
const GATEWAY = 'https://gateway.ipfs.cybernode.ai/ipfs/';
const TARGET = 30;          // s per block, the ASERT target
const WINDOW = 100;         // blocks for the median block time and the hashrate estimate
const PAGE = 25;            // rows per page of blocks
const LATEST = 12;          // rows in the overview's latest blocks
const TICK = 1000;          // ms between /tip reads
const STATUS_EVERY = 4;     // ticks between /status reads when no block arrives
const DATA_EVERY = 30000;   // ms between reads of the indexer's files
const HEX64 = /^[0-9a-f]{64}$/;
const SCALE = 1n << 60n;    // φ* fixed point (economy_api.rs: scale_bits 60)
const TICKET_HEX = 400;     // a 200-byte header: `sample` is its last 32 bytes (hex 336..400)
const RECORD_HEX = 436;     // a 218-byte epoch record: players, samples, by_mean, value after the 198 old bytes
const REWARDS = 'https://github.com/cyberia-to/tru/blob/master/specs/rewards.md';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Math.floor(Date.now() / 1000);

/* ------------------------------------------------------------------ the wire */
class Down extends Error {}
let downSince = 0;

// JSON with integers past 2^53 kept as strings (supply, syntropy, φ* do not fit a double)
const parseJSON = (t) => JSON.parse(t.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g, '$1"$2"'));
// cybermark: `---` key: value lines `---`
const parseMark = (t) => {
  const out = {}; const lines = t.split('\n'); let i = lines.indexOf('---');
  if (i < 0) return out;
  for (i++; i < lines.length && lines[i] !== '---'; i++) {
    const k = lines[i].indexOf(':'); if (k > 0) out[lines[i].slice(0, k).trim()] = lines[i].slice(k + 1).trim();
  }
  return out;
};

const memo = new Map();     // immutable answers: by block id, by signal id once in a block
async function req(path) {
  if (memo.has(path)) return memo.get(path);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 10000);
  let r, text;
  try {
    r = await fetch(API + path, { signal: ctl.signal, headers: { Accept: 'application/json, text/plain' } });
    text = await r.text();
  } catch (e) {
    throw new Down(e.name === 'AbortError' ? 'no answer in 10 s' : 'unreachable');
  } finally { clearTimeout(timer); }
  if (r.status >= 500 || r.status === 429) throw new Down(`HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  let data = null;
  try { data = ct.includes('json') || /^\s*[{[]/.test(text) ? parseJSON(text) : text.startsWith('---') ? parseMark(text) : text; } catch { data = text; }
  const res = { ok: r.ok, status: r.status, data };
  if (r.ok && (/^\/(block|header)\/[0-9a-f]{64}$/.test(path) || (path.startsWith(`${SIGNAL_API}/`) && data && data.height !== 'mempool'))) memo.set(path, res);
  up();
  return res;
}
// the answer, or null on 4xx (unknown id, not settled); throws Down when the node is away
const api = async (path) => { const r = await req(path); return r.ok ? r.data : null; };

// the indexer's static files: null when not served (yet)
const dataCache = new Map();
async function file(name, maxAge = DATA_EVERY) {
  const c = dataCache.get(name);
  if (c && Date.now() - c.at < maxAge) return c.data;
  try {
    const r = await fetch(`${DATA}/${name}`, { cache: 'no-cache' });
    const ct = r.headers.get('content-type') || '';
    const data = r.ok && ct.includes('json') ? parseJSON(await r.text()) : null;
    dataCache.set(name, { at: Date.now(), data });
    return data;
  } catch { return c ? c.data : null; }
}

let retryOnUp = false;     // a page that failed because the node was away renders again when it is back
function up() {
  if (!downSince) return;
  downSince = 0; $('#banner').hidden = true; $('#net').classList.remove('down');
  netLine();
  if (retryOnUp) { retryOnUp = false; setTimeout(() => render(false), 0); }
}
function down(why) {
  if (!downSince) downSince = now();
  const n = $('#net'); n.classList.add('down'); n.innerHTML = '<i></i>reconnecting…';
  n.title = why;
}
function banner() {     // only a drop that lasts says so out loud
  const b = $('#banner');
  if (downSince && now() - downSince >= 10) {
    b.hidden = false;
    b.textContent = `the node has not answered for ${dur(now() - downSince)}. what you see may be stale; the page keeps asking.`;
  }
}

/* ------------------------------------------------------------------ numbers */
const SEP = ' ';  // thin space: long numbers wrap between groups; tables are nowrap
const grp = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  let s = String(v); const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  if (!/^\d+$/.test(s)) return esc(v);
  return (neg ? '−' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, SEP);
};
let DENOM = '';
const amt = (v) => `${grp(v)}<span class="u">${esc(DENOM)}</span>`;
// compact amount for tiles: SI prefix over the exact integer (raw units, no decimals invented), the exact value under it
const amtc = (v) => {
  const raw = String(v ?? ''); const neg = raw.startsWith('-'); const d = neg ? raw.slice(1) : raw;
  if (!/^\d+$/.test(d)) return amt(v);
  if (d.length <= 6) return amt(v);
  const P = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']; const i = Math.min(Math.floor((d.length - 1) / 3), P.length - 1);
  const n = d.length - 3 * i; const dec = Math.max(1, 5 - n);
  const head = `${d.slice(0, n)}.${d.slice(n, n + dec)}`;
  return `<span title="${grp(raw)} ${esc(DENOM)}">${neg ? '−' : ''}${head}<span class="u">${P[i]}${SEP}${esc(DENOM)}</span></span><em class="exact">${grp(raw)}</em>`;
};
const big = (v) => { try { return BigInt(v); } catch { return 0n; } };
const si = (x, unit = '') => {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  const p = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z']; let i = 0;
  while (Math.abs(x) >= 1000 && i < p.length - 1) { x /= 1000; i++; }
  return `${x.toFixed(Math.abs(x) < 10 ? 2 : Math.abs(x) < 100 ? 1 : 0)}${SEP}${p[i]}${unit}`;
};
const dur = (s) => {
  s = Math.max(0, Math.round(s));
  if (s < 90) return `${s}${SEP}s`;
  if (s < 5400) return `${Math.round(s / 60)}${SEP}min`;
  if (s < 172800) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)}${SEP}h`;
  return `${Math.round(s / 86400)}${SEP}d`;
};
// ages tick: every [data-ago] is rewritten once a second
const ago = (t) => (t ? `<span data-ago="${Number(t)}">${dur(now() - Number(t))} ago</span>` : '—');
const pct = (num, den) => { if (den === 0n) return '—'; const x = (num * 1000000n) / den; return `${(Number(x) / 10000).toFixed(4)}${SEP}%`; };
// work of a compact target: floor(2^256 / (target + 1)) — cybernode chain/pow.rs
const work = (bits) => {
  const b = typeof bits === 'string' ? parseInt(bits, 16) : Number(bits); const exp = b >>> 24; const man = BigInt(b & 0x7fffff);
  if (!man) return 0n;
  const target = exp <= 3 ? man >> BigInt(8 * (3 - exp)) : man << BigInt(8 * (exp - 3));
  return (1n << 256n) / (target + 1n);
};
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const val = (v) => (Number(v) > 0 ? `<span class="pos">+${v}</span>` : Number(v) < 0 ? `<span class="neg">−${-v}</span>` : '0');
const bps = (b) => `${(Number(b) / 100).toFixed(2)}${SEP}%`;

/* ------------------------------------------------------------------ ids */
const short = (id) => (id && id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-6)}` : esc(id ?? '—'));
const cp = (id) => `<button class="cp" data-copy="${esc(id)}" title="copy" aria-label="copy">⧉</button>`;
const ref = (kind, id) => (id ? `<a class="id" href="#/${kind}/${esc(id)}" title="${esc(id)}">${short(id)}</a>${cp(id)}` : '—');
const full = (id) => (id ? `<span class="id full" data-copy="${esc(id)}" title="click to copy">${esc(id)}</span>` : '—');
const kind = (k) => `<span class="kind ${esc(k)}">${esc(k)}</span>`;
const hlink = (h) => `<a href="#/block/${Number(h)}">${grp(h)}</a>`;

/* ------------------------------------------------------------------ the node, live */
const LIVE = {
  tip: null,          // /tip: height, id, chainwork
  tipTime: 0,         // time of the tip block
  recent: [],         // the last WINDOW+1 /blocks rows
  st: null, stAt: 0,  // /status
  eco: null,          // /economy
  summary: null,      // the indexer's summary.json
  arrived: 0,         // Date.now() when the last new block was seen
  work: null,         // 'tickets' (200-byte headers carry a settlement sample) or 'hashes' (the 168-byte header of the alpha until it redeploys)
};

/* the work: a ticket or a hash. detected once, from the indexer's summary or the genesis header's length. */
const isT = () => LIVE.work === 'tickets';
const unit = () => (isT() ? 'tickets/s' : 'H/s');
const attempts = () => (isT() ? 'attempts' : 'hashes');
const sampleOf = (b) => (b && b.hex && b.hex.length === TICKET_HEX ? b.hex.slice(336) : null);
// the lottery's four fields of a 218-byte epoch record (cybernode chain/economy/settle.rs): players u32, samples u32, by_mean u32, value i64 LE
const recordTail = (e) => {
  if (e.players !== undefined) return { players: Number(e.players), samples: Number(e.samples), by_mean: Number(e.by_mean), value: String(e.value) };
  const h = e.record; if (!h || h.length !== RECORD_HEX) return null;
  const u32 = (o) => parseInt(h.slice(o + 6, o + 8) + h.slice(o + 4, o + 6) + h.slice(o + 2, o + 4) + h.slice(o, o + 2), 16);
  let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(parseInt(h.slice(420 + 2 * i, 422 + 2 * i), 16));
  if (v >= 1n << 63n) v -= 1n << 64n;
  return { players: u32(396), samples: u32(404), by_mean: u32(412), value: v.toString() };
};
async function detectWork() {
  if (LIVE.work) return LIVE.work;
  const s = LIVE.summary || await file('summary.json');
  if (s && s.work) { LIVE.work = s.work; LIVE.summary = s; }
  else { const h = await api('/header/0').catch(() => null); if (h) LIVE.work = sampleOf(h) ? 'tickets' : 'hashes'; }
  if (LIVE.work) howLine();
  return LIVE.work;
}
// the footer's one line on the work, once it is known
function howLine() {
  const p = $('#how p'); if (!p) return;
  p.innerHTML = isT()
    ? `how it works · the proof of work is a settlement ticket: every attempt at a block is one Shapley sample of the epoch's game, committed in the header; the block id below the target is the ticket, the work and the subsidy, verified by every node recomputing it (<a href="${REWARDS}#7-settlement-mining" target="_blank" rel="noopener">rewards §7</a>) · difficulty set every block by ASERT toward 30 s · epochs of 240 blocks · a cyberlink with amount &gt; 0 and valence ≠ 0 is a staking position; positions are paid at boundary + 120 blocks by the lottery's estimate of their share of the syntropy gain (<a href="https://github.com/cyberia-to/cybernode/blob/main/specs/chain-economy.md#5-settlement" target="_blank" rel="noopener">chain-economy §5–6</a>) · the network is an experiment in collective learning whose security grows.`
    : `how it works · proof of work over hemera until the alpha redeploys; then the settlement ticket of <a href="${REWARDS}#7-settlement-mining" target="_blank" rel="noopener">rewards §7</a> is the work · difficulty set every block by ASERT toward 30 s · epochs of 240 blocks · a cyberlink with amount &gt; 0 and valence ≠ 0 is a staking position; positions are paid at boundary + 120 blocks by their share of the syntropy gain (<a href="https://github.com/cyberia-to/cybernode/blob/main/specs/chain-economy.md#5-settlement" target="_blank" rel="noopener">chain-economy §5–6</a>) · the network is an experiment in collective learning whose security grows.`;
}
// the short account of mining now, for the overview and the earnings pages
function miningNote(where) {
  if (!isT()) return `<p class="lede">ticket mining starts at the alpha's redeploy: this node still grinds hemera over the header, so the work shown here is hashes. after the redeploy every attempt at a block is one Shapley sample of the epoch's game and the pages read tickets (<a href="${REWARDS}#7-settlement-mining" target="_blank" rel="noopener">rewards §7</a>).</p>`;
  const t = LIVE.summary && LIVE.summary.ticket; const g = t && t.game;
  const W = g ? grp(g.w_ticket) : 'W_TICKET';
  return `<p class="lede">how mining works now: there is no hash puzzle. every attempt at a block is one Shapley sample of the game of the epoch before — the marginal Δφ⁺ of ${g && g.players ? `each of ${grp(Math.min(g.players, g.w_ticket - 1))} links in a window of the ordering the template draws` : 'the links that changed, and gradient probes of the graph where none did'}, ${W} entries, one cold solve of the consensus engine each — committed in the header as the sample; a block id below the target makes that sample the block's work and its subsidy (<a href="${REWARDS}#7-settlement-mining" target="_blank" rel="noopener">rewards §7</a>). every node recomputes the ticket before it accepts the block, hash first, at most V_BUDGET such recomputations per interval at the tip (6 on pussy), so a forged header costs a node one bounded check and never a block. the settlement reads the window's samples: a link sampled K_MIN = 64 times or more is paid its mean, below that its exact gradient. the floor of the difficulty (2^252, 16 attempts a block) means a slow network never stalls, only slows: a lone slow core sits at minutes per block with nothing left for ASERT to do; one current laptop or about five server cores hold the 30 s (§7).${where === 'earnings' ? ' miners are paid per ticket won: the subsidy minus the pool\'s cut, plus the block\'s fees.' : ''}</p>`;
}

async function status(fresh) {
  if (!fresh && LIVE.st && Date.now() - LIVE.stAt < 5000) return LIVE.st;
  const r = await req('/status');
  if (!r.ok || typeof r.data !== 'object') throw new Down(`status HTTP ${r.status}`);
  LIVE.st = r.data; LIVE.stAt = Date.now();
  DENOM = LIVE.st.chain || DENOM; $('#denom-foot').textContent = DENOM || 'its denom';
  netLine();
  if (!LIVE.work) await detectWork().catch(() => null);
  return LIVE.st;
}
function netLine() {
  const st = LIVE.st; if (!st || downSince) return;
  const n = $('#net'); n.classList.remove('down'); n.title = '';
  const rc = /-rc$/.test(st.chain || '') ? ' · rehearsal' : '';
  const h = LIVE.tip ? Math.max(Number(st.height), LIVE.tip.height) : Number(st.height);
  n.innerHTML = `<i></i><b>${esc(st.chain)}</b> · height <span id="net-h">${grp(h)}</span>${rc}`;
}
async function economy() { if (!LIVE.eco) LIVE.eco = await api('/economy').catch(() => null); return LIVE.eco || {}; }

// the chain's work rate now — H/s, or tickets/s where the work is a settlement sample: the indexer's Σ work ÷ Δt over 100 blocks,
// else the current work per block over the recent blocks' span. the work of a block is 2^256 ÷ (target + 1) either way: expected
// hashes, or expected attempts (tickets) per block.
function hashrate() {
  const s = LIVE.summary; const w = isT() ? 'Σ attempts per block' : 'Σ work';
  // the index must be of this chain and near the tip: an index of an earlier chain (a redeploy from a new genesis) says nothing here
  if (s && s.hashrate_100 && LIVE.tip && s.height <= LIVE.tip.height && LIVE.tip.height - s.height < 200 && (!LIVE.st || !s.chain || s.chain === LIVE.st.chain)) return { rate: Number(s.hashrate_100), how: `${w} ÷ Δt over 100 blocks (indexer)` };
  const b = LIVE.recent; const st = LIVE.st;
  if (b.length > 2 && st && b[b.length - 1].time > b[0].time) {
    const span = b.length - 1;
    return { rate: (Number(work(st.bits)) * span) / (b[b.length - 1].time - b[0].time), how: `${isT() ? 'attempts per block' : 'current difficulty'} × ${span} blocks ÷ their span` };
  }
  return { rate: NaN, how: 'needs two blocks' };
}

let viewLive = null;       // what the current view does when a block arrives: null, or fn(newBlocks)
let polling = false; let ticks = 0; let failures = 0; let nextPoll = 0; let dataAt = 0;

async function poll() {
  if (polling) return; polling = true;
  try {
    const r = await req('/tip');
    if (!r.ok || !r.data || r.data.height === undefined) throw new Down(`tip HTTP ${r.status}`);
    const tip = { height: Number(r.data.height), id: r.data.id, chainwork: r.data.chainwork };
    const prev = LIVE.tip;
    LIVE.tip = tip; failures = 0; nextPoll = Date.now() + TICK;
    if (prev && (tip.height !== prev.height || tip.id !== prev.id)) await onBlock(prev, tip);
    else if (++ticks % STATUS_EVERY === 0) { await status(true); liveTiles(); }
    if (Date.now() - dataAt > DATA_EVERY) { dataAt = Date.now(); LIVE.summary = await file('summary.json'); }
  } catch (e) {
    if (!(e instanceof Down)) { console.error(e); return; }
    failures++; down(e.message);
    nextPoll = Date.now() + Math.min(15000, TICK * 2 ** Math.min(failures, 4));
  } finally { polling = false; }
}

async function onBlock(prev, tip) {
  const gap = tip.height - prev.height;
  let fresh = [];
  if (gap > 0) {
    const r = await api(`/blocks?after=${Math.max(prev.height, tip.height - LATEST)}&limit=${Math.min(gap, LATEST)}`);
    fresh = (r && r.blocks) || [];
  } else {   // a reorg: the tip moved sideways or back; reread the window
    const r = await api(`/blocks?limit=${WINDOW + 1}`);
    LIVE.recent = (r && r.blocks) || [];
  }
  if (fresh.length) {
    const keep = LIVE.recent.filter((b) => b.height < fresh[0].height);
    LIVE.recent = [...keep, ...fresh].slice(-(WINDOW + 1));
  }
  const head = LIVE.recent[LIVE.recent.length - 1];
  if (head) LIVE.tipTime = head.time;
  LIVE.arrived = Date.now();
  const lastSettled = LIVE.st && LIVE.st['last-settled'];
  await status(true);
  if (LIVE.st['last-settled'] !== lastSettled) LIVE.eco = null;
  const n = $('#net'); n.classList.remove('blink'); void n.offsetWidth; n.classList.add('blink');
  if (viewLive) await viewLive(gap > 0 ? fresh : null);
}

function tick() {
  document.querySelectorAll('[data-ago]').forEach((el) => { el.textContent = `${dur(now() - Number(el.dataset.ago))} ago`; });
  banner();
  hashMeter();
  if (!document.hidden && Date.now() >= nextPoll) poll();
}

/* ------------------------------------------------------------------ building blocks */
const kv = (rows) => `<div class="kv">${rows.filter(Boolean).map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('')}</div>`;
const tile = (label, value, small = '', cls = '') => `<div class="tile ${cls}${String(value).replace(/<em class="exact">[^<]*<\/em>/g, '').replace(/<[^>]*>[^<]*<\/span>|<[^>]*>/g, '').length > 13 ? ' long' : ''}"><b>${value}</b><span>${label}</span>${small ? `<small>${small}</small>` : ''}</div>`;
const table = (head, rows, empty = 'nothing here yet', id = '') => rows.length
  ? `<div class="tbl"><table><thead><tr>${head.map((h) => `<th class="${h.startsWith('>') ? 'r' : ''}${h.includes('~') ? ' hide-s' : ''}">${h.replace(/^>|~/g, '')}</th>`).join('')}</tr></thead><tbody${id ? ` id="${id}"` : ''}>${rows.join('')}</tbody></table></div>`
  : `<div class="empty">${empty}</div>`;
const tds = (cells, head, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}>${cells.map((c, i) => `<td class="${(head[i] || '').startsWith('>') ? 'r' : ''}${(head[i] || '').includes('~') ? ' hide-s' : ''}">${c}</td>`).join('')}</tr>`;
const meter = (frac, mark) => `<div class="meter"><i style="width:${(Math.max(0, Math.min(1, frac)) * 100).toFixed(2)}%"></i>${mark !== undefined ? `<em style="left:${(mark * 100).toFixed(2)}%"></em>` : ''}</div>`;

// epoch numbering (chain-economy §2.1): block h is in epoch floor((h−1)/L)+1, epoch E's boundary is E·L, it settles at E·L + D
const epochOf = (h, L) => Math.floor((Math.max(1, h) - 1) / L) + 1;

/* ------------------------------------------------------------------ overview */
const BLOCK_HEAD = ['height', 'block', 'age', '>signals', '>size~', 'miner~'];
const blockRow = (b, cls) => tds([`<a href="#/block/${b.height}">${grp(b.height)}</a>`, ref('block', b.id), ago(b.time), grp(b.txs), `${grp(b.size)}${SEP}B`, ref('neuron', b.miner)], BLOCK_HEAD, cls);
const epochHead = () => ['epoch', '>boundary', '>settled at', '>budget', '>paid', '>rewarded~', '>Δ syntropy~', ...(isT() ? ['>players~', '>samples~'] : [])];
const epochRow = (e) => {
  const t = isT() ? recordTail(e) : null;
  return tds([`<a href="#/epoch/${e.epoch}">${grp(e.epoch)}</a>`, hlink(e.boundary), hlink(e.settled_at), grp(e.budget), grp(e.paid), grp(e.rewarded), grp(e.delta_syntropy),
    ...(isT() ? [t ? grp(t.players) : '—', t ? grp(t.samples) : '—'] : [])], epochHead());
};

function liveStrip() {
  return `<section class="live" aria-label="the chain now">
    <div class="lv lv-h"><span class="lab">height</span><b id="lv-height">—</b><small>last block <span id="lv-ago">—</span> · <span id="lv-tip"></span></small></div>
    <div class="lv lv-hash"><div class="row"><span class="lab">${isT() ? 'sampling' : 'hashing'} block <b id="lv-next">—</b></span><span class="lab" id="lv-p">—</span></div>
      <div class="meter hot" id="lv-meter"><i></i><em title="the expected time: P = 63 %"></em></div>
      <small id="lv-hash-note">—</small></div>
    <div class="lv lv-epoch"><div class="row"><span class="lab">epoch <b id="lv-epoch">—</b></span><span class="lab" id="lv-epoch-left">—</span></div>
      <div class="meter" id="lv-emeter"><i></i><em title="the settlement of the epoch before"></em></div>
      <small id="lv-epoch-note">—</small></div>
    <div class="lv lv-mem"><span class="lab">mempool</span><b id="lv-mem">—</b><small id="lv-mem-note">—</small></div>
  </section>`;
}

// the live numbers that need no new block: ages, the hashing meter, the epoch bar
function hashMeter() {
  const el = $('#lv-meter'); if (!el || !LIVE.st) return;
  const st = LIVE.st; const tipH = LIVE.tip ? LIVE.tip.height : Number(st.height);
  const t = LIVE.tipTime ? Math.max(0, Date.now() / 1000 - LIVE.tipTime) : 0;
  const need = Number(work(st['next-bits'] || st.bits));
  const { rate } = hashrate();
  const T = rate > 0 ? need / rate : TARGET;
  const P = 1 - Math.exp(-t / T);
  $('#lv-height').textContent = grp(tipH);
  $('#lv-ago').textContent = LIVE.tipTime ? `${dur(t)} ago` : '—';
  $('#lv-next').textContent = grp(tipH + 1);
  $('#lv-p').textContent = `P ${(P * 100).toFixed(1)}${SEP}%`;
  el.querySelector('i').style.width = `${(P * 100).toFixed(2)}%`;
  el.querySelector('em').style.left = `${(1 - Math.exp(-1)) * 100}%`;
  $('#lv-hash-note').innerHTML = isT()
    ? `expected ${si(need)} attempts for this block (2^256 ÷ target), each one Shapley sample · ≈ ${si(rate * t)} sampled in ${dur(t)} at ≈ ${si(rate, 'tickets/s')} · P(a block by now) = 1 − e<sup>−t/T</sup>, T ≈ ${dur(T)}`
    : `expected ${si(need)} hashes for this block · ≈ ${si(rate * t)} hashed in ${dur(t)} at ≈ ${si(rate, 'H/s')} · P(a block by now) = 1 − e<sup>−t/T</sup>, T ≈ ${dur(T)}`;
}
async function liveTiles() {
  if (!$('#lv-mem') || !LIVE.st) return;
  const st = LIVE.st; const eco = await economy();
  const L = Number(eco.epoch_length || 240); const D = Number(eco.settle_delay || 120);
  const tipH = LIVE.tip ? LIVE.tip.height : Number(st.height);
  const e = epochOf(tipH, L); const start = (e - 1) * L; const end = e * L;
  const settlePrev = start + D;
  $('#lv-mem').textContent = grp(st.mempool);
  $('#lv-mem-note').textContent = `signals waiting · ${st.peers} peer${st.peers === '1' ? '' : 's'} · finalized ${Number(st.finalized).toLocaleString('en')}`;
  $('#lv-epoch').textContent = e;
  $('#lv-epoch-left').textContent = `${end - tipH} blocks to ${end}`;
  const em = $('#lv-emeter'); em.querySelector('i').style.width = `${(((tipH - start) / L) * 100).toFixed(2)}%`; em.querySelector('em').style.left = `${((D / L) * 100).toFixed(2)}%`;
  $('#lv-epoch-note').innerHTML = tipH < settlePrev && e > 1
    ? `epoch ${e - 1} settles at ${hlink(settlePrev)}, in ${grp(settlePrev - tipH)} blocks (≈ ${dur((settlePrev - tipH) * TARGET)}) · boundary in ≈ ${dur((end - tipH) * TARGET)}`
    : `epoch ${e} closes at ${hlink(end)} (≈ ${dur((end - tipH) * TARGET)}) and settles at ${hlink(end + D)} · last settled ${st['last-settled']}`;
  const tip = $('#lv-tip'); if (tip && LIVE.tip) tip.innerHTML = ref('block', LIVE.tip.id);
  hashMeter();
}

async function overview() {
  const st = await status(true);
  const last = Number(st['last-settled'] || 0);
  const [bl, eco, ep, sum, stk] = await Promise.all([
    api(`/blocks?limit=${WINDOW + 1}`), economy(), api(`/epochs?after=${Math.max(0, last - 6)}&limit=6`), file('summary.json'), file('stakes.json'),
  ]);
  LIVE.recent = (bl && bl.blocks) || []; LIVE.summary = sum || LIVE.summary;
  const head = LIVE.recent[LIVE.recent.length - 1];
  // the tip is the last block on the page: if the node is already further, the next /tip fills the gap through onBlock
  if (head) { LIVE.tipTime = head.time; LIVE.tip = { height: head.height, id: head.id, chainwork: st.chainwork }; }
  viewLive = async (fresh) => {
    const tb = $('#ov-blocks');
    if (!tb) return;
    if (fresh === null) { tb.innerHTML = LIVE.recent.slice(-LATEST).reverse().map((b) => blockRow(b)).join(''); }
    else {
      for (const b of fresh) { if (!tb.querySelector(`a[href="#/block/${b.height}"]`)) tb.insertAdjacentHTML('afterbegin', blockRow(b, 'fresh')); }
      while (tb.rows.length > LATEST) tb.deleteRow(tb.rows.length - 1);
    }
    $('#ov-tiles').innerHTML = overviewTiles(await file('stakes.json'));
    if (LIVE.st['last-settled'] !== String(last)) { render(true); return; }
    liveTiles();
    document.title = `${LIVE.tip.height} · the chain, live — space-pussy explorer`;
  };
  const epochs = ((ep && ep.epochs) || []).slice().reverse();
  const latest = LIVE.recent.slice(-LATEST).reverse();
  setTimeout(liveTiles, 0);
  return `<p class="kick">${esc(st.chain)} · ${esc(st.protocol || '')} · ${esc(st.version ? 'v' + st.version : '')}</p>
  <h1>the chain, <em>live</em></h1>
  <p class="sub">genesis block ${ref('block', st['genesis-block'])} · moniker ${esc(st.moniker)} · state root ${short(st['bbg-root'])}${cp(st['bbg-root'] || '')}</p>
  ${liveStrip()}
  <h2>now</h2><div class="tiles" id="ov-tiles">${overviewTiles(stk)}</div>
  ${miningNote('overview')}
  <div class="cols"><div><h2>latest blocks</h2>${table(BLOCK_HEAD, latest.map((b) => blockRow(b)), 'no blocks served', 'ov-blocks')}<div class="pager"><a href="#/history">history of the chain →</a><a class="end" href="#/blocks">all blocks →</a></div></div>
  <div><h2>latest epochs</h2>${table(['epoch', '>boundary', '>settled at', '>paid'], epochs.map((e) => tds([`<a href="#/epoch/${e.epoch}">${grp(e.epoch)}</a>`, grp(e.boundary), grp(e.settled_at), grp(e.paid)], ['', '>', '>', '>'])), 'no epoch settled yet')}
  <p class="note">an epoch is ${grp(eco.epoch_length || 240)} blocks; it settles ${grp(eco.settle_delay || 120)} blocks after its boundary.</p>
  <div class="pager"><a href="#/staking">staking →</a><a class="end" href="#/epochs">all epochs →</a></div></div></div>`;
}

function overviewTiles(stk) {
  const st = LIVE.st; const b = LIVE.recent;
  const gaps = b.slice(1).map((x, i) => x.time - b[i].time);
  const med = median(gaps);
  const { rate, how } = hashrate();
  const eco = LIVE.eco || {};
  const particles = eco.timings && eco.timings[0] ? eco.timings[0].particles : st.particles;
  const subsidy = big(st.subsidy); const fb = big(st['focus-bps']);
  const cut = (subsidy * fb) / 10000n;
  const positions = stk ? `${grp(stk.positions_open)} open position${stk.positions_open === 1 ? '' : 's'} · ` : '';
  return [
    tile('block time', isFinite(med) ? `${med}<span class="u">s</span>` : '—', `median over the last ${grp(gaps.length)} blocks · target ${TARGET}${SEP}s`),
    tile(`${isT() ? 'tickets/s' : 'hashrate'}<span class="est">estimate</span>`, si(rate, unit()), isT() ? `${how} · attempts per block ≈ 2^256/target` : how),
    isT()
      ? tile('attempts per block', si(Number(work(st.bits || '0x20100000'))), `≈ 2^256 ÷ target: expected tickets to find one block · bits ${esc(st.bits)} → next ${esc(st['next-bits'] || '—')}`)
      : tile('difficulty', si(Number(work(st.bits || '0x1e010000'))), `expected hashes per block · bits ${esc(st.bits)} → next ${esc(st['next-bits'] || '—')}`),
    tile('supply', amtc(st.supply), `raw units · subsidy ${grp(st.subsidy)} per block`, 'wide'),
    tile('active stake', amtc(st['active-stake']), `${positions}total ${grp(st['total-stake'])} · <a href="#/staking">staking →</a>`, 'stake wide'),
    tile('to stakers', bps(st['focus-bps']), `of each block's subsidy: ${grp(cut.toString())} per block into the focus pool`),
    tile('pool', amtc(st.pool), `paid out a quarter per settlement · settlement ${st['settlement-ok'] === 'true' ? 'ok' : esc(st['settlement-ok'] || '—')}`, 'wide'),
    tile('neurons', grp(st.neurons), 'keys with state'),
    tile('particles', grp(particles), 'in the graph of the last settlement'),
    tile('axons', grp(st.axons), 'cyberlinked pairs p → q'),
    earnTile(),
  ].join('');
}

/* ------------------------------------------------------------------ blocks, block, signal */
async function blocks(top) {
  const st = await status();
  const tip = Number(st.height);
  const hi = top === undefined ? tip : Math.min(Number(top), tip);
  const lo = Math.max(0, hi - PAGE + 1);
  let rows = [];
  if (lo >= 1) {
    const r = await api(`/blocks?after=${lo - 1}&limit=${hi - lo + 1}`);
    rows = (r && r.blocks) || [];
  } else {
    const [r, g] = await Promise.all([hi >= 1 ? api(`/blocks?after=0&limit=${hi}`) : null, api('/block/0')]);
    rows = [...(g ? [g] : []), ...((r && r.blocks) || [])];
  }
  rows.reverse();
  if (top === undefined) viewLive = () => render(true);
  const newer = hi < tip ? `<a href="#/blocks${hi + PAGE >= tip ? '' : '/' + (hi + PAGE)}">← newer</a>` : '<span>← newer</span>';
  const older = lo > 0 ? `<a href="#/blocks/${lo - 1}">older →</a>` : '<span>older →</span>';
  return `<p class="kick">blocks · ${esc(st.chain)}</p><h1>blocks <em>${grp(lo)}–${grp(hi)}</em></h1><p class="sub">tip ${grp(tip)} · ${PAGE} per page${top === undefined ? ' · live' : ''}</p>
  <h2>&nbsp;</h2>${table(BLOCK_HEAD, rows.map((b) => blockRow(b)))}<div class="pager">${newer}${older}</div>`;
}

const txLine = (t) => {
  const x = t.tx || {};
  switch (t.kind) {
    case 'coinbase': return `→ ${ref('neuron', x.to)} ${amt(x.amount)}`;
    case 'transfer': return `${ref('neuron', x.from)} → ${ref('neuron', x.to)} ${amt(x.amount)}`;
    case 'cyberlink': return `${ref('particle', x.p)} → ${ref('particle', x.q)} · valence ${val(x.valence)} · ${amt(x.amount)}`;
    case 'unlock': return `${ref('neuron', x.from)} unlocks ${ref('particle', x.p)} → ${ref('particle', x.q)} ${amt(x.amount)}`;
    case 'payout': return `${ref('neuron', x.from)} · ${ref('particle', x.p)} → ${ref('particle', x.q)}`;
    case 'claim': return `account ${short(x.account_id)}${cp(x.account_id || '')}`;
    default: return '';
  }
};

async function block(idh) {
  await status();
  const r = await req(`/block/${idh}`);
  if (!r.ok) {
    if (/^\d+$/.test(idh) && Number(idh) > Number(LIVE.st.height)) viewLive = () => render(true);   // a future height: show it when it lands
    return notFound(`block ${esc(idh)}`, r.data && r.data.error ? r.data.error : 'not yet: the page shows it the moment it is mined');
  }
  const b = r.data;
  const [txs, ticket] = await Promise.all([Promise.all((b.txids || []).slice(0, 200).map((id) => api(`${SIGNAL_API}/${id}`).catch(() => null))), ticketSection(b)]);
  const head = ['#', 'signal', 'kind', 'what', '>fee~'];
  const rows = (b.txids || []).slice(0, 200).map((id, i) => { const t = txs[i]; return tds([i, ref('signal', id), t ? kind(t.kind) : '—', t ? txLine(t) : '', t && t.tx.fee !== undefined ? grp(t.tx.fee) : '—'], head); });
  return `<p class="kick">block</p><h1>block <em>${grp(b.height)}</em></h1><p class="sub">${full(b.id)}</p>
  <div class="crumbs">${b.height > 0 ? `<a href="#/block/${b.height - 1}">← ${grp(b.height - 1)}</a>` : ''}<a href="#/block/${b.height + 1}">${grp(b.height + 1)} →</a><a href="#/blocks/${b.height}">in the list</a></div>
  <h2>header</h2>${kv([
    ['height', grp(b.height)], ['time', `${grp(b.time)} unix · ${ago(b.time)}`], ['miner', b.miner ? ref('neuron', b.miner) : 'none (genesis)'],
    ['signals', grp(b.txs)], ['fees', amt(b.fees)], ['size', `${grp(b.size)}${SEP}bytes`],
    ['bits', `${esc(b.bits)} · ${si(Number(work(b.bits)))} expected ${sampleOf(b) ? 'attempts' : 'hashes'}`], ['nonce', full(b.nonce)],
    ['prev', b.height > 0 ? ref('block', b.prev) : 'none'], ['signal root', full(b.tx_root)], ['state root', full(b.state_root)], ['chain', full(b.chain)], ['version', grp(b.version)],
  ])}
  ${ticket}
  <h2>signals</h2>${table(head, rows, 'no signals in this block')}`;
}

// the block's ticket (rewards.md §7): its sample, the game it samples, the window, the rank, how it was verified
async function ticketSection(b) {
  const sample = sampleOf(b);
  if (!sample) {
    return `<h2>ticket</h2><div class="empty">${isT() ? 'a 168-byte header: no sample, a block from before ticket mining' : 'no ticket in this header: this node grinds hemera until the alpha redeploys. ticket mining starts at the alpha\'s redeploy; then every block carries its settlement sample here'}.</div>`;
  }
  const [eco, tk] = await Promise.all([economy(), file('tickets.json')]);
  const L = Number(eco.epoch_length || 240); const G = epochOf(b.height, L) - 1;
  const games = (tk && tk.games) || [];
  const g = games.find((x) => Number(x.epoch) === G) || null;
  const latest = games[0] || null;                        // W_TICKET is the chain's; the latest game read carries it
  const W = g ? Number(g.w_ticket) : latest ? Number(latest.w_ticket) : null; const N = g ? Number(g.players) : null; const m = g ? Math.min(N, W - 1) : null;
  const rank = N === 0 ? '0: the game has no player, so every entry is a gradient probe of the graph'
    : N ? `the 64 bits after the nonce in hemera(template), mod ${grp(N)}: the first rank of the cyclic window; the node does not serve the draw, every verifier derives it`
      : 'the 64 bits after the nonce in hemera(template), mod N';
  const rows = [
    ['sample', `${full(sample)}`],
    ['samples the game of', `<a href="#/epoch/${G}">epoch ${grp(G)}</a> · beacon ${g ? ref('block', g.beacon) : hlink(G * L)}${g ? ` · cluster ${short(g.cluster)}${cp(g.cluster)}` : ''}`],
    ['players', g ? (N ? `${grp(N)} link${N === 1 ? '' : 's'} whose stake changed between the boundaries of epochs ${grp(G - 1)} and ${grp(G)}` : 'none: no stake changed in the epoch, the ticket probes the gradient the attribution reads') : 'the index reads each epoch\'s game once from the node (GET /game/beacon); not held for this one'],
    ['window', g ? `W_TICKET = ${grp(W)} entries: ${grp(m)} marginal${m === 1 ? '' : 's'} Δφ⁺ of a cyclic window of the ordering drawn from the template, ${grp(W - m)} gradient probe${W - m === 1 ? '' : 's'} over the ${grp(g.axons)} axons of the base`
      : W ? `W_TICKET = ${grp(W)} entries (the chain's, from the latest game read): min(N, W − 1) marginals of the ordering's window, the rest gradient probes` : 'W_TICKET entries: min(N, W − 1) marginals of the ordering\'s window, the rest gradient probes'],
    ['rank', rank],
    ['verified', `by recomputation: this node derived the ordering, the rank and the probes from the template's digest, ran the ${g ? grp(W + 1) : 'W + 1'} cold solves itself and matched this commitment before accepting the block; no proof is carried, the proof of a sample is the sample`],
    ['work', `${si(Number(work(b.bits)))} expected attempts, 2^256 ÷ (target + 1) · the block id is below the target: this sample is the block's work and its subsidy`],
  ];
  return `<h2>ticket</h2>${kv(rows)}<p class="note">the header's last 32 bytes commit to the ticket's entries (hemera over D_SAMPLE ‖ W ‖ the marginals and probes); the first 168 are the template whose digest draws the nonce, the rank and the probes. the marginals themselves are not served by the node; the settlement reads them (<a href="${REWARDS}#7-settlement-mining" target="_blank" rel="noopener">rewards §7</a>).</p>`;
}

// a page that shows earnings renders again when a settlement lands
const onSettle = () => { const at = LIVE.st && LIVE.st['last-settled']; viewLive = () => (LIVE.st['last-settled'] !== at ? render(true) : null); };
// what a position earned: the indexer's stakes.json, else the payouts of the last settled epochs on the node
async function earnings(cardId) {
  const stk = await file('stakes.json');
  const pos = stk && (stk.positions || []).find((p) => p.card === cardId);
  if (pos) return { earned: big(pos.earned), epochs: pos.paid_epochs, last: pos.last_paid_epoch, from: 'indexer' };
  const last = Number((LIVE.st && LIVE.st['last-settled']) || 0);
  const eps = last ? await api(`/epochs?after=${Math.max(0, last - 100)}&limit=100`).catch(() => null) : null;
  let earned = 0n; let n = 0; let lastE = null;
  for (const e of (eps && eps.epochs) || []) for (const p of e.payouts || []) if (p.card === cardId) { earned += big(p.amount); n++; lastE = e.epoch; }
  return { earned, epochs: n, last: lastE, from: 'node' };
}
// where a position stands against the settlement that judges the stake it added at height h
async function verdict(h, cardId) {
  const eco = await economy();
  const L = Number(eco.epoch_length || 240); const D = Number(eco.settle_delay || 120);
  const E = epochOf(h, L); const S = E * L + D; const tip = LIVE.tip ? LIVE.tip.height : Number(LIVE.st.height);
  if (tip < S) return `the stake it added at height ${grp(h)} is judged by the settlement of epoch ${E} at height ${hlink(S)}, ${grp(S - tip)} blocks from now (≈ ${dur((S - tip) * TARGET)}).`;
  const e = await api(`/epoch/${E}`).catch(() => null);
  if (!e) return `epoch ${E} settled at ${hlink(S)}; this node does not hold its record.`;
  const pay = (e.payouts || []).find((p) => p.card === cardId);
  return pay
    ? `the settlement of <a href="#/epoch/${E}">epoch ${E}</a> at ${hlink(S)} paid it ${amt(pay.amount)} (budget ${grp(e.budget)}, ${grp(e.rewarded)} rewarded).`
    : `the settlement of <a href="#/epoch/${E}">epoch ${E}</a> at ${hlink(S)} paid it nothing: budget ${grp(e.budget)}, paid ${grp(e.paid)} to ${grp(e.rewarded)} positions, Δ syntropy ${grp(e.delta_syntropy)}.`;
}

async function signalPage(id) {
  await status();
  const r = await req(`${SIGNAL_API}/${id}`);
  if (!r.ok) return notFound(`signal ${short(id)}`, 'not in a block on this node, nor in its mempool');
  const t = r.data; const x = t.tx || {};
  if (t.height === 'mempool') viewLive = () => render(true); else if (t.kind === 'cyberlink') onSettle();
  const where = t.height === 'mempool' ? 'in the mempool, not yet in a block' : `block ${ref('block', t.block)} at height <a href="#/block/${t.height}">${grp(t.height)}</a>, index ${grp(t.index)}`;
  let link3 = ''; let extra = '';
  if (t.kind === 'cyberlink' || t.kind === 'unlock' || t.kind === 'payout') {
    link3 = `<div class="link3"><div class="pt"><span>from particle</span>${pAnchor(x.p)}</div><div class="arrow"><b>→</b>${t.kind === 'cyberlink' ? `<small>valence ${val(x.valence)}</small>` : ''}</div><div class="pt"><span>to particle</span>${pAnchor(x.q)}</div></div>`;
  }
  let earnRows = [];
  if (t.kind === 'cyberlink') {
    const staking = big(x.amount) > 0n && Number(x.valence) !== 0;
    let card = '';
    if (big(x.amount) > 0n && t.height !== 'mempool') {
      const cs = await api(`/cards/${x.from}`).catch(() => null);
      const c = cs && (cs.cards || []).find((c) => c.p === x.p && c.q === x.q);
      if (c) {
        const ea = await earnings(c.card);
        card = `the position: card ${ref('card', c.card)} · stake now ${amt(c.stake)} · locked until height ${grp(c.unlock_at)}.`;
        earnRows = [['position', ref('card', c.card)], ['earned so far', `${amt(ea.earned.toString())} · paid in ${grp(ea.epochs)} epoch${ea.epochs === 1 ? '' : 's'}${ea.last ? ` · last <a href="#/epoch/${ea.last}">${ea.last}</a>` : ''}`],
          ['this stake', staking ? await verdict(Number(t.height), c.card) : 'valence 0: passive stake moves rank and earns nothing']];
      } else card = 'the position it opened is closed now (unlocked to zero).';
    }
    extra = `<p class="note">${big(x.amount) > 0n ? `${staking ? 'a staking position: amount &gt; 0 and valence ≠ 0. it is paid at a settlement (boundary + 120 blocks) by its share of the syntropy gain.' : 'stake with valence 0: it moves rank, it does not earn.'} ${card}` : 'a cyberlink with no stake: it adds to the graph, it does not earn.'}</p>`;
  }
  const rows = [['kind', kind(t.kind)], ['where', where]];
  if (x.from) rows.push(['from neuron', ref('neuron', x.from)]);
  if (x.to) rows.push([t.kind === 'coinbase' ? 'miner' : 'to neuron', ref('neuron', x.to)]);
  if (x.account_id) rows.push(['account', full(x.account_id)]);
  if (x.amount !== undefined) rows.push([t.kind === 'cyberlink' ? 'staked' : 'amount', amt(x.amount)]);
  if (x.valence !== undefined) rows.push(['valence', val(x.valence)]);
  if (x.p) rows.push(['p · from particle', ref('particle', x.p)]);
  if (x.q) rows.push(['q · to particle', ref('particle', x.q)]);
  if (x.payout) rows.push(['payout to', full(x.payout)]);
  if (x.token) rows.push(['token', full(x.token)]);
  if (x.fee !== undefined) rows.push(['fee', amt(x.fee)]);
  if (x.nonce !== undefined) rows.push(['nonce', grp(x.nonce)]);
  if (x.height !== undefined) rows.push(['coinbase height', grp(x.height)]);
  if (x.extra) rows.push(['extra', full(x.extra)]);
  if (x.sig) rows.push(['signature', `${short(x.sig)}${cp(x.sig)} · ${grp(x.sig.length / 2)}${SEP}bytes`]);
  return `<p class="kick">signal · ${esc(t.kind)}</p><h1>signal <em>${short(id)}</em></h1><p class="sub">${full(id)}</p>${link3}${extra}
  ${earnRows.length ? `<h2>earnings</h2>${kv(earnRows)}` : ''}<h2>fields</h2>${kv(rows)}`;
}
const pAnchor = (p) => (p ? `<a href="#/particle/${esc(p)}">${esc(p)}</a>` : '—');

/* ------------------------------------------------------------------ neuron, card */
async function neuron(id) {
  const st = await status();
  const [bal, nonce, cards, stk, ear] = await Promise.all([api(`/balance/${id}`), api(`/nonce/${id}`), api(`/cards/${id}`), file('stakes.json'), file('earnings.json')]);
  const mined = ear && ear.miners && ear.miners.all ? ear.miners.all.rows.find((r) => r.m === id) : null;
  const last = Number(st['last-settled'] || 0);
  const eps = last ? await api(`/epochs?after=${Math.max(0, last - 60)}&limit=60`).catch(() => null) : null;
  const pays = [];
  for (const e of (eps && eps.epochs) || []) for (const p of e.payouts || []) if (p.owner === id) pays.push({ ...p, epoch: e.epoch, settled_at: e.settled_at });
  const b = bal || {};
  const locked = big(b.balance) - big(b.spendable);
  const cs = (cards && cards.cards) || [];
  const byCard = new Map(((stk && stk.positions) || []).map((p) => [p.card, p]));
  const earnedOf = (c) => (byCard.has(c) ? big(byCard.get(c).earned) : pays.filter((p) => p.card === c).reduce((s, p) => s + big(p.amount), 0n));
  const cHead = ['card', 'p → q', 'valence', '>stake', '>earned', '>since', '>unlock at~'];
  const cRows = cs.map((c) => tds([ref('card', c.card), `${ref('particle', c.p)} → ${ref('particle', c.q)}`, val(c.valence), grp(c.stake), grp(earnedOf(c.card).toString()), hlink(c.since), grp(c.unlock_at)], cHead));
  const earnedAll = cs.reduce((s, c) => s + earnedOf(c.card), 0n);
  const pHead = ['epoch', '>settled at', 'card', '>amount'];
  const pRows = pays.reverse().map((p) => tds([`<a href="#/epoch/${p.epoch}">${grp(p.epoch)}</a>`, grp(p.settled_at), ref('card', p.card), grp(p.amount)], pHead));
  onSettle();
  const quiet = big(b.balance) === 0n && !Number(nonce && nonce.confirmed) && !cs.length;
  return `<p class="kick">neuron</p><h1>neuron <em>${short(id)}</em></h1><p class="sub">${full(id)}</p>
  ${quiet ? `<p class="note">this key holds nothing and has signed nothing on this chain. if it is a particle, see <a href="#/particle/${id}">its focus</a>.</p>` : ''}
  <h2>balance</h2><div class="tiles">${tile('balance', amtc(b.balance), `at height ${grp(b.height)}`, 'hero')}${tile('spendable', amtc(b.spendable), locked > 0n ? `${grp(locked.toString())} held but not yet spendable (maturing coinbase)` : 'all of it spendable')}${tile('nonce', grp(nonce ? nonce.confirmed : '—'), `next to sign: ${grp(nonce ? nonce.nonce : '—')}`)}${tile('positions', grp(cs.length), cs.length ? `staked ${grp(cs.reduce((s, c) => s + big(c.stake), 0n).toString())} · earned ${grp(earnedAll.toString())}` : 'staked cyberlinks authored')}${mined ? tile('mined', amtc(mined.earned), `${isT() ? `${grp(mined.blocks)} tickets won` : pl(mined.blocks, 'block')} (${fpct(mined.share)} of all) from ${hlink(mined.first)} to ${hlink(mined.last)} · <a href="#/earnings/miners">top miners →</a>`) : ''}</div>
  <p class="note">token ${short(b.token)}${cp(b.token || '')} · ${esc(b.denom || DENOM)} · supply ${grp(b.supply)}</p>
  <h2>staked positions</h2>${table(cHead, cRows, 'no positions: no staked cyberlink authored by this neuron')}
  <h2>payouts</h2>${table(pHead, pRows, `no payouts in the last ${grp(Math.min(last, 60))} settled epochs`)}`;
}

async function card(id) {
  await status();
  const c = await api(`/card/${id}`);
  if (!c) return notFound(`position ${short(id)}`, 'no position with this id');
  const ea = await earnings(id);
  onSettle();
  return `<p class="kick">position · card</p><h1>card <em>${short(id)}</em></h1><p class="sub">${full(id)}</p>
  <div class="link3"><div class="pt"><span>from particle</span>${pAnchor(c.p)}</div><div class="arrow"><b>→</b><small>valence ${val(c.valence)}</small></div><div class="pt"><span>to particle</span>${pAnchor(c.q)}</div></div>
  <h2>fields</h2>${kv([['stake', amt(c.stake)], ['earned so far', `${amt(ea.earned.toString())} · paid in ${grp(ea.epochs)} epochs`], ['last stake added', Number(c.valence) !== 0 ? await verdict(Number(c.since), id) : 'valence 0 earns nothing'],
    ['owner', ref('neuron', c.owner)], ['author', ref('neuron', c.author)], ['axon', full(c.axon)], ['since', hlink(c.since)], ['unlock at', grp(c.unlock_at)]])}`;
}

/* ------------------------------------------------------------------ particle: focus, the legacy CID, the bytes */
const cidShards = new Map();
async function cidOf(particle) {
  const k = particle.slice(0, 2);
  if (!cidShards.has(k)) {
    cidShards.set(k, fetch(`${CIDS}/${k}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null)).catch(() => null));
  }
  const shard = await cidShards.get(k);
  if (!shard) return { map: false };
  const hit = shard[particle];
  return { map: true, cid: hit ? hit[0] : null, cls: hit ? hit[1] : null };
}
async function preview(cid) {
  const box = $('#preview'); if (!box) return;
  const url = GATEWAY + encodeURIComponent(cid);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-2047' }, signal: ctl.signal });
    if (!r.ok) throw new Error(`the gateway answers HTTP ${r.status}`);
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    const len = r.headers.get('content-range') ? r.headers.get('content-range').split('/')[1] : r.headers.get('content-length');
    const size = len && /^\d+$/.test(len) ? ` · ${grp(len)}${SEP}bytes` : '';
    if (ct.startsWith('image/')) {
      box.innerHTML = `<p class="note">${esc(ct)}${size}</p><img class="pv-img" alt="the bytes of ${esc(cid)}" src="${esc(url)}">`;
      return;
    }
    const buf = new Uint8Array(await r.arrayBuffer()).slice(0, 2048);
    let text = null;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf.slice(0, -3)); } catch { text = null; } }
    if (text !== null && (ct.startsWith('text/') || ct.includes('json') || ct.includes('xml') || !/[\x00-\x08\x0e-\x1f]/.test(text))) {
      box.innerHTML = `<p class="note">${esc(ct || 'text')}${size} · the first ${grp(buf.length)} bytes</p><pre class="pv-text">${esc(text)}</pre>`;
    } else {
      box.innerHTML = `<p class="note">${esc(ct || 'binary')}${size}</p><p><a href="${esc(url)}" target="_blank" rel="noopener">open the bytes →</a></p>`;
    }
  } catch (e) {
    box.innerHTML = `<div class="empty nf">bytes not found · ${esc(e.name === 'AbortError' ? 'no answer from the gateway in 20 s' : e.message === 'Failed to fetch' ? 'the gateway is unreachable' : e.message)}. the particle and its cyberlinks stand; its content is not on the gateways we ask. <a href="${esc(url)}" target="_blank" rel="noopener">try the gateway</a></div>`;
  } finally { clearTimeout(timer); }
}

async function particle(id) {
  const st = await status();
  const [r, c, stk, ser] = await Promise.all([req(`/focus/${id}`), cidOf(id), file('stakes.json'), file(`phi/${id.slice(0, 2)}.json`, 300000)]);
  const f = r.ok ? r.data : null;
  const share = f ? pct(big(f.phi), SCALE) : '—';
  const around = stakeAround(id, (stk && stk.positions) || [], f, ser);
  let content;
  if (!c.map) content = `<div class="empty">the map from particles to legacy CIDs is not published on this explorer yet.</div>`;
  else if (!c.cid) content = `<div class="empty">no legacy CID is known for this particle: it is not in the recovered graph's map.</div>`;
  else {
    content = `${kv([['legacy CID', full(c.cid)], ['availability', c.cls ? `<span class="kind">${esc(c.cls)}</span>` : '—'], ['gateway', `<a href="${esc(GATEWAY + c.cid)}" target="_blank" rel="noopener">${esc(GATEWAY)}${short(c.cid)}</a>`]])}
    <div id="preview" class="preview"><p class="muted">asking the gateway for the bytes…</p></div>`;
    setTimeout(() => preview(c.cid), 0);
  }
  return `<p class="kick">particle</p><h1>particle <em>${short(id)}</em></h1><p class="sub">${full(id)}</p>
  <h2>focus φ*</h2>${f ? `<div class="tiles">${tile('share of focus', share, `epoch ${grp(f.epoch)} · the last settled with φ*`, 'hero')}${tile('rank', `${grp(f.rank)}<span class="u">of ${grp(f.particles)}</span>`, '1 = the most attended')}${tile('φ* raw', grp(f.phi), `fixed point, scale 2^${esc(f.scale_bits)}`)}</div>`
    : `<div class="empty">no focus for this particle at the last settled epoch (${grp(st['last-settled'])}). a particle gets focus once a settlement sees it in the graph.</div>`}
  <h2>content</h2>${content}
  <h2>stake around this particle</h2>${around}
  <p class="note">the node serves focus per particle; the unstaked cyberlinks into and out of a particle are not indexed by this API yet. <a href="#/neuron/${id}">read it as a neuron</a> · <a href="#/focus">top particles</a></p>`;
}

// positions on the particle's in-axons (· → this) and out-axons (this → ·), what they earned, and how its focus moved
function stakeAround(id, positions, f, ser) {
  const mine = positions.filter((p) => p.p === id || p.q === id);
  const sum = (xs) => xs.reduce((s, p) => s + big(p.stake), 0n);
  const open = mine.filter((p) => p.open);
  const inFor = open.filter((p) => p.q === id && Number(p.valence) !== -1); const inAg = open.filter((p) => p.q === id && Number(p.valence) === -1);
  const outFor = open.filter((p) => p.p === id && Number(p.valence) !== -1); const outAg = open.filter((p) => p.p === id && Number(p.valence) === -1);
  const earned = mine.reduce((s, p) => s + big(p.earned), 0n);
  const series = ser && ser.p && ser.p[id]; const eps = (ser && ser.epochs) || [];
  let delta = '<span class="mute">—</span>'; let dnote = 'the explorer records φ* from epoch to epoch; two recorded epochs give a change';
  if (series && eps.length > 1) {
    const cur = series[series.length - 1]; const prev = series[series.length - 2];
    delta = dshare(cur, prev); dnote = `epoch ${grp(eps[eps.length - 2])} → ${grp(eps[eps.length - 1])}${prev === null ? ': not in the record of the epoch before' : ''}`;
  }
  const pl = (n, w) => `${grp(n)} open ${w}${n === 1 ? '' : 's'}`;
  const tiles = `<div class="tiles">${tile('Δ focus', delta, `${dnote}${f ? ` · rank ${grp(f.rank)} of ${grp(f.particles)} by φ*` : ''}`)}
    ${tile('in-axons: for', amtc(sum(inFor).toString()), `${pl(inFor.length, 'position')} into this particle, valence +1 or 0`, 'stake')}${tile('in-axons: against', amtc(sum(inAg).toString()), `${pl(inAg.length, 'position')} into it, valence −1`, 'stake')}
    ${tile('out-axons', amtc(sum(outFor).toString()), `for, out of this particle · against ${grp(sum(outAg).toString())} · ${pl(outFor.length + outAg.length, 'position')}`, 'stake')}${tile('earned', amtc(earned.toString()), `by the ${grp(mine.length)} position${mine.length === 1 ? '' : 's'} around it, open or closed`)}</div>`;
  const head = ['side', 'neuron', 'p → q', 'valence', '>staked', '>earned', 'state~'];
  const rows = mine.map((p) => tds([p.q === id ? 'in' : 'out', ref('neuron', p.neuron), `${p.p === id ? '<span class="me">this</span>' : ref('particle', p.p)} → ${p.q === id ? '<span class="me">this</span>' : ref('particle', p.q)}`,
    val(p.valence), amtc(p.stake), amtc(p.earned), p.open ? (p.card ? ref('card', p.card) : 'open') : '<span class="mute">closed</span>'], head));
  return `${tiles}${mine.length ? `<h2>&nbsp;</h2>${table(head, rows)}` : '<p class="note">no staking position on an axon into or out of this particle yet. a stake on one of its in-axons pushes focus toward it; it earns when the push raises syntropy (chain-economy §5).</p>'}
  <p class="note">positions from the explorer's index of staking signals (stake now, earned = Σ payouts of each card); Δ focus in percentage points (pp) of all focus.</p>`;
}

/* ------------------------------------------------------------------ epochs, focus */
async function epochs() {
  const st = await status();
  const last = Number(st['last-settled'] || 0);
  const r = last ? await api(`/epochs?after=${Math.max(0, last - 500)}&limit=500`) : null;
  const list = ((r && r.epochs) || []).slice().reverse();
  viewLive = (fresh) => (LIVE.st['last-settled'] !== String(last) ? render(true) : null);
  return `<p class="kick">epochs · ${esc(st.chain)}</p><h1>epochs, <em>settled</em></h1>
  <p class="sub">now in epoch ${grp(st.epoch)} · next boundary ${grp(st['next-boundary'])} · last settled ${grp(last)}</p>
  <h2>&nbsp;</h2>${table(epochHead(), list.map(epochRow), 'no epoch settled yet: the first settles at height 360')}${isT() ? '<p class="note">players = the links whose stake changed in the epoch, the game its window sampled; samples = Σ k over the players, the marginals the window\'s tickets drew.</p>' : ''}`;
}

async function epoch(n) {
  const st = await status();
  n = Number(n);
  const r = await req(`/epoch/${n}`);
  const crumbs = `<div class="crumbs">${n > 1 ? `<a href="#/epoch/${n - 1}">← ${grp(n - 1)}</a>` : ''}<a href="#/epoch/${n + 1}">${grp(n + 1)} →</a><a href="#/epochs">all epochs</a></div>`;
  if (!r.ok) {
    const eco = await economy();
    const L = Number(eco.epoch_length || 240); const D = Number(eco.settle_delay || 120);
    const tip = Number(st.height); const settle = n * L + D;
    if (settle > tip) viewLive = () => (Number(LIVE.st.height) >= settle ? render(true) : null);
    return `<p class="kick">epoch</p><h1>epoch <em>${grp(n)}</em></h1>${crumbs}<h2>&nbsp;</h2><div class="empty">not settled ${settle > tip ? `yet: its boundary is height ${grp(n * L)}, it settles at ${grp(settle)}, ${grp(settle - tip)} blocks from the tip. this page fills in when it does.` : 'on this node'}</div>`;
  }
  const e = r.data;
  const tail = isT() ? recordTail(e) : null;
  // the lottery: the index's lottery/<E>.json first (static, kept for every epoch), then the node, which holds its last settlements only
  let lot = isT() ? await file(`lottery/${n}.json`, 300000) : null;
  if (isT() && !lot) lot = await api(`/epoch/${n}/lottery`).catch(() => null);
  const tk = isT() && !lot ? await file('tickets.json') : null;
  const pHead = ['card', 'owner', '>amount'];
  const pRows = (e.payouts || []).map((p) => tds([ref('card', p.card), ref('neuron', p.owner), grp(p.amount)], pHead));
  return `<p class="kick">epoch</p><h1>epoch <em>${grp(e.epoch)}</em></h1><p class="sub">digest ${full(e.digest)}</p>${crumbs}
  <h2>settlement</h2><div class="tiles">${tile('budget', amtc(e.budget), 'a quarter of the pool at settlement', 'hero')}${tile('paid', amtc(e.paid), `to ${grp((e.payouts || []).length)} positions`)}${tile('rewarded', grp(e.rewarded), 'positions with positive credit')}${tile('Δ syntropy', grp(e.delta_syntropy), 'J(φ*ₑ) − J(φ*ₑ₋₁), recorded')}</div>
  ${lotterySection(n, e, tail, lot, tk)}
  <h2>record</h2>${kv([
    ['boundary', hlink(e.boundary)], ['settled at', hlink(e.settled_at)],
    ['particles', grp(e.particles)], ['axons', grp(e.axons)], ['syntropy', grp(e.syntropy)], ['focus', `${grp(e.focus_bps)}${SEP}bps of the subsidy in epoch ${grp(e.epoch + 1)}`],
    ['pool after', amt(e.pool_after)], ['φ* digest', full(e.phi)], ['beacon', full(e.beacon)], ['boundary root', full(e.boundary_root)], ['payouts root', full(e.payouts_root)],
    tail && ['players', `${grp(tail.players)} · the game of this epoch, recorded`], tail && ['samples', `${grp(tail.samples)} marginals drawn by the window's tickets`],
    tail && ['paid by mean', `${grp(tail.by_mean)} of ${grp(tail.players)} players had K_MIN samples; the rest were paid their exact gradient`], tail && ['v(N)', `${nats(tail.value)} · the value of the grand coalition, recorded`],
  ])}
  <h2>payouts</h2>${table(pHead, pRows, 'no payouts this epoch: no position took its axon side to a new high with a positive share')}`;
}

// the lottery of an epoch (rewards.md §7 'the payout'): per player k, the sampled mean against the exact gradient, which rule paid
function lotterySection(n, e, tail, lot, tk) {
  if (!isT()) return `<h2>lottery</h2><div class="empty">the lottery arrives with ticket mining at the alpha's redeploy: this page then shows, per player of the epoch's game, how many tickets sampled it, the sampled mean against the exact gradient, and which rule paid.</div>`;
  const ls = tk && (tk.lotteries || []).find((x) => Number(x.epoch) === n);
  const kMin = Number((lot && lot.k_min) || (ls && ls.k_min) || 64);
  const N = lot ? Number(lot.players) : ls ? Number(ls.players) : tail ? tail.players : null;
  const S = lot ? Number(lot.samples) : ls ? Number(ls.samples) : tail ? tail.samples : null;
  const value = lot ? lot.value : ls ? ls.value : tail ? tail.value : null;
  const byMean = lot ? lot.by_mean : ls ? ls.by_mean : tail ? tail.by_mean : null;
  const tiles = `<div class="tiles">${tile('players', grp(N), N === 0 ? 'no stake changed in the epoch: the window probed the gradient' : 'links whose stake changed between the two boundaries', 'hero')}
    ${tile('samples', grp(S), N ? `Σ k over the players · ${(S / N).toFixed(1)} per player on average` : 'marginals drawn by the window\'s tickets')}
    ${tile('paid by the mean', byMean === null ? '—' : grp(byMean), `players with k ≥ K_MIN = ${grp(kMin)} · the other ${N === null || byMean === null ? '—' : grp(N - byMean)} by their exact gradient`)}
    ${tile('v(N)', value === null ? '—' : nats(value), 'the value of the grand coalition: what the epoch created, the cap of every share')}</div>`;
  if (!lot) {
    return `<h2>lottery</h2>${tiles}<div class="empty">${ls ? `the node holds the per-player estimate of its last settlements only and the index kept this epoch's totals, not its table: Σ a⁺ ${nats(ls.a_plus)}, Σ paid ${nats(ls.paid)} to ${grp(ls.paid_players)} player${ls.paid_players === 1 ? '' : 's'}${ls.rescaled ? `, rescaled to v(N), dust ${nats(ls.dust)} to the pool` : ', nothing rescaled: Σ a⁺ or v(N) was not positive, the pool carries forward'}.` : 'the node holds no estimate of this epoch (it keeps its last settlements only) and the index did not catch it.'}</div>`;
  }
  const est = lot.estimates || [];
  const head = ['card', 'side', '>k', '>mean', '>± s.e.', '>exact', 'rule', '>a(c)', '>paid share'];
  const rows = est.map((p) => {
    const byM = Number(p.k) >= kMin;
    return tds([ref('card', p.card), val(p.side), grp(p.k), nats(p.mean), nats(p.stderr), nats(p.exact), `<span class="kind ${byM ? 'mean' : 'exact'}">${byM ? 'mean' : 'exact'}</span>`, nats(p.a), big(p.paid) > 0n ? nats(p.paid) : '<span class="mute">0</span>'], head);
  });
  const aPlus = est.reduce((s, p) => s + (big(p.a) > 0n ? big(p.a) : 0n), 0n); const paid = est.reduce((s, p) => s + big(p.paid), 0n);
  const v = big(lot.value); const rescaled = aPlus > 0n && v > 0n;
  return `<h2>lottery</h2>${tiles}${table(head, rows, 'no player: the epoch\'s game was empty, every ticket of the window probed the gradient of the graph')}
  <p class="note">${est.length ? `a(c) is the mean of the k sampled marginals when k ≥ K_MIN = ${grp(kMin)}, else the exact four-node path gradient computed by the same engine; a⁺ = max(0, a). the shares paid are a⁺ rescaled to v(N) and floored: Σ a⁺ = ${nats(aPlus.toString())}, v(N) = ${nats(lot.value)}, ${rescaled ? `factor ${(Number(v) / Number(aPlus)).toPrecision(4)}, Σ paid ${nats(paid.toString())}, dust ${nats((v - paid).toString())} stays in the pool` : 'so nothing was rescaled or paid: Σ a⁺ or v(N) was not positive and the pool carries forward'}. the standard error is the realized one, published beside the mean, not consensus. ` : ''}samples ${grp(lot.samples)} over the window ${hlink(Number(e.boundary) + 1)}–${ref('block', lot.window_end)}, settled at ${hlink(lot.settled_at)} (<a href="${REWARDS}#7-settlement-mining" target="_blank" rel="noopener">rewards §7</a>).</p>`;
}

/* focus: three indexes — particles (the node, live), axons and neurons (the indexer, once per settled epoch) */
const shr = (raw) => (raw === null || raw === undefined ? '—' : pct(big(raw), SCALE));
// a change of share in percentage points of all focus, signed
const dshare = (cur, prev) => {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return '<span class="mute">—</span>';
  const d = big(cur) - big(prev); if (d === 0n) return '0';
  const x = (Number(d) / 2 ** 60) * 100; const a = Math.abs(x);
  const s = a >= 0.0001 ? a.toFixed(4) : a.toExponential(1);
  return `<span class="${x > 0 ? 'pos' : 'neg'}">${x > 0 ? '+' : '−'}${s}${SEP}pp</span>`;
};
const gw = (cid) => (cid ? `<a class="gw" href="${esc(GATEWAY + cid)}" target="_blank" rel="noopener" title="the content behind it: ${esc(cid)}">↗</a>` : '');
const FOCUS_TABS = [['', 'particles'], ['axons', 'axons'], ['neurons', 'neurons'], ['moved', 'who moved focus'], ['graph', 'graph']];
const focusSeg = (on) => `<div class="seg" role="group" aria-label="index">${FOCUS_TABS.map(([k, l]) => `<a class="${on === k ? 'on' : ''}" href="#/focus${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
const SPEC = 'https://github.com/cyberia-to/cybernode/blob/main/specs/chain-economy.md';
const FX = { chart: null, axons: null, aShown: 50, neurons: null, nSort: 'f', nDir: -1, nShown: 50, bal: new Map() };

async function focus(sub) {
  const st = await status();
  if (sub === 'axons') return focusAxons(st);
  if (sub === 'neurons') return focusNeurons(st);
  if (sub === 'moved') return focusMoved(st);
  if (sub === 'graph') return focusGraph(st);
  const [r, pj, stk] = await Promise.all([req('/focus?top=100'), file('particles.json'), file('stakes.json')]);
  if (!r.ok) return `<p class="kick">focus</p><h1>focus <em>φ*</em></h1>${focusSeg('')}<div class="empty">no settled epoch with φ* on this node yet.</div>`;
  const f = r.data; const top = f.top || [];
  const byP = new Map(((pj && pj.rows) || []).map((x) => [x[0], x]));
  const sameEpoch = pj && Number(pj.epoch) === Number(f.epoch);
  const max = top.length ? big(top[0].phi) : 1n;
  const head = ['rank', 'particle', '>share', '', '>Δ share', '>φ* raw~'];
  const rows = top.map((t, i) => {
    const w = max ? Number((big(t.phi) * 1000n) / max) / 10 : 0; const x = byP.get(t.particle);
    return tds([grp(i + 1), `${ref('particle', t.particle)}${gw(x && x[7])}`, pct(big(t.phi), SCALE), `<i class="bar" style="width:${Math.max(1, w * 1.2).toFixed(1)}px"></i>`, sameEpoch && x ? dshare(x[1], x[2]) : '<span class="mute">—</span>', grp(t.phi)], head);
  });
  const sum = top.reduce((s, t) => s + big(t.phi), 0n);
  viewLive = () => (LIVE.st['last-settled'] !== st['last-settled'] ? render(true) : null);
  const chart = pj ? await chartData(pj, stk) : null;
  FX.chart = chart;
  if (chart) setTimeout(drawFocusStake, 0);
  return `<p class="kick">focus · ${esc(st.chain)}</p><h1>focus <em>φ*</em></h1>
  <p class="sub">epoch ${grp(f.epoch)} · syntropy ${grp(f.syntropy)} · digest ${short(f.digest)}${cp(f.digest || '')}</p>
  ${focusSeg('')}
  <p class="note">φ* is the stationary attention of the graph: where a walk over all cyberlinks, weighted by stake, spends its time. share = φ* ÷ 2^${esc(f.scale_bits)}; the top ${grp(top.length)} hold ${pct(sum, SCALE)}. Δ share is the change from epoch ${pj && pj.prev_epoch ? grp(pj.prev_epoch) : '—'} in percentage points (pp), from the explorer's record of φ* per epoch${pj && pj.prev_epoch ? '' : ', which starts with this epoch'}.</p>
  <h2>focus × stake</h2>${chart ? focusStakeFigure(chart) : '<div class="empty">the chart needs the explorer\'s index (data/particles.json), which is not served here yet.</div>'}
  <h2>top particles</h2>${table(head, rows, 'no focus yet')}`;
}

// the points of the focus × stake chart: the top 200 by φ* and every particle with stake on its in-axons (stake now, from stakes.json)
async function chartData(pj, stk) {
  const inS = new Map(); let total = 0n;
  for (const p of (stk && stk.positions) || []) {
    if (!p.open) continue;
    const s = big(p.stake); total += s;
    const v = inS.get(p.q) || { for: 0n, against: 0n, earned: 0n, n: 0 };
    if (Number(p.valence) === -1) v.against += s; else v.for += s;
    v.earned += big(p.earned); v.n++; inS.set(p.q, v);
  }
  const rows = new Map((pj.rows || []).map((x) => [x[0], x]));
  const missing = [...inS.keys()].filter((q) => !rows.has(q)).slice(0, 20);
  for (const q of missing) {
    const f = await api(`/focus/${q}`).catch(() => null);
    if (f) rows.set(q, [q, String(f.phi), null, f.rank, '0', '0', '0', null]);
  }
  const pts = [];
  for (const [id, x] of rows) {
    const s = inS.get(id);
    if (!(Number(x[3]) <= (pj.chart_top || 200) || s)) continue;
    const share = Number(big(x[1])) / 2 ** 60;
    if (!(share > 0)) continue;
    const stake = s ? s.for + s.against : 0n; const net = s ? s.for - s.against : 0n;
    pts.push({ id, share, stake: Number(stake), stakeRaw: stake, net, s, rank: x[3], cur: x[1], prev: x[2], cid: x[7] });
  }
  return { pts, total: Number(total), totalRaw: total, epoch: pj.epoch };
}

function focusStakeFigure(c) {
  const above = c.pts.filter((p) => c.total > 0 && p.stake / c.total > p.share);
  const floor = c.pts.filter((p) => p.stake === 0);
  const top = above.slice().sort((a, b) => b.stake / c.total / b.share - a.stake / c.total / a.share)[0];
  const reading = c.total > 0
    ? `${grp(above.length)} particle${above.length === 1 ? '' : 's'} above the diagonal: capital runs ahead of attention there${top ? ` (the furthest, ${short(top.id)}, holds ${(100 * top.stake / c.total).toFixed(1)}${SEP}% of the stake on axons and ${(100 * top.share).toFixed(2)}${SEP}% of focus)` : ''}. ${grp(floor.length)} of the ${grp(c.pts.length)} on the floor or below it: attention with no capital yet, where a new stake meets the largest gradient (<a href="${SPEC}#52-attribution-per-position" target="_blank" rel="noopener">chain-economy §5.2</a>).`
    : `no stake on any axon yet: every particle sits on the floor, attention with no capital, where a new stake meets the largest gradient (<a href="${SPEC}#52-attribution-per-position" target="_blank" rel="noopener">chain-economy §5.2</a>).`;
  return `<figure class="chart fxs"><figcaption><span class="ct">every particle in the top 200 or with stake on its in-axons</span><span class="lg"><i class="dot" style="background:${COL.green}"></i>net for<i class="dot" style="background:${COL.red}"></i>net against<i class="dot" style="background:${COL.none}"></i>no stake</span></figcaption>
  <canvas id="fxs" height="360"></canvas><div class="tipbox" id="fxs-tip" hidden></div>
  <p class="note">x = share of focus φ* at epoch ${grp(c.epoch)} (log) · y = stake on the particle's in-axons now, for + against (log; no stake sits on the floor) · the dashed diagonal is stake share = focus share, against the ${amtc(c.totalRaw.toString())} staked on all axons. ${reading} click a dot to open the particle.</p></figure>`;
}

function drawFocusStake(hover) {
  const cv = $('#fxs'); const c = FX.chart; if (!cv || !c) return;
  const dpr = window.devicePixelRatio || 1; const W = cv.clientWidth || 600; const H = W < 520 ? 300 : 360;
  cv.style.height = `${H}px`; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const pts = c.pts; if (!pts.length) return;
  const L = 58; const R = 12; const T = 12; const B = 30; const FLOOR = 22; const pw = W - L - R; const ph = H - T - B;
  const xs = pts.map((p) => Math.log10(p.share));
  let x0 = Math.floor(Math.min(...xs)); let x1 = Math.ceil(Math.max(...xs)); if (x1 === x0) x1++;
  const st = pts.filter((p) => p.stake > 0).map((p) => Math.log10(p.stake));
  const diag = c.total > 0 ? [10 ** x0 * c.total, 10 ** x1 * c.total].map(Math.log10) : [];
  let y0 = Math.floor(Math.min(...st, ...diag, 9)); let y1 = Math.ceil(Math.max(...st, ...diag, 12)); if (y1 === y0) y1++;
  const X = (share) => L + ((Math.log10(share) - x0) / (x1 - x0)) * pw;
  const Y = (stake) => (stake > 0 ? T + (ph - FLOOR) - ((Math.log10(stake) - y0) / (y1 - y0)) * (ph - FLOOR) : T + ph - FLOOR / 2);
  g.font = '10.5px "JetBrains Mono", Menlo, monospace'; g.fillStyle = COL.axis; g.strokeStyle = COL.grid; g.lineWidth = 1;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  const ystep = Math.max(1, Math.ceil((y1 - y0) / 5));
  for (let e = y0; e <= y1; e += ystep) { const y = Y(10 ** e); g.beginPath(); g.moveTo(L, y + 0.5); g.lineTo(L + pw, y + 0.5); g.stroke(); g.fillText(si(10 ** e).replace(/ /g, ''), L - 6, y); }
  g.fillText('0', L - 6, Y(0));
  g.setLineDash([2, 3]); g.beginPath(); g.moveTo(L, T + ph - FLOOR + 0.5); g.lineTo(L + pw, T + ph - FLOOR + 0.5); g.stroke(); g.setLineDash([]);
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let e = x0; e <= x1; e++) { const x = X(10 ** e); g.beginPath(); g.moveTo(x + 0.5, T); g.lineTo(x + 0.5, T + ph); g.stroke(); g.fillText(`${+(100 * 10 ** e).toPrecision(1)}%`, Math.min(Math.max(x, L + 16), L + pw - 16), T + ph + 8); }
  g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
  if (c.total > 0) {
    g.setLineDash([5, 5]); g.strokeStyle = COL.target; g.beginPath(); g.moveTo(X(10 ** x0), Y(10 ** x0 * c.total)); g.lineTo(X(10 ** x1), Y(10 ** x1 * c.total)); g.stroke(); g.setLineDash([]);
    g.fillStyle = COL.axis; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('stake share = focus share', L + 6, T + 14);
  }
  const col = (p) => (p.net > 0n ? COL.green : p.net < 0n ? COL.red : COL.none);
  const order = pts.slice().sort((a, b) => a.stake - b.stake);
  for (const p of order) {
    const x = X(p.share); const y = Y(p.stake); const r = p.stake > 0 ? 6 : 4;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = col(p); g.globalAlpha = p.stake > 0 ? 1 : 0.7; g.fill(); g.globalAlpha = 1;
    g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
  }
  if (hover) { g.beginPath(); g.arc(X(hover.share), Y(hover.stake), 9, 0, 7); g.lineWidth = 2; g.strokeStyle = COL.ink; g.stroke(); }
  g.restore();
  g.fillStyle = COL.axis; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('share of focus →', L + pw, H - 1);
  const pick = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev; const rect = cv.getBoundingClientRect(); const mx = p.clientX - rect.left; const my = p.clientY - rect.top;
    let best = null; let bd = 14 * 14;
    for (const q of pts) { const d = (X(q.share) - mx) ** 2 + (Y(q.stake) - my) ** 2; if (d < bd) { bd = d; best = q; } }
    return { best, mx, my };
  };
  cv.onmousemove = cv.ontouchstart = (ev) => {
    const { best, mx, my } = pick(ev); const tb = $('#fxs-tip');
    if (!best) { tb.hidden = true; if (FX.hover) { FX.hover = null; drawFocusStake(); } return; }
    if (FX.hover !== best) { FX.hover = best; drawFocusStake(best); }
    const s = best.s;
    tb.hidden = false;
    tb.innerHTML = `<b>${short(best.id)}</b> · rank ${grp(best.rank)}<br>focus ${(100 * best.share).toFixed(4)}${SEP}% · Δ ${dshare(best.cur, best.prev)}<br>${s ? `stake on in-axons: for ${amtc(s.for.toString())} · against ${amtc(s.against.toString())}<br>${grp(s.n)} position${s.n === 1 ? '' : 's'}, earned ${amtc(s.earned.toString())}` : 'no stake on its in-axons'}<br>${best.cid ? `content ${short(best.cid)}` : 'no legacy CID known'}`;
    tb.style.left = `${Math.min(Math.max(0, mx + 14), cv.clientWidth - tb.offsetWidth + 8)}px`; tb.style.top = `${Math.max(30, my - 10)}px`;
  };
  cv.onmouseleave = () => { $('#fxs-tip').hidden = true; FX.hover = null; drawFocusStake(); };
  cv.onclick = (ev) => { const { best } = pick(ev); if (best) location.hash = `#/particle/${best.id}`; };
}

const sanityNote = (a) => {
  const s = a.sanity || {}; const S = 2n ** 60n;
  const flow = big(s.flow_total); const out = big(s.phi_with_out);
  const gap = out > flow ? out - flow : flow - out;
  const lines = [];
  lines.push(`Σ flow over all ${grp(s.axons_present)} axons = ${pct(flow, S)} of focus; Σ φ* of the ${grp(s.particles_with_out)} particles with out-axons = ${pct(out, S)}; they differ by ${grp(gap.toString())} raw units of 2^−60 (the floor of each axon's division)${Number(s.particles_with_out_missing_phi) ? `; ${grp(s.particles_with_out_missing_phi)} particles with out-axons have no φ* in the record` : ''}. Σ φ* recorded over ${grp(s.particles_with_phi)} particles = ${pct(big(s.phi_total), S)}.`);
  const nodeA = s.node_axons_epoch ?? s.node_axons_timing; const linked = s.node_axons_stats;
  lines.push(nodeA === s.axons_present
    ? `axons: the explorer counts ${grp(s.axons_present)} present axons at the boundary (A &gt; 0: ${grp(s.axons_genesis)} from genesis, ${grp(s.axons_staked)} staked); the node's epoch record says ${grp(nodeA)} — equal.`
    : `axons: the explorer counts ${grp(s.axons_present)} present axons at the boundary, the node's epoch record says ${grp(nodeA)} — they differ: the explorer replays stake from the blocks it has indexed, so a staking signal it has not seen (or a reorg it has not followed) moves its count.`);
  lines.push(linked === s.axons_linked
    ? `cyberlinked pairs: the explorer knows ${grp(s.axons_linked)} (genesis frames and ${grp(s.chain_cyberlinks)} cyberlink${s.chain_cyberlinks === 1 ? '' : 's'} signed on chain); the node's /stats says ${grp(linked)} — equal.`
    : `cyberlinked pairs: the explorer knows ${grp(s.axons_linked)}, the node's /stats says ${grp(linked)} — /stats counts every pair ever cyberlinked, also those whose weight is 0 and that are absent from φ*.`);
  lines.push(`genesis weights: ${grp(s.genesis_frames)} frames by ${grp(s.genesis_authors)} authors, Σ G = ${amtc(s.genesis_total)}, ${grp(s.genesis_at_floor)} frames at the floor of 1 — recomputed from the genesis export and the same as the node's rule.`);
  return `<p class="note">sanity · ${lines.join('<br>')}</p>`;
};

async function focusAxons(st) {
  const a = await file('axons.json');
  FX.axons = a;
  viewLive = () => (LIVE.st['last-settled'] !== st['last-settled'] ? render(true) : null);
  const kick = `<p class="kick">focus · axons · ${esc(st.chain)}</p><h1>top <em>axons</em></h1>`;
  if (!a) return `${kick}${focusSeg('axons')}<div class="empty">the axon index comes from the explorer's index (data/axons.json), which is not served here yet.</div>`;
  const tot = big(a.sanity && a.sanity.flow_total);
  const first = a.rows[0];
  const shown = a.rows.slice(0, 10).reduce((s, r) => s + big(r[2]), 0n);
  return `${kick}<p class="sub">epoch ${grp(a.epoch)} · boundary ${hlink(a.boundary)} · computed ${ago(a.generated)}</p>
  ${focusSeg('axons')}
  <p class="lede">an axon is the pair p → q that cyberlinks join. its weight is A = max(0, G + S⁺ − S⁻): G the genesis weight (each genesis author's native balance spread evenly over its frames, at least 1 per frame), S⁺ the stake on it with valence +1 or 0, S⁻ the stake with valence −1, at the epoch's boundary (<a href="${SPEC}#41-genesis-weights" target="_blank" rel="noopener">chain-economy §4.1–4.3</a>). axons rank by focus flow = φ*(p) · A(p → q) ÷ Σ A(p → ·), the share of p's focus that diffusion sends along this axon. φ*'s tri-kernel also springs, heats and teleports a ground of ⌊in(p) / 4⌋ (§4.4); flow is the diffusion split of p's focus, not a solve of its own.</p>
  <div class="tiles">${tile('axons present', grp(a.axons), `A &gt; 0 at height ${grp(a.boundary)}`, 'hero')}${tile('Σ flow', pct(tot, SCALE), 'of all focus, carried by axons')}${tile('top 10', pct(shown, SCALE), 'of all focus flows along them')}${first ? tile('the first', pct(big(first[2]), SCALE), `${short(a.particles[first[0]][0])} → ${short(a.particles[first[1]][0])}`) : ''}</div>
  <h2>by focus flow</h2><div id="fx-axons">${axonTable()}</div>
  ${sanityNote(a)}
  <p class="note">raw data: <a href="${DATA}/axons.json">axons.json</a> (top ${grp(a.rows.length)}) · recomputed once per settled epoch.</p>`;
}

const AX_HEAD = ['#', 'p · its focus', '~', 'q · its focus', '>flow', '>of p\'s out~', '>weight A', '>stake now ±~', '>authors~'];
function axonTable() {
  const a = FX.axons; const P = a.particles;
  const pc = (i) => { const [id, phi, cid] = P[i]; return `${ref('particle', id)}${gw(cid)}<small class="sh">${shr(phi)}</small>`; };
  const rows = a.rows.slice(0, FX.aShown).map((r, i) => {
    const out = big(r[10]); const sharePct = out ? `${(Number((big(r[3]) * 1000000n) / out) / 10000).toFixed(2)}${SEP}%` : '—';
    const stake = big(r[7]) || big(r[8]) ? `${big(r[7]) ? `<span class="pos">+</span>${amtc(r[7])}` : ''}${big(r[8]) ? ` <span class="neg">−</span>${amtc(r[8])}` : ''}` : '<span class="mute">—</span>';
    return tds([grp(i + 1), pc(r[0]), '<span class="mute">→</span>', pc(r[1]), pct(big(r[2]), SCALE), sharePct,
      `<span title="G ${grp(r[4])} + S⁺ ${grp(r[5])} − S⁻ ${grp(r[6])} at the boundary">${amtc(r[3])}</span>`, stake, grp(r[9])], AX_HEAD);
  });
  const more = a.rows.length > FX.aShown ? `<div class="pager"><button class="more" data-more="axons">show ${grp(Math.min(100, a.rows.length - FX.aShown))} more of ${grp(a.rows.length)}</button></div>` : '';
  return table(AX_HEAD, rows, 'no axon carries focus yet') + more;
}

const N_COLS = [['f', 'focus authored'], ['links', 'links'], ['gb', 'genesis balance'], ['stake', 'stake now'], ['earned', 'earned'], ['bal', 'balance']];
const nKey = (r, k) => (k === 'f' ? r.f : k === 'links' ? r.links : k === 'gb' ? Number(r.gb) : k === 'stake' ? Number(r.sa) + Number(r.sp) : k === 'earned' ? Number(r.earned) : FX.bal.has(r.n) ? Number(FX.bal.get(r.n)) : -1);

async function focusNeurons(st) {
  const n = await file('neurons.json');
  FX.neurons = n;
  viewLive = () => (LIVE.st['last-settled'] !== st['last-settled'] ? render(true) : null);
  const kick = `<p class="kick">focus · neurons · ${esc(st.chain)}</p><h1>top <em>neurons</em></h1>`;
  if (!n) return `${kick}${focusSeg('neurons')}<div class="empty">the neuron index comes from the explorer's index (data/neurons.json), which is not served here yet.</div>`;
  setTimeout(balances, 0);
  const r0 = n.rows[0];
  const withF = n.rows.filter((r) => r.f > 0).length;
  return `${kick}<p class="sub">epoch ${grp(n.epoch)} · ${grp(n.neurons)} neurons with cyberlinks, stake or earnings · computed ${ago(n.generated)}</p>
  ${focusSeg('neurons')}
  <p class="lede">focus authored = Σ over the axons a neuron cyberlinked or staked of the axon's focus flow × the neuron's part of the axon's weight: its genesis weight on the axon plus its stake for, minus its stake against (so the parts of one axon add up to 1, and stake against counts negative). genesis authors are legacy addresses mapped to neuron ids; both are shown where the genesis export knows the address. balance is read from the node for the rows on screen.</p>
  <div class="tiles">${tile('neurons', grp(n.neurons), `${grp(withF)} author focus`, 'hero')}${r0 ? tile('the first', `${r0.f >= 0.0001 ? (100 * r0.f).toFixed(2) : r0.f}<span class="u">%</span>`, `of all focus, authored by ${short(r0.n)}`) : ''}</div>
  <h2>by focus authored</h2><div id="fx-neurons">${neuronTable()}</div>
  <p class="note">links = genesis frames + cyberlinks signed on chain · genesis balance = native balance in the genesis file, spread over the author's frames as its genesis weight · stake now = active (valence ≠ 0) / passive (valence 0) · earned = Σ payouts it owns in the settled epochs · raw data: <a href="${DATA}/neurons.json">neurons.json</a>.</p>`;
}

function neuronTable() {
  const n = FX.neurons; const k = FX.nSort; const d = FX.nDir;
  const sorted = n.rows.slice().sort((a, b) => d * (nKey(a, k) - nKey(b, k)) || a.rank - b.rank);
  const th = (key, label) => `<button class="srt${key === k ? ' on' : ''}" data-sort="${key}">${label}${key === k ? (d < 0 ? ' ↓' : ' ↑') : ''}</button>`;
  const head = ['#', 'neuron · legacy address', ...N_COLS.map(([key, label], i) => `>${th(key, label)}${i === 2 || i === 4 ? '~' : ''}`)];
  const rows = sorted.slice(0, FX.nShown).map((r) => {
    const fpc = r.f ? `${r.f < 0 ? '−' : ''}${Math.abs(100 * r.f) >= 0.0001 ? Math.abs(100 * r.f).toFixed(4) : Math.abs(100 * r.f).toExponential(1)}${SEP}%` : '0';
    const stake = big(r.sa) || big(r.sp) ? `${amtc(r.sa)}<small class="sh">passive ${amtc(r.sp)}</small>` : '<span class="mute">—</span>';
    return tds([grp(r.rank), `${ref('neuron', r.n)}${r.addr ? `<small class="sh" title="${esc(r.addr)}">${short(r.addr)}</small>` : ''}`, fpc, grp(r.links), amtc(r.gb), stake, big(r.earned) ? amtc(r.earned) : '<span class="mute">0</span>',
      `<span id="bal-${r.n}">${FX.bal.has(r.n) ? amtc(FX.bal.get(r.n)) : '<span class="mute">…</span>'}</span>`], head);
  });
  const more = sorted.length > FX.nShown ? `<div class="pager"><button class="more" data-more="neurons">show ${grp(Math.min(100, sorted.length - FX.nShown))} more of ${grp(sorted.length)}</button></div>` : '';
  return table(head, rows, 'no neuron yet') + more;
}

// the node's balance of the neurons on screen: a few at a time, each once
let balBusy = false;
async function balances() {
  if (balBusy || !FX.neurons) return; balBusy = true;
  try {
    const want = [...document.querySelectorAll('[id^="bal-"]')].map((el) => el.id.slice(4)).filter((id) => !FX.bal.has(id));
    for (let i = 0; i < want.length; i += 3) {
      const got = await Promise.all(want.slice(i, i + 3).map((id) => api(`/balance/${id}`).then((b) => [id, b]).catch(() => [id, null])));
      for (const [id, b] of got) {
        if (!b) continue;
        FX.bal.set(id, String(b.balance));
        const el = document.getElementById(`bal-${id}`); if (el) el.innerHTML = amtc(b.balance);
      }
      await new Promise((r) => setTimeout(r, 400));
      if (!$('#fx-neurons')) break;
    }
  } finally { balBusy = false; }
}

/* ------------------------------------------------------------------ staking */
async function staking() {
  const st = await status(true);
  const last = Number(st['last-settled'] || 0);
  LIVE.eco = null;
  const [eco, stk, ep] = await Promise.all([economy(), file('stakes.json', 5000), last ? api(`/epochs?after=${Math.max(0, last - 24)}&limit=24`) : null]);
  const L = Number(eco.epoch_length || 240); const D = Number(eco.settle_delay || 120); const minLock = Number(eco.min_lock || 20160);
  const tip = Number(st.height);
  const subsidy = big(st.subsidy); const fb = big(st['focus-bps']); const pool = big(st.pool);
  const cut = (subsidy * fb) / 10000n;
  const e = epochOf(tip, L); const settleNext = tip < (e - 1) * L + D && e > 1 ? (e - 1) * L + D : e * L + D;
  const blocksToSettle = settleNext - tip;
  const poolAt = pool + cut * BigInt(blocksToSettle);
  viewLive = () => render(true);

  const positions = (stk && stk.positions) || [];
  const pHead = ['neuron', 'p → q', 'valence', '>staked', 'locked until', '>earned', '>opened~', 'position~'];
  const pRows = positions.map((p) => {
    const left = p.unlock_at ? Number(p.unlock_at) - tip : null;
    const lock = !p.open ? '<span class="mute">closed</span>' : left > 0 ? `${grp(p.unlock_at)} <span class="mute">· ≈ ${dur(left * TARGET)}</span>` : `${grp(p.unlock_at)} <span class="mute">· free</span>`;
    return tds([ref('neuron', p.neuron), `${ref('particle', p.p)} → ${ref('particle', p.q)}`, val(p.valence), grp(p.stake), lock, grp(p.earned), `<a href="#/signal/${p.opened_tx}">${grp(p.opened_at)}</a>`, p.card ? ref('card', p.card) : '—'], pHead);
  });
  // the settlements ahead and what they judge
  const pending = positions.filter((p) => p.open && Number(p.valence) !== 0).map((p) => {
    const E = epochOf(Number(p.since), L); const S = E * L + D;
    return S > tip ? `${ref('card', p.card)} added stake at ${hlink(p.since)}: judged by epoch ${E}'s settlement at ${hlink(S)}, ${grp(S - tip)} blocks from now.` : null;
  }).filter(Boolean);
  const eps = stk && stk.epochs && stk.epochs.length ? stk.epochs : ((ep && ep.epochs) || []).slice().reverse().map((x) => ({ ...x, payouts: (x.payouts || []).length }));
  const eHead = ['epoch', '>settled at', '>focus', '>budget', '>paid', '>rewarded', '>pool after~', '>Δ syntropy~'];
  const eRows = eps.slice(0, 60).map((x) => tds([`<a href="#/epoch/${x.epoch}">${grp(x.epoch)}</a>`, hlink(x.settled_at), `${grp(x.focus_bps)}${SEP}bps`, grp(x.budget), grp(x.paid), grp(x.rewarded), grp(x.pool_after), grp(x.delta_syntropy)], eHead));
  const evHead = ['height', 'signal', 'kind', 'neuron', 'p → q', '>amount'];
  const evRows = ((stk && stk.events) || []).slice(0, 30).map((v) => tds([hlink(v.h), ref('signal', v.txid), kind(v.kind === 'cyberlink' ? 'lock' : v.kind), ref('neuron', v.from), `${ref('particle', v.p)} → ${ref('particle', v.q)}`, v.kind === 'payout' ? `owner ${short(v.payout)}` : grp(v.amount)], evHead));

  return `<p class="kick">staking · ${esc(st.chain)}</p><h1>staked <em>cyberlinks</em></h1>
  <p class="lede">how staking pays: a cyberlink with amount &gt; 0 and valence ≠ 0 locks stake on p → q for at least ${grp(minLock)} blocks; every block sends ${bps(st['focus-bps'])} of its subsidy to the focus pool; at each settlement (boundary + ${D} blocks) a quarter of the pool is divided among the positions that took their axon side to a new high in the epoch, by their share of the syntropy gain, at most 1 % of the stake each added (<a href="https://github.com/cyberia-to/cybernode/blob/main/specs/chain-economy.md#5-settlement" target="_blank" rel="noopener">chain-economy §5–6</a>).</p>
  <h2>now</h2><div class="tiles">
    ${tile('active stake', amtc(st['active-stake']), 'valence ≠ 0: the stake that earns and sets the split', 'hero')}
    ${tile('total stake', amtc(st['total-stake']), `incl. passive (valence 0) · stake keys ${st['stake-keys-match'] === 'true' ? 'match the cards' : esc(st['stake-keys-match'])}`)}
    ${tile('to stakers', bps(st['focus-bps']), `of the subsidy: ${grp(cut.toString())} of ${grp(st.subsidy)} per block; the rest goes to the miner · cap 50 %`)}
    ${tile('pool', amtc(st.pool), `next settlement at ${hlink(settleNext)} in ${grp(blocksToSettle)} blocks; its budget ≈ ${grp((poolAt / 4n).toString())} (a quarter)`)}
    ${tile('positions', grp(stk ? stk.positions_open : '—'), stk ? `open · ${grp(positions.length - stk.positions_open)} closed · earned in all ${grp(stk.earned_total)}` : 'needs the index (data/stakes.json)')}
    ${tile('minimum lock', `${grp(minLock)}<span class="u">blocks</span>`, `≈ ${dur(minLock * TARGET)} · any increase restarts it`)}
  </div>
  ${pending.length ? `<p class="note">${pending.join('<br>')}</p>` : ''}
  <h2>every position</h2>${stk ? table(pHead, pRows, 'no staked cyberlink on this chain yet') : '<div class="empty">the list of positions comes from the explorer\'s index (data/stakes.json), which is not served here yet. a neuron\'s page lists its own positions from the node.</div>'}
  <h2>rewards per epoch</h2>${table(eHead, eRows, 'no epoch settled yet')}
  ${evRows.length ? `<h2>staking signals</h2>${table(evHead, evRows)}` : ''}
  ${stk ? `<p class="note">index at height ${grp(stk.tip)}, written ${ago(stk.generated)}; current stake and lock come from the node's cards, earned is the sum of each card's payouts in the settled epochs.</p>` : ''}`;
}

/* ------------------------------------------------------------------ history: canvas charts, no library */
const CH = { range: 'all', data: null, at: 0 };
const COL = { pink: '#ff2d92', band: 'rgba(255,45,146,.20)', blue: '#00b8ff', green: '#00ff41', red: '#ff1a00', none: '#6a6a6a', grid: 'rgba(255,255,255,.08)', axis: '#8a8a8a', ink: '#f2f2f2', target: 'rgba(255,255,255,.45)' };
const CHARTS = [
  { key: 'hr', lo: 'hr_lo', hi: 'hr_hi', title: 'hashrate', unit: 'H/s', note: 'Σ work ÷ Δt per bin (at least 12 blocks); the band is the range of a 12-block rolling estimate inside the bin', fmt: (v) => si(v, 'H/s') },
  { key: 'd', lo: 'd_lo', hi: 'd_hi', title: 'difficulty', unit: 'hashes', note: 'expected hashes per block, 2^256 ÷ (target + 1); mean and range per bin', fmt: (v) => si(v) },
  { key: 'bt', lo: 'bt_lo', hi: 'bt_hi', title: 'block time', unit: 's', note: 'mean per bin (at least 12 blocks); the band is the fastest and slowest block; the dashed line is the 30 s target', fmt: (v) => `${v === null ? '—' : Number(v).toFixed(1)}${SEP}s`, target: TARGET, linear: true },
  { key: 'tx', title: 'signals', unit: 'per bin', note: 'signals per bin, coinbase excluded', fmt: (v) => grp(v), bars: true, linear: true },
  { key: 'sa', key2: 'st', title: 'stake', unit: '', note: 'active (valence ≠ 0) and total stake at the end of each bin', fmt: (v) => si(v), linear: true, legend: ['active', 'total'] },
  { key: 'fb', title: 'to stakers', unit: 'bps', note: 'focus_bps in force: the share of each block\'s subsidy that goes to the focus pool, θ<sup>½</sup> in basis points, fixed at every boundary (chain-economy §6.1); the rest pays the miner. <a href="#/earnings/emission">emission →</a>', fmt: (v) => (v === null || v === undefined ? '—' : bps(v)), linear: true },
];

async function history() {
  const st = await status();
  const [h, s] = await Promise.all([file('history.json', 10000), file('summary.json', 10000)]);
  CH.data = h; CH.at = Date.now();
  viewLive = async () => { if (Date.now() - CH.at > DATA_EVERY) { const fresh = await file('history.json'); if (fresh && fresh.generated !== (CH.data || {}).generated) { CH.data = fresh; CH.at = Date.now(); drawAll(); } } };
  if (!h) {
    return `<p class="kick">history · ${esc(st.chain)}</p><h1>the whole <em>chain</em></h1><div class="empty">the history comes from the explorer's index (data/history.json), which is not served here yet.</div>`;
  }
  const T = h.work === 'tickets' || isT();
  Object.assign(CHARTS[0], T
    ? { title: 'tickets/s', unit: 'tickets/s', note: 'Σ attempts per block ÷ Δt per bin (at least 12 blocks), the chain\'s sampling rate; the band is the range of a 12-block rolling estimate inside the bin', fmt: (v) => si(v, 'tickets/s') }
    : { title: 'hashrate', unit: 'H/s', note: 'Σ work ÷ Δt per bin (at least 12 blocks); the band is the range of a 12-block rolling estimate inside the bin', fmt: (v) => si(v, 'H/s') });
  Object.assign(CHARTS[1], T
    ? { title: 'attempts per block', unit: 'tickets', note: 'expected tickets per block, 2^256 ÷ (target + 1): the difficulty of settlement mining, floored at 16 (2^252); mean and range per bin' }
    : { title: 'difficulty', unit: 'hashes', note: 'expected hashes per block, 2^256 ÷ (target + 1); mean and range per bin' });
  const tiles = s ? [
    tile('indexed', grp(s.height), `every block from genesis · ${ago(s.generated)}`, 'hero'),
    tile(`${T ? 'tickets/s' : 'hashrate'}<span class="est">100 blocks</span>`, si(s.hashrate_100, T ? 'tickets/s' : 'H/s'), `1,000 blocks: ${si(s.hashrate_1000, T ? 'tickets/s' : 'H/s')}`),
    tile('block time', `${Number(s.block_time_1000).toFixed(1)}<span class="u">s</span>`, `mean of the last 1,000 · last 100: ${Number(s.block_time_100).toFixed(1)}${SEP}s`),
    tile('chainwork', si(Number(s.chainwork)), `${T ? 'attempts' : 'hashes'} behind the tip · ${T ? 'attempts per block' : 'difficulty'} now ${si(Number(s.difficulty))}`),
    tile('signals', grp(s.signals_total ?? s.txs_total), `coinbase excluded · ${grp(s.staking_signals ?? s.staking_txs)} staking`),
    tile('miners', grp((s.miners_1000 || []).length), `distinct in the last 1,000 blocks · top ${s.miners_1000 && s.miners_1000[0] ? `${ref('neuron', s.miners_1000[0].miner)} ${grp(s.miners_1000[0].blocks)}` : '—'}`),
  ].join('') : '';
  setTimeout(drawAll, 0);
  return `<p class="kick">history · ${esc(st.chain)}</p><h1>the whole <em>chain</em></h1>
  <p class="sub">every block from genesis to the tip, read by the explorer's index and drawn per bin (≤ 2,000 points a range)</p>
  ${tiles ? `<div class="tiles">${tiles}</div>` : ''}
  <div class="seg" id="ranges" role="group" aria-label="range">${[['all', 'all'], ['day', '1 day'], ['hour', '1 hour']].map(([k, l]) => `<button data-range="${k}" class="${CH.range === k ? 'on' : ''}">${l}</button>`).join('')}<span class="mute" id="range-note"></span></div>
  <div class="charts">${CHARTS.map((c, i) => `<figure class="chart" data-i="${i}"><figcaption><span class="ct">${c.title}</span><b class="cv" id="cv-${i}">—</b>${c.legend ? `<span class="lg"><i style="background:${COL.pink}"></i>${c.legend[0]}<i style="background:${COL.blue}"></i>${c.legend[1]}</span>` : ''}</figcaption><canvas id="cc-${i}" height="190"></canvas><div class="tipbox" id="ct-${i}" hidden></div><p class="note">${c.note}</p></figure>`).join('')}</div>
  <p class="note">the genesis-to-block-1 gap is left out. the index lags the tip by up to 30 s. raw data: <a href="${DATA}/history.json">history.json</a> · <a href="${DATA}/summary.json">summary.json</a> · <a href="${DATA}/stakes.json">stakes.json</a></p>`;
}

function drawAll() {
  const R = CH.data && CH.data.ranges && CH.data.ranges[CH.range];
  if (!R || !$('#cc-0')) return;
  const n = R.h.length;
  const rn = $('#range-note'); if (rn) rn.textContent = `heights ${R.from.toLocaleString('en')}–${R.to.toLocaleString('en')} · ${n} bins of ${R.per} block${R.per > 1 ? 's' : ''}`;
  CHARTS.forEach((c, i) => drawChart(i, c, R));
}

function niceTicks(lo, hi, count = 4) {
  if (!(hi > lo)) { hi = lo + 1; }
  const step0 = (hi - lo) / count; const mag = 10 ** Math.floor(Math.log10(step0)); const f = step0 / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v);
  return out;
}
const fmtTime = (t, span) => {
  const d = new Date(t * 1000);
  return span > 2 * 86400 ? d.toISOString().slice(5, 10) : d.toISOString().slice(11, 16);
};

function drawChart(i, c, R) {
  const cv = $(`#cc-${i}`); if (!cv) return;
  const dpr = window.devicePixelRatio || 1; const W = cv.clientWidth || 600; const H = 190;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const xs = R.t; const n = xs.length; if (!n) return;
  const ys = R[c.key]; const lo = c.lo ? R[c.lo] : null; const hi = c.hi ? R[c.hi] : null; const y2 = c.key2 ? R[c.key2] : null;
  if (!ys) { g.fillStyle = COL.axis; g.font = '11px "JetBrains Mono", Menlo, monospace'; g.fillText('not in this index yet', 12, 24); return; }
  const vals = []; for (let k = 0; k < n; k++) { for (const a of [ys, hi, lo, y2]) if (a && a[k] !== null && isFinite(a[k])) vals.push(a[k]); }
  if (!vals.length) return;
  let ymin = c.bars ? 0 : Math.min(...vals); let ymax = Math.max(...vals);
  if (c.key === 'bt') { const s = [...(hi || ys)].filter((v) => v !== null).sort((a, b) => a - b); ymax = Math.max(TARGET * 1.5, s[Math.floor(s.length * 0.98)] || ymax); ymin = 0; }
  const log = !c.linear && ymin > 0 && ymax / ymin > 30;
  if (c.linear && !c.bars) ymin = Math.min(0, ymin);
  const tr = (v) => (log ? Math.log10(v) : v);
  let a0 = tr(ymin); let a1 = tr(ymax); if (a1 === a0) { a1 += log ? 0.5 : Math.abs(a1) * 0.1 || 1; a0 -= log ? 0.5 : 0; }
  a1 += (a1 - a0) * 0.06;
  const L = 54; const Rp = 10; const T = 10; const B = 22; const pw = W - L - Rp; const ph = H - T - B;
  const t0 = xs[0]; const t1 = xs[n - 1] > t0 ? xs[n - 1] : t0 + 1;
  const X = (t) => L + ((t - t0) / (t1 - t0)) * pw;
  const Y = (v) => T + ph - ((tr(Math.max(v, log ? ymin : -Infinity)) - a0) / (a1 - a0)) * ph;
  // grid and axes: recessive
  g.font = '10.5px "JetBrains Mono", Menlo, monospace'; g.fillStyle = COL.axis; g.strokeStyle = COL.grid; g.lineWidth = 1;
  let ticks;
  if (log) {
    const ex = []; for (let e = Math.ceil(a0); e <= Math.floor(a1); e++) ex.push(e);
    ticks = (ex.length >= 2 ? ex : niceTicks(a0, a1, 3)).map((e) => 10 ** e);
  } else ticks = niceTicks(a0, a1, 4);
  if (c.key === 'tx') ticks = ticks.filter((v) => Number.isInteger(Math.round(v * 1e9) / 1e9));
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of ticks) { const y = Y(v); if (y < T - 1 || y > T + ph + 1) continue; g.beginPath(); g.moveTo(L, y + 0.5); g.lineTo(L + pw, y + 0.5); g.stroke(); g.fillText(c.key === 'tx' ? grp(Math.round(v)).replace(/ /g, ' ') : si(v).replace(/ /g, ''), L - 6, y); }
  g.textAlign = 'center'; g.textBaseline = 'top';
  const span = t1 - t0;
  for (let k = 0; k <= 4; k++) { const t = t0 + (span * k) / 4; g.fillText(fmtTime(t, span), Math.min(Math.max(X(t), L + 18), L + pw - 18), T + ph + 6); }
  g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
  if (c.target) { g.setLineDash([4, 4]); g.strokeStyle = COL.target; g.beginPath(); g.moveTo(L, Y(c.target) + 0.5); g.lineTo(L + pw, Y(c.target) + 0.5); g.stroke(); g.setLineDash([]); g.fillStyle = COL.axis; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(`target ${c.target} s`, L + 4, Y(c.target) - 2); }
  if (c.bars) {
    const bw = Math.max(1, pw / n - (pw / n > 4 ? 2 : 0));
    g.fillStyle = COL.pink;
    for (let k = 0; k < n; k++) { if (!ys[k]) continue; const x = X(xs[k]) - bw / 2; const y = Y(ys[k]); g.fillRect(x, y, bw, T + ph - y); }
  } else {
    if (lo && hi) {   // the band
      g.fillStyle = COL.band; g.beginPath(); let started = false;
      for (let k = 0; k < n; k++) { if (hi[k] === null) continue; const x = X(xs[k]); const y = Y(hi[k]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); }
      for (let k = n - 1; k >= 0; k--) { if (lo[k] === null) continue; g.lineTo(X(xs[k]), Y(lo[k])); }
      g.closePath(); g.fill();
    }
    const line = (arr, col) => { g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath(); let s = false; for (let k = 0; k < n; k++) { if (arr[k] === null) { s = false; continue; } const x = X(xs[k]); const y = Y(arr[k]); if (!s) { g.moveTo(x, y); s = true; } else g.lineTo(x, y); } g.stroke(); };
    line(ys, COL.pink);
    if (y2) { g.setLineDash([6, 5]); line(y2, COL.blue); g.setLineDash([]); }
  }
  g.restore();
  const lastV = ys[n - 1];
  $(`#cv-${i}`).innerHTML = c.key2 ? `${si(lastV)} <span class="u">/ ${si(y2[n - 1])}</span>` : c.fmt(lastV);
  // hover: crosshair + the bin's numbers
  cv.onmousemove = cv.ontouchstart = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev; const rect = cv.getBoundingClientRect(); const mx = p.clientX - rect.left;
    let k = 0; let best = Infinity; for (let j = 0; j < n; j++) { const dx = Math.abs(X(xs[j]) - mx); if (dx < best) { best = dx; k = j; } }
    drawChart(i, c, R); const g2 = cv.getContext('2d'); g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = X(xs[k]); g2.strokeStyle = 'rgba(255,255,255,.5)'; g2.lineWidth = 1; g2.beginPath(); g2.moveTo(x + 0.5, T); g2.lineTo(x + 0.5, T + ph); g2.stroke();
    if (ys[k] !== null && !c.bars) { g2.fillStyle = COL.pink; g2.strokeStyle = '#000'; g2.lineWidth = 2; g2.beginPath(); g2.arc(x, Y(ys[k]), 4.5, 0, 7); g2.fill(); g2.stroke(); }
    const tb = $(`#ct-${i}`); tb.hidden = false;
    const hFrom = k ? R.h[k - 1] + 1 : R.from;
    tb.innerHTML = `<b>${c.key2 ? `active ${si(ys[k])} · total ${si(y2[k])}` : c.fmt(ys[k])}</b>${lo && hi ? `<br>range ${c.fmt(lo[k])} – ${c.fmt(hi[k])}` : ''}<br>${hFrom === R.h[k] ? `block ${R.h[k].toLocaleString('en')}` : `blocks ${hFrom.toLocaleString('en')}–${R.h[k].toLocaleString('en')}`}<br>${new Date(xs[k] * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    const left = Math.min(Math.max(0, x + 12), W - tb.offsetWidth - 4); tb.style.left = `${left}px`;
  };
  cv.onmouseleave = () => { $(`#ct-${i}`).hidden = true; drawChart(i, c, R); };
}

/* ------------------------------------------------------------------ network: the globe lives in network.js, loaded on first visit */
let netJs = null;
async function network() {
  if (!netJs) {
    netJs = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'network.js?v=1';
      s.onload = ok; s.onerror = () => { netJs = null; no(new Error('network.js did not load')); };
      document.head.append(s);
    });
  }
  await netJs;
  return netView();   // network.js
}

/* ------------------------------------------------------------------ earnings: what the system pays for
   data/earnings.json (per block: the emission ledger, the miners) and data/payouts.json (per settlement: receipts, stakers, yield),
   written by indexer/earnings.py from chain data only. the node publishes per payout {card, owner, amount} and no per-position credit. */
const EA = { mw: 'all', shown: { paid: 20, stakers: 50, pos: 25, ypos: 50, yn: 25, led: 36, links: 20, parts: 20, txs: 40 }, gen: null, charts: [], me: null };
const EARN_TABS = [['', 'summary'], ['miners', 'top miners'], ['stakers', 'top stakers'], ['yield', 'yield'], ['paid', 'paid knowledge'], ['emission', 'emission']];
const earnSeg = (on) => `<div class="seg" role="group" aria-label="earnings">${EARN_TABS.map(([k, l]) => `<a class="${on === k ? 'on' : ''}" href="#/earnings${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
// a fraction as a percentage with enough digits to see it
const fpct = (x) => {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  const a = Math.abs(100 * x); const s = a === 0 ? '0' : a >= 1 ? a.toFixed(2) : a >= 0.0001 ? a.toFixed(4) : a.toExponential(2);
  return `${x < 0 ? '−' : ''}${s}${SEP}%`;
};
const ratio = (n, d) => (d > 0n ? Number((n * 1000000000n) / d) / 1e9 : null);
const nats = (raw) => {
  if (raw === null || raw === undefined) return '—';
  const x = Number(big(raw)) / 2 ** 60; const a = Math.abs(x);
  return `${x < 0 ? '−' : ''}${a === 0 ? '0' : a >= 0.01 ? a.toFixed(4) : a.toExponential(3)}${SEP}nats`;
};
// the price of knowledge: raw units paid per millinat of syntropy gained, paid · 2^60 ÷ (Δsyntropy · 1,000); none when nothing was gained
const perMilli = (paid, dsyn) => (big(dsyn) > 0n && big(paid) > 0n ? ((big(paid) * SCALE) / (big(dsyn) * 1000n)).toString() : null);
// raw units paid per 1 % of all focus that changed place, paid · 2^60 ÷ (tv · 100)
const perPct = (paid, tv) => (big(tv) > 0n && big(paid) > 0n ? ((big(paid) * SCALE) / (big(tv) * 100n)).toString() : null);
const pl = (n, w) => `${grp(n)} ${w}${Number(n) === 1 ? '' : 's'}`;
const elink = (e) => (e ? `<a href="#/epoch/${e}">${grp(e)}</a>` : '—');
const moreBtn = (key, have, total) => (total > have ? `<div class="pager"><button class="more" data-emore="${key}">show ${grp(Math.min(100, total - have))} more of ${grp(total)}</button></div>` : '');

function earnTile() {
  const e = LIVE.summary && LIVE.summary.earnings; if (!e) return '';
  return tile('paid to stakers', amtc(e.to_stakers), `for knowledge, all time · to miners ${grp(e.to_miners)} for ${isT() ? 'tickets won' : 'header work'} · ${grp(e.pool)} held in the pool · <a href="#/earnings">earnings →</a>`, 'wide stake');
}

async function earn(sub) {
  const st = await status();
  const [E, P] = await Promise.all([file('earnings.json'), file('payouts.json')]);
  const head = `<p class="kick">earnings · ${esc(st.chain)}</p><h1>what the system <em>pays for</em></h1>`;
  if (!E) return `${head}${earnSeg(sub)}<div class="empty">the earnings come from the explorer's index (data/earnings.json), which is not served here yet.</div>`;
  const watch = ['stakers', 'yield', 'paid'].includes(sub) ? 'payouts.json' : 'earnings.json';
  EA.gen = (watch === 'payouts.json' ? P : E) || {};
  viewLive = async () => { const f = await file(watch); if (f && f.generated !== EA.gen.generated) render(true); };
  EA.charts = [];
  const body = sub === 'miners' ? earnMiners(E) : sub === 'stakers' ? earnStakers(E, P, st) : sub === 'yield' ? earnYield(E, P, st)
    : sub === 'paid' ? await earnPaid(E, P) : sub === 'emission' ? earnEmission(E) : earnSummary(E, P);
  setTimeout(() => { drawEarnCharts(); hydratePv(); }, 0);
  return `${head}<p class="sub">index at height ${grp(E.tip)} · written ${ago(E.generated)} · ${pl(E.totals.epochs_settled, 'epoch')} settled</p>${earnSeg(sub)}${body}`;
}

const lastTheta = (E) => { for (let i = E.ledger.length - 1; i >= 0; i--) if (E.ledger[i][13] !== null) return E.ledger[i][13]; return null; };
function earnStrip(E) {
  const T = E.totals; const minted = big(T.minted);
  const paidEpochs = E.ledger.filter((r) => r[7] !== null && big(r[7]) > 0n).length;
  return `<div class="tiles">
    ${tile('to miners', amtc(T.to_miners), `for ${isT() ? 'tickets won, the settlement samples that are the chain\'s work' : 'header work'}: the subsidy minus the pool's cut (${fpct(ratio(big(T.miner_subsidy), minted))} of all minted) plus ${grp(T.fees)} in fees`, 'hero wide')}
    ${tile('to stakers', amtc(T.paid), `for knowledge: paid at ${pl(paidEpochs, 'settlement')} to positions whose stake raised syntropy · ${fpct(ratio(big(T.paid), minted))} of all minted`, 'wide stake')}
    ${tile('in the pool', amtc(T.pool), `the cut in, ${grp(T.to_pool)}, minus what settlements paid out · a quarter of it is the next budget`)}
    ${tile('split now', bps(E.focus_bps_next), `of each block's subsidy goes to the pool: ${grp(E.cut_next)} of ${grp(E.subsidy)} · θ = ${fpct(lastTheta(E))} of supply is active stake`)}
  </div>${splitBar(E)}`;
}
// where every minted unit went: the miners, the stakers, the pool (fees are moved, not minted)
function splitBar(E) {
  const T = E.totals; const m = big(T.miner_subsidy); const p = big(T.paid); const pool = big(T.pool); const all = m + p + pool;
  if (all === 0n) return '';
  const w = (x) => Math.max(x > 0n ? 0.4 : 0, (ratio(x, all) || 0) * 100);
  return `<div class="split" title="minted ${grp(T.minted)}"><i class="sm" style="width:${w(m).toFixed(3)}%"></i><i class="sp" style="width:${w(p).toFixed(3)}%"></i><i class="so" style="width:${w(pool).toFixed(3)}%"></i></div>
  <p class="note split-l"><span><i class="sm"></i>miners ${fpct(ratio(m, all))}</span><span><i class="sp"></i>stakers ${fpct(ratio(p, all))}</span><span><i class="so"></i>pool ${fpct(ratio(pool, all))}</span><span>of the ${amtc(T.minted)} minted in ${grp(E.tip)} blocks</span></p>`;
}

/* miners */
const minerHead = () => (isT()
  ? ['#', 'miner', '>tickets won', '>share of tickets', '', '>sample rate~', '>earned', '>fees~', 'first block~', 'last block']
  : ['#', 'miner', '>blocks', '>share of blocks', '', '>hashrate~', '>earned', '>fees~', 'first block~', 'last block']);
const minerRows = (w, n) => w.rows.slice(0, n).map((r, i) => tds([grp(i + 1), ref('neuron', r.m), grp(r.blocks), fpct(r.share), `<i class="bar" style="width:${Math.max(1, r.share * 110).toFixed(1)}px"></i>`,
  `${si(r.hr, unit())}<span class="est">est</span>`, amtc(r.earned), grp(r.fees), `${hlink(r.first)} <span class="mute">${ago(r.first_t)}</span>`, `${hlink(r.last)} <span class="mute">${ago(r.last_t)}</span>`], minerHead()));
const MW = [['hour', '1 hour'], ['day', '24 hours'], ['all', 'all blocks']];
function earnMiners(E) {
  const w = E.miners[EA.mw] || E.miners.all;
  const top = w.rows[0];
  return `${earnStrip(E)}
  <h2>top miners${isT() ? ' · by tickets won' : ''}</h2><div class="seg" role="group" aria-label="window">${MW.map(([k, l]) => `<button data-mw="${k}" class="${EA.mw === k ? 'on' : ''}">${l}</button>`).join('')}<span class="mute">heights ${grp(w.from)}–${grp(w.to)}</span></div>
  <div class="tiles">${tile(isT() ? 'tickets won' : 'blocks', grp(w.blocks), `${isT() ? 'blocks, one winning ticket each,' : ''} found in the window by ${pl(w.miners, 'miner')}`, 'hero')}${tile('earned', amtc(w.earned), 'by the miners in the window: subsidy minus the cut, plus fees')}
    ${tile(`${isT() ? 'tickets/s' : 'hashrate'}<span class="est">estimate</span>`, si(w.hashrate, unit()), isT() ? 'Σ attempts per block ÷ the window\'s span · attempts per block ≈ 2^256/target' : 'Σ work ÷ the window\'s span')}${top ? tile('the first', fpct(top.share), `of the ${isT() ? 'tickets' : 'blocks'}: ${short(top.m)}`) : ''}</div>
  <h2>&nbsp;</h2>${table(minerHead(), minerRows(w, 100), 'no block in this window')}
  <p class="note">a miner is the key its coinbase pays. earned = Σ over its blocks of SUBSIDY − cut + the block's fees, exactly its coinbase amounts (<a href="${SPEC}#62-coinbase-and-pool" target="_blank" rel="noopener">chain-economy §6.2</a>). ${isT()
    ? `a block is one winning ticket, so tickets won = blocks. share of tickets estimates a miner's share of the sampling: with n tickets the estimate is off by about 1/√n of itself (±${w.rows[0] ? fpct(1 / Math.sqrt(Math.max(1, w.rows[0].blocks))) : '—'} for the first row). sample rate = its share × Σ attempts ÷ the span, in tickets per second; the attempts a block expects are 2^256 ÷ (target + 1), and an attempt is one Shapley sample, W_TICKET + 1 cold solves of the epoch engine (at pussy's size 2.2 s on one M4 Max core, 7.8 s on one Xeon core: cybernode audit/chain/ticket-pow-2026-11.md), so the rate is bounded by cores and memory, not by hashing.`
    : `share of blocks estimates its share of the hashrate: with n blocks the estimate is off by about 1/√n of itself (±${w.rows[0] ? fpct(1 / Math.sqrt(Math.max(1, w.rows[0].blocks))) : '—'} for the first row). hashrate = its share of the window's work × Σ work ÷ the span; the work of a block is 2^256 ÷ (target + 1).`}</p>`;
}

/* stakers and positions */
const STAKER_HEAD = ['#', 'neuron', '>earned', '>positions', '>stake active', '>passive~', '>per epoch', '>a year', '>paid in~', 'last paid~'];
const stakerRows = (rows, P, n) => rows.slice(0, n).map((r, i) => tds([grp(i + 1), `${ref('neuron', r.n)}${r.owners ? `<small class="sh">pays to ${pl(r.owners, 'other owner')}</small>` : ''}`, amtc(r.earned), `${grp(r.open)}<span class="mute"> / ${grp(r.positions)}</span>`,
  amtc(r.sa), amtc(r.sp), fpct(r.y), r.apr === null ? '—' : fpct(r.apr), pl(r.paid, 'epoch'), elink(r.last_paid)], STAKER_HEAD));
const POS_HEAD = ['#', 'position', 'neuron~', 'p → q', 'valence', '>stake', '>earned', '>epochs held', '>per epoch~', '>a year'];
const posRows = (rows, P, n) => rows.slice(0, n).map((r, i) => tds([grp(i + 1), r.card ? ref('card', r.card) : '—', ref('neuron', r.n), `${ref('particle', P.particles[r.p])} → ${ref('particle', P.particles[r.q])}`,
  Number(r.v) === 0 ? '<span class="mute">0 · passive</span>' : val(r.v), r.open ? amtc(r.stake) : '<span class="mute">closed</span>', amtc(r.earned), grp(r.held), fpct(r.y), r.apr === null ? '—' : fpct(r.apr)], POS_HEAD));
function earnStakers(E, P, st) {
  if (!P) return `${earnStrip(E)}<div class="empty">the stakers come from the explorer's index (data/payouts.json), which is not served here yet.</div>`;
  const S = P.stakers; const top = S[0];
  const sa = S.reduce((s, r) => s + big(r.sa), 0n); const sp = S.reduce((s, r) => s + big(r.sp), 0n);
  return `${earnStrip(E)}
  <h2>top stakers</h2><div class="tiles">${tile('earned', amtc(P.earned_total), `by ${pl(S.filter((r) => big(r.earned) > 0n).length, 'neuron')} at ${pl(Object.keys(P.epochs).length, 'settlement')}`, 'hero')}
    ${tile('stakers', grp(S.length), `neurons with a position · ${grp(P.positions_total)} positions`)}${tile('stake active', amtc(sa.toString()), `valence ≠ 0, the stake that can earn · passive ${grp(sp.toString())}`, 'stake')}
    ${top && big(top.earned) > 0n ? tile('the first', amtc(top.earned), `earned by ${short(top.n)}`) : ''}</div>
  <h2>&nbsp;</h2><div id="ea-stakers">${table(STAKER_HEAD, stakerRows(S, P, EA.shown.stakers), 'no staker yet: no cyberlink with amount &gt; 0 on this chain')}${moreBtn('stakers', EA.shown.stakers, S.length)}</div>
  <h2>top positions</h2><div id="ea-pos">${table(POS_HEAD, posRows(P.positions, P, EA.shown.pos), 'no position yet')}${moreBtn('pos', EA.shown.pos, P.positions.length)}</div>
  <p class="note">a staker is the neuron that signed the staked cyberlink (the card's author); payouts go to the card's payout owner, which kind 7 can point elsewhere. earned = Σ of its cards' payouts in every settled epoch. per epoch = earned ÷ Σ over settled boundaries of the stake each card held there; a year = per epoch × ${grp(P.epochs_per_year)} epochs (240 blocks × 30 s), simple. <a href="#/earnings/yield">yield →</a> · <a href="#/staking">every position →</a></p>`;
}

function earnYield(E, P, st) {
  if (!P) return `<div class="empty">the yields come from the explorer's index (data/payouts.json), which is not served here yet.</div>`;
  const byApr = (a, b) => (b.apr ?? -1) - (a.apr ?? -1) || (big(b.earned) > big(a.earned) ? 1 : big(b.earned) < big(a.earned) ? -1 : 0);
  const held = P.positions.filter((r) => r.held > 0).sort(byApr);
  const neu = P.stakers.filter((r) => big(r.se) > 0n).sort(byApr);
  const se = P.positions.reduce((s, r) => s + big(r.se), 0n); const earned = P.positions.reduce((s, r) => s + big(r.earned), 0n);
  const real = se > 0n ? Number((earned * 10n ** 12n) / se) / 1e12 : null;
  const active = big(st['active-stake']); const inflow = big(E.cut_next) * BigInt(E.epoch_length);
  const bench = active > 0n ? Number((inflow * 10n ** 12n) / active) / 1e12 : null;
  const YN_HEAD = ['#', 'neuron', '>stake active', '>Σ stake held', '>earned', '>per epoch', '>a year'];
  const yn = neu.slice(0, EA.shown.yn).map((r, i) => tds([grp(i + 1), ref('neuron', r.n), amtc(r.sa), amtc(r.se), amtc(r.earned), fpct(r.y), fpct(r.apr)], YN_HEAD));
  return `<p class="lede">yield = what a position earned ÷ the stake it held, per epoch held: earned ÷ Σ over the settled boundaries of its stake there, then × ${grp(P.epochs_per_year)} epochs a year (240 blocks × 30 s), simple, not compounded. early in a chain these numbers are noisy: a handful of settlements, a few positions, and a position that added stake in a quiet epoch can take its whole cap, 1 % of what it added (<a href="${SPEC}#55-budget-caps-and-rounding" target="_blank" rel="noopener">chain-economy §5.5</a>), which annualizes into a number that will not repeat. read them as the record so far, not a forecast.</p>
  <div class="tiles">${tile('realized', real === null ? '—' : fpct(real * P.epochs_per_year), `a year: Σ earned ÷ Σ stake held by every position, × ${grp(P.epochs_per_year)} · ${fpct(real)} per epoch`, 'hero')}
    ${tile('if the pool paid all', bench === null ? '—' : fpct(bench * P.epochs_per_year), `a year, at today's split: the pool's inflow per epoch (240 × ${grp(E.cut_next)}) ÷ the active stake now (${grp(st['active-stake'])}) · the ceiling the economy pays as θ<sup>½</sup> ÷ θ (§6.1)`)}
    ${tile('positions', grp(held.length), `held stake through at least one settled boundary · of ${grp(P.positions_total)}`)}</div>
  <h2>yield leaderboard · positions</h2><div id="ea-ypos">${table(POS_HEAD, posRows(held, P, EA.shown.ypos), 'no position has held stake through a settled boundary yet')}${moreBtn('ypos', EA.shown.ypos, held.length)}</div>
  <h2>yield leaderboard · neurons</h2><div id="ea-yn">${table(YN_HEAD, yn, 'no neuron has held stake through a settled boundary yet')}${moreBtn('yn', EA.shown.yn, neu.length)}</div>
  <p class="note">passive stake (valence 0) earns nothing by rule and shows 0. Σ stake held counts each settled boundary at which the position had stake, so a position opened in the epoch now running has none yet. the ceiling assumes every epoch's inflow is paid; budgets are a quarter of the pool and only stake that raised syntropy is paid, so the realized number sits below it.</p>`;
}

/* paid knowledge: every payout as a receipt */
const pv = (id) => (id ? `<span class="pv" data-pv="${esc(id)}"></span>` : '');
function receipt(r, P, tvOf) {
  const [e, card, n, owner, pi, qi, v, stake, added, cap, amount] = r;
  const ep = P.epochs[e] || []; const paid = big(ep[0]);
  const capB = big(cap); const capped = capB > 0n && big(amount) >= capB;
  const p = pi === null ? null : P.particles[pi]; const q = qi === null ? null : P.particles[qi];
  const m = tvOf.get(e);
  const price = perMilli(ep[0], ep[3]);
  return `<div class="rcpt"><div class="rc-h"><span class="rc-e"><a href="#/epoch/${e}">epoch ${grp(e)}</a> · settled at ${ep[4] ? hlink(ep[4]) : '—'}</span><b class="rc-amt">${amtc(amount)}</b><span class="rc-sh">${paid ? `${pct(big(amount), paid)} of the epoch's paid` : ''}</span></div>
  <div class="rc-link"><div class="rc-pt"><span>p · from</span>${p ? ref('particle', p) : '—'}${pv(p)}</div><div class="rc-ar">→<small>valence ${valSide(v)}</small></div><div class="rc-pt"><span>q · to</span>${q ? ref('particle', q) : '—'}${pv(q)}</div></div>
  <div class="rc-f"><span>position ${ref('card', card)}</span><span>neuron ${n ? ref('neuron', n) : '—'}</span>${owner && owner !== n ? `<span>paid to ${ref('neuron', owner)}</span>` : ''}
    <span>stake at the boundary ${amtc(stake)}</span><span>added in the epoch ${amtc(added)}</span><span>cap ${amtc(cap)}${capped ? ' <b class="cap">capped</b>' : capB > 0n ? ` · ${pct(big(amount), capB)} of it` : ''}</span>
    <span>Δ syntropy of the epoch ${nats(ep[3])}</span>${price ? `<span>price ${amtc(price)} per millinat</span>` : ''}${m && big(m.tv) > 0n ? `<span>the epoch moved ${pct(big(m.tv), SCALE)} of focus</span>` : ''}</div></div>`;
}
const valSide = (v) => (v === null || v === undefined ? '—' : val(v));

async function earnPaid(E, P) {
  if (!P) return `<div class="empty">the receipts come from the explorer's index (data/payouts.json), which is not served here yet.</div>`;
  const moved = await file('moved.json');
  const tvOf = new Map(((moved && moved.epochs) || []).map((m) => [m.epoch, m]));
  const eps = Object.keys(P.epochs).map(Number).sort((a, b) => b - a);
  const EP_HEAD = ['epoch', '>paid', '>budget', '>rewarded', '>Δ syntropy', '>price per millinat', '>focus moved~', '>price per 1 % moved~'];
  const epRows = eps.map((e) => {
    const [paid, budget, rewarded, dsyn] = P.epochs[e]; const m = tvOf.get(e);
    const pm = perMilli(paid, dsyn); const pp = m ? perPct(paid, m.tv) : null;
    return tds([elink(e), amtc(paid), amtc(budget), grp(rewarded), nats(dsyn), pm ? amtc(pm) : '<span class="mute">—</span>', m ? pct(big(m.tv), SCALE) : '<span class="mute">not recorded</span>', pp ? amtc(pp) : '<span class="mute">—</span>'], EP_HEAD);
  });
  const latest = eps.find((e) => perMilli(P.epochs[e][0], P.epochs[e][3]));
  const LK_HEAD = ['#', 'p → q', '>paid', '>payouts', '>positions', '>stake now ±~'];
  const lkRows = P.links.slice(0, EA.shown.links).map((l, i) => tds([grp(i + 1), `<div class="lk2"><span>${ref('particle', P.particles[l[0]])}${pv(P.particles[l[0]])}</span><span class="mute">→</span><span>${ref('particle', P.particles[l[1]])}${pv(P.particles[l[1]])}</span></div>`,
    amtc(l[2]), grp(l[3]), grp(l[4]), `${big(l[6]) ? `<span class="pos">+</span>${amtc(l[6])}` : ''}${big(l[7]) ? ` <span class="neg">−</span>${amtc(l[7])}` : ''}${!big(l[6]) && !big(l[7]) ? '<span class="mute">—</span>' : ''}`], LK_HEAD));
  const PP_HEAD = ['#', 'particle', '>paid', '>positions', '>axons into it'];
  const ppRows = P.paid_particles.slice(0, EA.shown.parts).map((x, i) => tds([grp(i + 1), `${ref('particle', P.particles[x[0]])}${pv(P.particles[x[0]])}`, amtc(x[1]), grp(x[3]), grp(x[4])], PP_HEAD));
  return `<p class="lede">the heart of it: every payout the chain made, as a receipt. a position is paid at the settlement of the epoch in which it added stake, by its share of the gradient of syntropy along its axon times the stake it added on its side (<a href="${SPEC}#52-attribution-per-position" target="_blank" rel="noopener">chain-economy §5.2–5.5</a>): the network pays for links that make its attention more ordered. the node publishes per payout the card, the owner and the amount; it does not publish the credit x(c) or the attribution a(c) of a position, so the receipts show no credit. stake at the boundary, the stake added and the 1 % cap are replayed from the staking signals.</p>
  <div class="tiles">${tile('paid for knowledge', amtc(P.earned_total), `in ${pl(P.receipts_total, 'payout')} at ${pl(eps.length, 'settlement')}`, 'hero')}
    ${tile('price of knowledge', latest ? amtc(perMilli(P.epochs[latest][0], P.epochs[latest][3])) : '—', latest ? `per millinat of syntropy gained, epoch ${grp(latest)}: paid ÷ Δ syntropy` : 'no epoch has paid for a syntropy gain yet')}
    ${tile('links paid', grp(P.links.length), 'distinct axons p → q with a paid position')}${tile('particles', grp(P.paid_particles.length), 'paid to make attended: positions on axons into them')}</div>
  <h2>the price per epoch</h2>${table(EP_HEAD, epRows, 'no settlement has paid yet')}
  <p class="note">Δ syntropy is J(φ*ₑ) − J(φ*ₑ₋₁) from the epoch record, in nats (raw at 2^60). price per millinat = paid × 2^60 ÷ (Δ syntropy × 1,000), raw units of ${esc(DENOM)} per 10^−3 nat. focus moved = ½ Σ |Δφ*| over every particle, from the explorer's record of φ* per epoch (since epoch 14), so price per 1 % moved = paid ÷ (focus moved in %). the budget does not depend on Δ syntropy (§5.2): a quiet epoch carries its accrual.</p>
  <h2>paid knowledge · receipts</h2><div id="ea-paid">${P.receipts.slice(0, EA.shown.paid).map((r) => receipt(r, P, tvOf)).join('') || '<div class="empty">no payout yet: the first comes at the settlement of an epoch in which a position added stake with valence ≠ 0 on an axon whose gradient is positive.</div>'}${moreBtn('paid', EA.shown.paid, P.receipts.length)}</div>
  <h2>the links the network paid most for</h2><div id="ea-links">${table(LK_HEAD, lkRows, 'none yet')}${moreBtn('links', EA.shown.links, P.links.length)}</div>
  <h2>the particles the network paid to make attended</h2><div id="ea-parts">${table(PP_HEAD, ppRows, 'none yet')}${moreBtn('parts', EA.shown.parts, P.paid_particles.length)}</div>
  <p class="note">previews: each particle's legacy CID from the explorer's map, its first bytes from ${esc(GATEWAY.replace(/^https:\/\//, '').replace(/\/ipfs\/$/, ''))}. raw data: <a href="${DATA}/payouts.json">payouts.json</a>.</p>`;
}

/* emission */
function earnEmission(E) {
  const led = E.ledger; const x = led.map((r) => r[0]);
  EA.charts = [
    { id: 'ec-0', x, title: 'the focus pool', series: [{ v: led.map((r) => Number(r[5])), col: COL.blue, bar: true, name: 'cut in' }, { v: led.map((r) => (r[7] === null ? null : Number(r[7]))), col: COL.pink, bar: true, name: 'paid out' }, { v: led.map((r) => (r[9] === null ? null : Number(r[9]))), col: COL.ink, name: 'pool after', dash: true }],
      tip: (i) => { const r = led[i]; return `<b>epoch ${grp(r[0])}</b><br>cut in ${amtc(r[5])}<br>budget ${r[6] === null ? 'not settled' : amtc(r[6])} · paid ${r[7] === null ? '—' : amtc(r[7])}<br>pool after ${r[9] === null ? '—' : amtc(r[9])}`; } },
    { id: 'ec-1', x, title: 'the split', series: [{ v: led.map((r) => r[2]), col: COL.pink, name: 'focus_bps in force', step: true }], fmt: (v) => bps(v),
      tip: (i) => { const r = led[i]; return `<b>epoch ${grp(r[0])}</b><br>${bps(r[2])} of each block's subsidy to the pool<br>${grp(Math.floor(Number(E.subsidy) * r[2] / 10000))} of ${grp(E.subsidy)} per block`; } },
    { id: 'ec-2', x, title: 'θ = active stake ÷ supply', series: [{ v: led.map((r) => r[13]), col: COL.blue, name: 'θ at the boundary', step: true }], fmt: (v) => fpct(v),
      tip: (i) => { const r = led[i]; return `<b>boundary of epoch ${grp(r[0])}</b><br>θ = ${fpct(r[13])}<br>active stake ${r[12] === null ? '—' : amtc(r[12])}<br>sets ${r[11] === null ? '—' : bps(r[11])} for epoch ${grp(r[0] + 1)}`; } },
  ];
  const LED_HEAD = ['epoch', '>blocks~', '>split', '>to miners', '>fees~', '>to pool', '>budget', '>paid', '>pool after~', '>θ~', '>Δ syntropy~'];
  const rows = led.slice().reverse().slice(0, EA.shown.led).map((r) => tds([r[6] === null ? `${grp(r[0])} <span class="mute">${r[1] < E.epoch_length ? 'running' : 'unsettled'}</span>` : elink(r[0]), grp(r[1]), bps(r[2]), amtc(r[3]), grp(r[4]), amtc(r[5]),
    r[6] === null ? '<span class="mute">—</span>' : amtc(r[6]), r[7] === null ? '<span class="mute">—</span>' : amtc(r[7]), r[9] === null ? '—' : amtc(r[9]), r[13] === null ? '—' : fpct(r[13]), r[10] === null ? '—' : nats(r[10])], LED_HEAD));
  const s = E.sanity || {};
  const checks = [`focus_bps of ${grp(s.focus_bps_checked)} settled epochs recomputed from the replayed active stake: ${s.focus_bps_mismatch && s.focus_bps_mismatch.length ? `differs in ${s.focus_bps_mismatch.join(', ')}` : 'equal to the records'}`,
    `pool after of ${grp(s.pool_after_checked)} settlements = Σ cut − Σ paid: ${s.pool_after_mismatch && s.pool_after_mismatch.length ? `differs in ${s.pool_after_mismatch.join(', ')}` : 'equal'}`,
    s.pool_now_matches === null || s.pool_now_matches === undefined ? 'pool now: the node had moved on when it was read' : `pool now ${grp(s.pool_now_calc)} = the node's ${grp(s.pool_now_node)}: ${s.pool_now_matches ? 'equal' : 'differs'}`];
  return `${earnStrip(E)}
  <p class="lede">every block mints ${grp(E.subsidy)} (1 % of genesis supply a year). the miner's coinbase takes it minus the pool's cut, plus the block's fees: that pays for ${isT() ? 'the winning ticket, the settlement sample that is the proof of work ordering the chain' : 'header work, the proof of work that orders the chain'}. the cut, floor(SUBSIDY × focus_bps ÷ 10,000), goes to the focus pool; focus_bps = min(${grp(E.focus_max_bps)}, √θ in basis points) with θ = active stake ÷ supply at the boundary, so the pool grows with the capital that takes risk on the graph and never takes more than half (<a href="${SPEC}#61-the-split" target="_blank" rel="noopener">chain-economy §6.1–6.2</a>). each settlement releases a quarter of the pool as the epoch's budget and pays it to positions whose stake raised syntropy (§5.5).</p>
  <div class="charts">${EA.charts.map((c) => `<figure class="chart"><figcaption><span class="ct">${c.title}</span><span class="lg">${c.series.map((x) => `<i style="background:${x.col}"></i>${x.name}`).join('')}</span></figcaption><canvas id="${c.id}" height="200"></canvas><div class="tipbox" id="${c.id}-tip" hidden></div></figure>`).join('')}</div>
  <h2>the ledger per epoch</h2><div id="ea-led">${table(LED_HEAD, rows, 'no block yet')}${moreBtn('led', EA.shown.led, led.length)}</div>
  <p class="note">sanity · ${checks.join(' · ')}. the split of a passed boundary whose epoch has not settled is computed the same way and checked once it settles. raw data: <a href="${DATA}/earnings.json">earnings.json</a>.</p>`;
}

function earnSummary(E, P) {
  const w = E.miners.all;
  const S = P ? P.stakers : [];
  const SH = ['#', 'neuron', '>earned', '>a year~'];
  const sRows = S.slice(0, 8).map((r, i) => tds([grp(i + 1), ref('neuron', r.n), amtc(r.earned), r.apr === null ? '—' : fpct(r.apr)], SH));
  const MH = isT() ? ['#', 'miner', '>tickets won', '>share', '>sample rate~', '>earned'] : ['#', 'miner', '>blocks', '>share', '>earned'];
  const mRows = w.rows.slice(0, 8).map((r, i) => tds([grp(i + 1), ref('neuron', r.m), grp(r.blocks), fpct(r.share), ...(isT() ? [`${si(r.hr, unit())}<span class="est">est</span>`] : []), amtc(r.earned)], MH));
  const tvOf = new Map();   // the summary leaves focus moved to the paid-knowledge page
  return `<p class="lede">${isT()
    ? 'two kinds of work are paid, and only these two: tickets, the settlement samples that order blocks, paid to the miner whose sample won each block; and knowledge, stake on a cyberlink that makes the network\'s attention more ordered, paid to positions at each settlement by the lottery\'s estimate of how much their stake raised syntropy. one computation, two faces: the miner\'s sample is a draw of the same game the settlement pays.'
    : 'two kinds of work are paid, and only these two: header work, the proof of work that orders blocks, paid to the miner of every block; and knowledge, stake on a cyberlink that makes the network\'s attention more ordered, paid to positions at each settlement by how much their stake raised syntropy.'} everything below is read from the chain: coinbase amounts, the epoch records and the staking signals.</p>
  ${earnStrip(E)}
  ${miningNote('earnings')}
  <div class="cols"><div><h2>top miners · ${isT() ? 'by tickets won' : 'all blocks'}</h2>${table(MH, mRows, 'no miner yet')}<div class="pager"><a href="#/earnings/miners">last hour, day, all →</a></div></div>
  <div><h2>top stakers</h2>${P ? table(SH, sRows, 'no staker yet') : '<div class="empty">needs data/payouts.json</div>'}<div class="pager"><a href="#/earnings/stakers">stakers and positions →</a><a class="end" href="#/earnings/yield">yield →</a></div></div></div>
  <h2>latest paid knowledge</h2>${P && P.receipts.length ? P.receipts.slice(0, 3).map((r) => receipt(r, P, tvOf)).join('') : '<div class="empty">no payout yet.</div>'}
  <div class="pager"><a href="#/earnings/paid">every receipt, the price of knowledge →</a><a class="end" href="#/focus/moved">who moved focus →</a></div>`;
}

// a small chart over epochs: bars and lines, hover for the epoch's numbers
function drawEarnCharts() { for (const c of EA.charts || []) drawEpochChart(c); }
function drawEpochChart(c, hover = -1) {
  const cv = $(`#${c.id}`); if (!cv) return;
  const dpr = window.devicePixelRatio || 1; const W = cv.clientWidth || 600; const H = 200;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const n = c.x.length; if (!n) return;
  const vals = []; for (const s of c.series) for (const v of s.v) if (v !== null && isFinite(v)) vals.push(v);
  let ymax = Math.max(0, ...vals); if (!(ymax > 0)) ymax = 1;
  const L = 58; const R = 10; const T = 10; const B = 22; const pw = W - L - R; const ph = H - T - B;
  const ticks = niceTicks(0, ymax * 1.06, 4); const top = Math.max(ticks[ticks.length - 1], ymax * 1.06);
  const X = (i) => L + ((i + 0.5) * pw) / n; const Y = (v) => T + ph - (v / top) * ph;
  const fmt = c.fmt || ((v) => si(v));
  g.font = '10.5px "JetBrains Mono", Menlo, monospace'; g.fillStyle = COL.axis; g.strokeStyle = COL.grid; g.lineWidth = 1; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of ticks) { const y = Y(v); g.beginPath(); g.moveTo(L, y + 0.5); g.lineTo(L + pw, y + 0.5); g.stroke(); g.fillText(fmt(v).replace(/ /g, ''), L - 6, y); }
  g.textAlign = 'center'; g.textBaseline = 'top';
  const every = Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += every) g.fillText(String(c.x[i]), X(i), T + ph + 6);
  const bars = c.series.filter((s) => s.bar); const slot = pw / n; const bw = Math.max(1, (slot * 0.8) / Math.max(1, bars.length));
  if (hover >= 0) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(L + hover * slot, T, slot, ph); }
  bars.forEach((s, k) => {
    g.fillStyle = s.col;
    s.v.forEach((v, i) => { if (!v) return; const x = L + i * slot + slot * 0.1 + k * bw; const y = Y(v); g.fillRect(x, y, bw - (bw > 3 ? 1 : 0), T + ph - y); });
  });
  for (const s of c.series.filter((x) => !x.bar)) {
    g.strokeStyle = s.col; g.lineWidth = 2; g.setLineDash(s.dash ? [6, 4] : []); g.beginPath(); let on = false;
    s.v.forEach((v, i) => {
      if (v === null || !isFinite(v)) { on = false; return; }
      const y = Y(v);
      if (s.step) { const x0 = L + i * slot; if (!on) { g.moveTo(x0, y); on = true; } else g.lineTo(x0, y); g.lineTo(x0 + slot, y); } else { if (!on) { g.moveTo(X(i), y); on = true; } else g.lineTo(X(i), y); }
    });
    g.stroke(); g.setLineDash([]);
  }
  cv.onmousemove = cv.ontouchstart = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev; const rect = cv.getBoundingClientRect(); const i = Math.max(0, Math.min(n - 1, Math.floor((p.clientX - rect.left - L) / slot)));
    drawEpochChart(c, i); const tb = $(`#${c.id}-tip`); tb.hidden = false; tb.innerHTML = c.tip(i);
    tb.style.left = `${Math.min(Math.max(0, X(i) + 12), W - tb.offsetWidth - 4)}px`;
  };
  cv.onmouseleave = () => { $(`#${c.id}-tip`).hidden = true; drawEpochChart(c); };
}

/* previews of particles: the legacy CID from the explorer's map, the first bytes from the gateway; three at a time, each once */
const PV = { html: new Map(), q: [], busy: 0, wait: new Set() };
function hydratePv() {
  document.querySelectorAll('[data-pv]:not([data-pvd])').forEach((el) => {
    el.dataset.pvd = '1'; const id = el.dataset.pv;
    if (PV.html.has(id)) { el.innerHTML = PV.html.get(id); return; }
    el.innerHTML = '<span class="mute">…</span>';
    if (!PV.wait.has(id)) { PV.wait.add(id); PV.q.push(id); }
  });
  pumpPv();
}
function pumpPv() {
  while (PV.busy < 3 && PV.q.length) {
    const id = PV.q.shift(); PV.busy++;
    pvOne(id).catch(() => '<span class="mute">—</span>').then((h) => {
      PV.html.set(id, h); PV.wait.delete(id);
      document.querySelectorAll(`[data-pv="${id}"]`).forEach((el) => { el.innerHTML = h; });
    }).finally(() => { PV.busy--; pumpPv(); });
  }
}
async function pvOne(id) {
  const c = await cidOf(id);
  if (!c.map) return '<span class="mute">content map not served</span>';
  if (!c.cid) return '<span class="mute">no legacy CID known</span>';
  const url = GATEWAY + encodeURIComponent(c.cid);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-1023' }, signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.startsWith('image/')) { ctl.abort(); return `<a class="pv-i" href="${esc(url)}" target="_blank" rel="noopener"><img class="pv-thumb" alt="" loading="lazy" src="${esc(url)}"></a>`; }
    const buf = new Uint8Array(await r.arrayBuffer()).slice(0, 1024);
    let text = null; try { text = new TextDecoder('utf-8', { fatal: false }).decode(buf); } catch { text = null; }
    if (text !== null && !/[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 200))) {
      const line = text.replace(/\s+/g, ' ').trim();
      return `<span class="pv-t" title="${esc(line.slice(0, 400))}">${esc(line.slice(0, 120))}${line.length > 120 ? '…' : ''}</span>${gw(c.cid)}`;
    }
    return `<span class="mute">${esc(ct || 'binary')}</span>${gw(c.cid)}`;
  } catch (e) {
    return `<span class="mute">${e.name === 'AbortError' ? 'the gateway is slow' : 'bytes not on the gateway'}</span>${gw(c.cid)}`;
  } finally { clearTimeout(timer); }
}

function earnClick(e) {
  const mw = e.target.closest('[data-mw]');
  if (mw) { EA.mw = mw.dataset.mw; render(true); return true; }
  const me = e.target.closest('[data-me]');
  if (me) { EA.me = Number(me.dataset.me); render(true); return true; }
  const mo = e.target.closest('[data-emore]');
  if (mo) { EA.shown[mo.dataset.emore] += 100; render(true); return true; }
  return false;
}

/* who moved focus: per recorded epoch, the particles whose φ* moved most, what the epoch's signals did around them, who got paid */
async function focusMoved(st) {
  const m = await file('moved.json');
  viewLive = () => (LIVE.st['last-settled'] !== st['last-settled'] ? render(true) : null);
  const kick = `<p class="kick">focus · who moved it · ${esc(st.chain)}</p><h1>who moved <em>focus</em></h1>`;
  const lede = `<p class="lede">collective learning in action: φ* of an epoch is the solve over the graph at its boundary, so what moved attention between two boundaries is the stake that neurons locked and unlocked in between (a cyberlink without stake carries no weight unless genesis frames carry its axon, <a href="${SPEC}#42-axon-weight-and-valence" target="_blank" rel="noopener">chain-economy §4.2</a>). the settlement of that epoch then pays the positions whose added stake raised syntropy. one view: attention moved → who moved it → who got paid.</p>`;
  if (!m || !(m.epochs || []).length) return `${kick}${focusSeg('moved')}${lede}<div class="empty">the explorer records φ* of every settled epoch since epoch 14; a change needs two consecutive records. the first comes with the next settlement.</div>`;
  const eps = m.epochs; const x = eps.find((y) => y.epoch === EA.me) || eps[0];
  const P = m.particles; const pid = (i) => (i === null || i === undefined ? null : P[i][0]);
  const touch = new Map();
  for (const t of x.txs) for (const i of [t[4], t[5]]) touch.set(i, (touch.get(i) || 0) + 1);
  const MV_HEAD = ['#', 'particle', '>φ* before', '>φ* after', '>Δ', '>signals~'];
  const mvRows = (rows) => rows.map((r, i) => tds([grp(i + 1), `${ref('particle', pid(r[0]))}${pv(pid(r[0]))}`, shr(r[1]), shr(r[2]), dshare(r[2] ?? '0', r[1] ?? '0'), grp(touch.get(r[0]) || 0)], MV_HEAD));
  const TX_HEAD = ['height', 'signal', 'kind', 'neuron', 'p → q', '>amount', 'valence~'];
  const txRows = x.txs.slice(0, EA.shown.txs).map((t) => tds([hlink(t[0]), ref('signal', t[1]), `${kind(t[2])}${t[8] ? ' <span class="me" title="touches a particle listed above">●</span>' : ''}`, ref('neuron', t[3]),
    `${ref('particle', pid(t[4]))} → ${ref('particle', pid(t[5]))}`, big(t[6]) ? amtc(t[6]) : '<span class="mute">0</span>', t[7] === null ? '—' : val(t[7])], TX_HEAD));
  const PD_HEAD = ['position', 'neuron', 'p → q', '>paid'];
  const pdRows = x.paid.map((r) => tds([ref('card', r[0]), r[1] ? ref('neuron', r[1]) : '—', `${ref('particle', pid(r[3]))} → ${ref('particle', pid(r[4]))}${pv(pid(r[4]))}`, amtc(r[5])], PD_HEAD));
  const tv = big(x.tv);
  const story = `between the boundaries ${hlink(x.from - 1)} and ${hlink(x.to)}, ${pl(x.staking_signals ?? x.stake_txs, 'staking signal')} locked ${amtc(x.locked)} and unlocked ${amtc(x.unlocked)}, and ${pl(x.cyberlinks, 'cyberlink')} ${x.cyberlinks === 1 ? 'was' : 'were'} signed. the solve at ${grp(x.to)} moved ${pct(tv, SCALE)} of all focus across ${pl(x.moved, 'particle')}${x.whole ? '' : ` (compared over the ${grp(x.compared)} particles both records hold)`}. ${x.settled_at ? `the settlement at ${hlink(x.settled_at)} paid ${amtc(x.paid_total || '0')} of a ${amtc(x.budget || '0')} budget to ${pl(x.paid.length, 'position')}.` : ''}`;
  setTimeout(hydratePv, 0);
  return `${kick}<p class="sub">epoch ${grp(x.epoch)} against ${grp(x.prev)} · ${pl(eps.length, 'epoch')} recorded with the epoch before</p>${focusSeg('moved')}${lede}
  <div class="seg" role="group" aria-label="epoch">${eps.slice(0, 24).map((y) => `<button data-me="${y.epoch}" class="${y === x ? 'on' : ''}">${grp(y.epoch)}</button>`).join('')}<span class="mute">epoch</span></div>
  <div class="tiles">${tile('focus moved', pct(tv, SCALE), '½ Σ |Δφ*|: the share of all attention that changed place', 'hero')}${tile('Δ syntropy', nats(x.delta_syntropy), 'J(φ*ₑ) − J(φ*ₑ₋₁), the epoch record')}
    ${tile('staking signals', grp(x.staking_signals ?? x.stake_txs), `locked ${grp(x.locked)} · unlocked ${grp(x.unlocked)} · ${pl(x.cyberlinks, 'cyberlink')}`, 'stake')}${tile('paid', amtc(x.paid_total || '0'), `at settlement to ${pl(x.paid.length, 'position')}`)}</div>
  <p class="note">${story}</p>
  <div class="cols c2"><div><h2>rose</h2>${table(MV_HEAD, mvRows(x.up), 'no particle gained focus')}</div><div><h2>fell</h2>${table(MV_HEAD, mvRows(x.down), 'no particle lost focus')}</div></div>
  <h2>what the epoch did</h2><div id="mv-txs">${table(TX_HEAD, txRows, 'no staking signal and no cyberlink in this epoch: attention moved by nothing on chain, or did not move')}${moreBtn('txs', EA.shown.txs, x.txs.length)}</div>
  ${(x.signals_total ?? x.txs_total) > x.txs.length ? `<p class="note">the file keeps ${grp(x.txs.length)} of the epoch's ${grp(x.signals_total ?? x.txs_total)} signals, those touching the listed particles first.</p>` : ''}
  <h2>who got paid for it</h2>${table(PD_HEAD, pdRows, x.settled_at ? 'the settlement paid nobody: no position added stake on a side whose gradient was positive' : 'not settled yet')}
  <p class="note">Δ in percentage points (pp) of all focus · ● marks a signal on an axon into or out of a listed particle · raw data: <a href="${DATA}/moved.json">moved.json</a>.</p>`;
}

/* the graph: the top particles by φ* and every staked axon, laid out by force, drawn on a canvas */
const GR = { data: null, raf: 0, nodes: null, edges: null, hover: null, resize: null, it: 0 };
async function focusGraph(st) {
  const g = await file('graph.json', 300000);
  viewLive = () => (LIVE.st['last-settled'] !== st['last-settled'] ? render(true) : null);
  const kick = `<p class="kick">focus · the graph · ${esc(st.chain)}</p><h1>the <em>graph</em></h1>`;
  if (!g) return `${kick}${focusSeg('graph')}<div class="empty">the graph comes from the explorer's index (data/graph.json), written once per settled epoch, which is not served here yet.</div>`;
  GR.data = g;
  const held = g.nodes.reduce((s, n) => s + n[1], 0);
  const staked = g.edges.filter((e) => big(e[3]) || big(e[4])).length;
  setTimeout(startGraph, 0);
  return `${kick}<p class="sub">epoch ${grp(g.epoch)} · ${grp(g.nodes.length)} of ${grp(g.particles)} particles · ${grp(g.edges.length)} axons · computed ${ago(g.generated)}</p>${focusSeg('graph')}
  <figure class="chart graph"><figcaption><span class="ct">the most attended particles and the axons among them</span><span class="lg"><i class="dot" style="background:${COL.pink}"></i>net stake for<i class="dot" style="background:${COL.blue}"></i>net stake against<i class="dot" style="background:#9a9a9a"></i>no stake</span></figcaption>
  <canvas id="gr"></canvas><div class="tipbox" id="gr-tip" hidden></div></figure>
  <div class="tiles">${tile('drawn', grp(g.nodes.length), `particles: the top ${grp(Math.min(400, g.nodes.length))} by φ* and the endpoints of staked axons`, 'hero')}${tile('they hold', fpct(held), 'of all focus')}
    ${tile('axons', grp(g.edges.length), 'among them, by focus flow, at most 2,400')}${tile('staked', grp(staked), 'axons with stake now, drawn glowing', 'stake')}</div>
  <p class="note">size = share of focus φ* · a dot's colour is the net stake on its in-axons now (for − against) · a glowing line is an axon with stake now, its width the stake, its colour the side that holds more · faint lines carry focus by genesis weight. the layout is a force simulation run in your browser (repulsion between particles, springs along axons), so it settles anew on each visit. click a particle to open it. raw data: <a href="${DATA}/graph.json">graph.json</a>.</p>`;
}
function startGraph() {
  const d = GR.data; const cv = $('#gr'); if (!cv || !d) return;
  cancelAnimationFrame(GR.raf);
  const N = d.nodes.length; const maxS = Math.max(1e-12, ...d.nodes.map((n) => n[1]));
  GR.nodes = d.nodes.map((n, i) => {
    const r = Math.sqrt((i + 0.5) / N); const a = i * 2.399963;
    const net = big(n[3]) - big(n[4]);
    return { id: n[0], share: n[1], cid: n[2], for: n[3], against: n[4], net, rank: i + 1, x: r * Math.cos(a), y: r * Math.sin(a), dx: 0, dy: 0, r: 1.6 + 8.5 * Math.sqrt(n[1] / maxS) };
  });
  const maxStake = Math.max(1, ...d.edges.map((e) => Number(big(e[3]) + big(e[4]))));
  GR.edges = d.edges.map((e) => { const s = Number(big(e[3]) + big(e[4])); return { a: e[0], b: e[1], flow: e[2], s, w: s ? 1.4 + 3.6 * Math.sqrt(s / maxStake) : 0, net: big(e[3]) - big(e[4]) }; });
  GR.it = 0;
  const ITER = 240; const k = Math.sqrt(1 / N) * 0.9;
  const step = () => {
    const ns = GR.nodes; const t = 0.08 * (1 - GR.it / ITER) + 0.002;
    for (const a of ns) { a.dx = 0; a.dy = 0; }
    for (let i = 0; i < N; i++) {
      const a = ns[i];
      for (let j = i + 1; j < N; j++) {
        const b = ns[j]; let dx = a.x - b.x; let dy = a.y - b.y; let d2 = dx * dx + dy * dy;
        if (d2 < 1e-9) { dx = 1e-4 * (i - j); dy = 1e-4; d2 = 1e-8; }
        const f = (k * k) / d2; a.dx += dx * f; a.dy += dy * f; b.dx -= dx * f; b.dy -= dy * f;
      }
    }
    for (const e of GR.edges) {
      const a = ns[e.a]; const b = ns[e.b]; const dx = a.x - b.x; const dy = a.y - b.y; const dd = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const f = (dd / k) * (e.s ? 1.6 : 1); a.dx -= dx * f; a.dy -= dy * f; b.dx += dx * f; b.dy += dy * f;
    }
    for (const a of ns) {
      a.dx -= a.x * 2.2; a.dy -= a.y * 2.2;                         // gravity: the islands stay on the canvas
      const m = Math.sqrt(a.dx * a.dx + a.dy * a.dy) || 1; const s = Math.min(m, t) / m; a.x += a.dx * s; a.y += a.dy * s;
    }
    GR.it++;
  };
  const frame = () => {
    if (!document.body.contains(cv)) return;
    const per = N > 300 ? 3 : 6;
    for (let i = 0; i < per && GR.it < ITER; i++) step();
    drawGraph();
    if (GR.it < ITER) GR.raf = requestAnimationFrame(frame);
  };
  GR.resize = () => { if (document.body.contains(cv)) drawGraph(); };
  const pick = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev; const rect = cv.getBoundingClientRect(); const mx = p.clientX - rect.left; const my = p.clientY - rect.top;
    let best = null; let bd = Infinity;
    for (const n of GR.nodes) { const d2 = (n.sx - mx) ** 2 + (n.sy - my) ** 2; if (d2 < Math.max(14 * 14, n.r * n.r) && d2 < bd) { bd = d2; best = n; } }
    return { best, mx, my };
  };
  cv.onmousemove = cv.ontouchstart = (ev) => {
    const { best, mx, my } = pick(ev); const tb = $('#gr-tip');
    if (!best) { tb.hidden = true; if (GR.hover) { GR.hover = null; drawGraph(); } return; }
    if (GR.hover !== best) { GR.hover = best; drawGraph(); }
    tb.hidden = false;
    tb.innerHTML = `<b>${short(best.id)}</b> · rank ${grp(best.rank)} here<br>focus ${fpct(best.share)}<br>${big(best.for) || big(best.against) ? `stake on its in-axons: for ${amtc(best.for)} · against ${amtc(best.against)}` : 'no stake on its in-axons'}<br>${best.cid ? `content ${short(best.cid)}` : 'no legacy CID known'}`;
    tb.style.left = `${Math.min(Math.max(0, mx + 14), cv.clientWidth - tb.offsetWidth - 4)}px`; tb.style.top = `${Math.max(36, Math.min(my - 10, cv.clientHeight - 40))}px`;
  };
  cv.onmouseleave = () => { $('#gr-tip').hidden = true; GR.hover = null; drawGraph(); };
  cv.onclick = (ev) => { const { best } = pick(ev); if (best) location.hash = `#/particle/${best.id}`; };
  frame();
}
function drawGraph() {
  const cv = $('#gr'); if (!cv || !GR.nodes) return;
  const dpr = window.devicePixelRatio || 1; const W = cv.clientWidth || 600; const H = Math.round(Math.min(Math.max(W * 0.72, 340), 760));
  cv.style.height = `${H}px`; if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const ns = GR.nodes; let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const n of ns) { if (n.x < x0) x0 = n.x; if (n.x > x1) x1 = n.x; if (n.y < y0) y0 = n.y; if (n.y > y1) y1 = n.y; }
  const pad = 18; const sc = Math.min((W - 2 * pad) / (x1 - x0 || 1), (H - 2 * pad) / (y1 - y0 || 1));
  const ox = (W - (x1 - x0) * sc) / 2; const oy = (H - (y1 - y0) * sc) / 2;
  for (const n of ns) { n.sx = ox + (n.x - x0) * sc; n.sy = oy + (n.y - y0) * sc; }
  // the faint axons first, in one path
  g.lineWidth = 0.6; g.strokeStyle = 'rgba(255,255,255,.10)'; g.beginPath();
  for (const e of GR.edges) { if (e.s) continue; const a = ns[e.a]; const b = ns[e.b]; g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); }
  g.stroke();
  const hv = GR.hover;
  if (hv) {   // the axons of the hovered particle
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath();
    const i = ns.indexOf(hv);
    for (const e of GR.edges) { if (e.a !== i && e.b !== i) continue; const a = ns[e.a]; const b = ns[e.b]; g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); }
    g.stroke();
  }
  // the staked axons glow
  g.save(); g.shadowBlur = 14;
  for (const e of GR.edges) {
    if (!e.s) continue; const a = ns[e.a]; const b = ns[e.b]; const col = e.net < 0n ? COL.blue : COL.pink;
    g.shadowColor = col; g.strokeStyle = col; g.lineWidth = e.w; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.stroke();
  }
  g.restore();
  for (const n of ns) {
    const col = n.net > 0n ? COL.pink : n.net < 0n ? COL.blue : n.r > 5 ? '#e6e6e6' : '#9a9a9a';
    g.globalAlpha = n.net !== 0n ? 1 : n.r > 5 ? 0.9 : 0.7; g.fillStyle = col; g.beginPath(); g.arc(n.sx, n.sy, n.r, 0, 6.2832); g.fill();
  }
  g.globalAlpha = 1;
  if (hv) { g.beginPath(); g.arc(hv.sx, hv.sy, hv.r + 4, 0, 6.2832); g.lineWidth = 2; g.strokeStyle = COL.ink; g.stroke(); }
}

/* ------------------------------------------------------------------ search, routing */
function notFound(what, why) {
  return `<p class="kick">not found</p><h1>${what}</h1><div class="empty">${esc(why || 'this node does not know it')}.</div><p class="note"><a href="#/">back to the overview</a></p>`;
}

async function search(q) {
  q = decodeURIComponent(q).trim().toLowerCase().replace(/^0x/, '').replace(/[\s,_]/g, '');
  if (/^\d+$/.test(q)) { location.replace(`#/block/${Number(q)}`); return null; }
  if (!HEX64.test(q)) return notFound(`“${esc(q.slice(0, 80))}”`, 'search takes a height, or a 64-hex block id, signal id, neuron, particle or card');
  const go = (k) => { location.replace(`#/${k}/${q}`); return null; };
  if ((await req(`${SIGNAL_API}/${q}`)).ok) return go('signal');
  if ((await req(`/block/${q}`)).ok) return go('block');
  const [bal, nonce] = await Promise.all([api(`/balance/${q}`), api(`/nonce/${q}`)]);
  if ((bal && big(bal.balance) > 0n) || (nonce && Number(nonce.confirmed) > 0)) return go('neuron');
  if ((await req(`/focus/${q}`)).ok) return go('particle');
  if ((await req(`/card/${q}`)).ok) return go('card');
  return go('neuron');
}

const ROUTES = [
  [/^$/, overview, 'overview'],
  [/^blocks$/, () => blocks(), 'blocks'],
  [/^blocks\/(\d+)$/, blocks, 'blocks'],
  [/^block\/([0-9a-f]{64}|\d+)$/, block, 'blocks'],
  [/^signal\/([0-9a-f]{64})$/, signalPage, 'blocks'],
  [/^tx\/([0-9a-f]{64})$/, (id) => { location.replace(`#/signal/${id}`); return null; }, 'blocks'],   // old links: #/tx/<id> → #/signal/<id>
  [/^neuron\/([0-9a-f]{64})$/, neuron, ''],
  [/^particle\/([0-9a-f]{64})$/, particle, 'focus'],
  [/^card\/([0-9a-f]{64})$/, card, 'staking'],
  [/^epochs$/, epochs, 'epochs'],
  [/^epoch\/(\d+)$/, epoch, 'epochs'],
  [/^staking$/, staking, 'staking'],
  [/^history$/, history, 'history'],
  [/^focus$/, () => focus(''), 'focus'],
  [/^focus\/(axons|neurons|moved|graph)$/, focus, 'focus'],
  [/^earnings$/, () => earn(''), 'earnings'],
  [/^earnings\/(miners|stakers|yield|paid|emission)$/, earn, 'earnings'],
  [/^network$/, network, 'network'],
  [/^search\/(.+)$/, search, ''],
];
let gen = 0;
async function render(soft) {
  const my = ++gen;
  const path = location.hash.replace(/^#\/?/, '');
  const low = /^search\//.test(path) ? path : path.toLowerCase();
  const hit = ROUTES.find(([re]) => re.test(low));
  const view = $('#view');
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', !!hit && a.dataset.tab === hit[2]));
  if (!hit) { viewLive = null; view.innerHTML = notFound('no such page', 'the explorer knows overview, earnings (miners, stakers, yield, paid knowledge, emission), blocks, block, signal, neuron, particle, card, epochs, epoch, staking, history, focus (particles, axons, neurons, who moved focus, graph) and network'); return; }
  if (!soft) { viewLive = null; view.innerHTML = `<p class="muted pad">reading the node…</p>`; }
  try {
    const html = await hit[1](...(low.match(hit[0]).slice(1)));
    if (my !== gen || html === null) return;
    const y = window.scrollY; view.innerHTML = html; if (soft) window.scrollTo(0, y);
    if (!soft) document.title = `${(view.querySelector('h1') || {}).textContent || 'explorer'} — space-pussy explorer`;
  } catch (e) {
    if (my !== gen) return;
    if (e instanceof Down) down(e.message); else console.error(e);
    if (!soft || !view.querySelector('h1')) {
      viewLive = null; retryOnUp = e instanceof Down;
      view.innerHTML = `<p class="kick">waiting for the node</p><h1>the chain is <em>out of reach</em> for a moment</h1>
      <div class="empty">${e instanceof Down ? 'the node behind this page does not answer. blocks keep coming whether or not this page can see them; the page reconnects by itself.' : esc('the page could not read this answer: ' + e.message)}</div>`;
    }
  }
}

window.addEventListener('hashchange', () => { render(false); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { nextPoll = 0; tick(); } });
window.addEventListener('resize', () => { clearTimeout(CH.rz); CH.rz = setTimeout(() => { drawAll(); drawFocusStake(); drawEarnCharts(); GR.resize && GR.resize(); }, 120); });
setInterval(tick, TICK);

$('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#q').value.trim(); if (!q) return;
  $('#q').blur(); location.hash = `#/search/${encodeURIComponent(q)}`;
});

let toastT = 0;
document.addEventListener('click', async (e) => {
  const r = e.target.closest('[data-range]');
  if (r) { CH.range = r.dataset.range; document.querySelectorAll('#ranges button').forEach((b) => b.classList.toggle('on', b === r)); drawAll(); return; }
  const so = e.target.closest('[data-sort]');
  if (so && FX.neurons) { const k = so.dataset.sort; FX.nDir = FX.nSort === k ? -FX.nDir : -1; FX.nSort = k; $('#fx-neurons').innerHTML = neuronTable(); balances(); return; }
  if (earnClick(e)) return;
  const mo = e.target.closest('[data-more]');
  if (mo) {
    if (mo.dataset.more === 'axons') { FX.aShown += 100; $('#fx-axons').innerHTML = axonTable(); } else { FX.nShown += 100; $('#fx-neurons').innerHTML = neuronTable(); balances(); }
    return;
  }
  const el = e.target.closest('[data-copy]'); if (!el) return;
  e.preventDefault();
  const text = el.dataset.copy;
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  const t = $('#toast'); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1100);
});

render(false);
