/* spacepussy.ai/explorer — a static page over a node's read API (cybernode rs/src/node/chain_routes.rs)
   and the files of its indexer (site/explorer/indexer: data/history.json, stakes.json, summary.json).
   the node answers at /explorer/api/<path> on the same origin; ?api=<base> points the page at another node.
   live: /tip once a second while the tab is visible, /status every few seconds and on every new block.
   no build, no framework: one file, hash routes, big integers kept as strings or BigInt, never floats for amounts. */
'use strict';

const QS = new URLSearchParams(location.search);
const API = (QS.get('api') || '/explorer/api').replace(/\/+$/, '');
const DATA = (QS.get('data') || '/explorer/data').replace(/\/+$/, '');
const CIDS = (QS.get('cids') || '/explorer/cids').replace(/\/+$/, '');
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

const memo = new Map();     // immutable answers: by block id, by tx id once in a block
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
  if (r.ok && (/^\/(block|header)\/[0-9a-f]{64}$/.test(path) || (/^\/tx\//.test(path) && data && data.height !== 'mempool'))) memo.set(path, res);
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
};

async function status(fresh) {
  if (!fresh && LIVE.st && Date.now() - LIVE.stAt < 5000) return LIVE.st;
  const r = await req('/status');
  if (!r.ok || typeof r.data !== 'object') throw new Down(`status HTTP ${r.status}`);
  LIVE.st = r.data; LIVE.stAt = Date.now();
  DENOM = LIVE.st.chain || DENOM; $('#denom-foot').textContent = DENOM || 'its denom';
  netLine();
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

// the chain's hashrate now: the indexer's Σ work ÷ Δt over 100 blocks, else the current difficulty over the recent blocks' span
function hashrate() {
  const s = LIVE.summary;
  if (s && s.hashrate_100 && LIVE.tip && LIVE.tip.height - s.height < 200) return { rate: Number(s.hashrate_100), how: 'Σ work ÷ Δt over 100 blocks (indexer)' };
  const b = LIVE.recent; const st = LIVE.st;
  if (b.length > 2 && st && b[b.length - 1].time > b[0].time) {
    const span = b.length - 1;
    return { rate: (Number(work(st.bits)) * span) / (b[b.length - 1].time - b[0].time), how: `current difficulty × ${span} blocks ÷ their span` };
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
const BLOCK_HEAD = ['height', 'block', 'age', '>txs', '>size~', 'miner~'];
const blockRow = (b, cls) => tds([`<a href="#/block/${b.height}">${grp(b.height)}</a>`, ref('block', b.id), ago(b.time), grp(b.txs), `${grp(b.size)}${SEP}B`, ref('neuron', b.miner)], BLOCK_HEAD, cls);
const EPOCH_HEAD = ['epoch', '>boundary', '>settled at', '>budget', '>paid', '>rewarded~', '>Δ syntropy~'];
const epochRow = (e) => tds([`<a href="#/epoch/${e.epoch}">${grp(e.epoch)}</a>`, hlink(e.boundary), hlink(e.settled_at), grp(e.budget), grp(e.paid), grp(e.rewarded), grp(e.delta_syntropy)], EPOCH_HEAD);

function liveStrip() {
  return `<section class="live" aria-label="the chain now">
    <div class="lv lv-h"><span class="lab">height</span><b id="lv-height">—</b><small>last block <span id="lv-ago">—</span> · <span id="lv-tip"></span></small></div>
    <div class="lv lv-hash"><div class="row"><span class="lab">hashing block <b id="lv-next">—</b></span><span class="lab" id="lv-p">—</span></div>
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
  $('#lv-hash-note').innerHTML = `expected ${si(need)} hashes for this block · ≈ ${si(rate * t)} hashed in ${dur(t)} at ≈ ${si(rate, 'H/s')} · P(a block by now) = 1 − e<sup>−t/T</sup>, T ≈ ${dur(T)}`;
}
async function liveTiles() {
  if (!$('#lv-mem') || !LIVE.st) return;
  const st = LIVE.st; const eco = await economy();
  const L = Number(eco.epoch_length || 240); const D = Number(eco.settle_delay || 120);
  const tipH = LIVE.tip ? LIVE.tip.height : Number(st.height);
  const e = epochOf(tipH, L); const start = (e - 1) * L; const end = e * L;
  const settlePrev = start + D;
  $('#lv-mem').textContent = grp(st.mempool);
  $('#lv-mem-note').textContent = `transactions waiting · ${st.peers} peer${st.peers === '1' ? '' : 's'} · finalized ${Number(st.finalized).toLocaleString('en')}`;
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
    tile('hashrate<span class="est">estimate</span>', si(rate, 'H/s'), how),
    tile('difficulty', si(Number(work(st.bits || '0x1e010000'))), `expected hashes per block · bits ${esc(st.bits)} → next ${esc(st['next-bits'] || '—')}`),
    tile('supply', amtc(st.supply), `raw units · subsidy ${grp(st.subsidy)} per block`, 'wide'),
    tile('active stake', amtc(st['active-stake']), `${positions}total ${grp(st['total-stake'])} · <a href="#/staking">staking →</a>`, 'stake wide'),
    tile('to stakers', bps(st['focus-bps']), `of each block's subsidy: ${grp(cut.toString())} per block into the focus pool`),
    tile('pool', amtc(st.pool), `paid out a quarter per settlement · settlement ${st['settlement-ok'] === 'true' ? 'ok' : esc(st['settlement-ok'] || '—')}`, 'wide'),
    tile('neurons', grp(st.neurons), 'keys with state'),
    tile('particles', grp(particles), 'in the graph of the last settlement'),
    tile('axons', grp(st.axons), 'cyberlinked pairs p → q'),
  ].join('');
}

/* ------------------------------------------------------------------ blocks, block, tx */
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
  const txs = await Promise.all((b.txids || []).slice(0, 200).map((id) => api(`/tx/${id}`).catch(() => null)));
  const head = ['#', 'tx', 'kind', 'what', '>fee~'];
  const rows = (b.txids || []).slice(0, 200).map((id, i) => { const t = txs[i]; return tds([i, ref('tx', id), t ? kind(t.kind) : '—', t ? txLine(t) : '', t && t.tx.fee !== undefined ? grp(t.tx.fee) : '—'], head); });
  return `<p class="kick">block</p><h1>block <em>${grp(b.height)}</em></h1><p class="sub">${full(b.id)}</p>
  <div class="crumbs">${b.height > 0 ? `<a href="#/block/${b.height - 1}">← ${grp(b.height - 1)}</a>` : ''}<a href="#/block/${b.height + 1}">${grp(b.height + 1)} →</a><a href="#/blocks/${b.height}">in the list</a></div>
  <h2>header</h2>${kv([
    ['height', grp(b.height)], ['time', `${grp(b.time)} unix · ${ago(b.time)}`], ['miner', b.miner ? ref('neuron', b.miner) : 'none (genesis)'],
    ['transactions', grp(b.txs)], ['fees', amt(b.fees)], ['size', `${grp(b.size)}${SEP}bytes`],
    ['bits', `${esc(b.bits)} · ${si(Number(work(b.bits)))} expected hashes`], ['nonce', full(b.nonce)],
    ['prev', b.height > 0 ? ref('block', b.prev) : 'none'], ['tx root', full(b.tx_root)], ['state root', full(b.state_root)], ['chain', full(b.chain)], ['version', grp(b.version)],
  ])}
  <h2>transactions</h2>${table(head, rows, 'no transactions in this block')}`;
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

async function tx(id) {
  await status();
  const r = await req(`/tx/${id}`);
  if (!r.ok) return notFound(`transaction ${short(id)}`, 'not in a block on this node, nor in its mempool');
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
  return `<p class="kick">transaction · ${esc(t.kind)}</p><h1>tx <em>${short(id)}</em></h1><p class="sub">${full(id)}</p>${link3}${extra}
  ${earnRows.length ? `<h2>earnings</h2>${kv(earnRows)}` : ''}<h2>fields</h2>${kv(rows)}`;
}
const pAnchor = (p) => (p ? `<a href="#/particle/${esc(p)}">${esc(p)}</a>` : '—');

/* ------------------------------------------------------------------ neuron, card */
async function neuron(id) {
  const st = await status();
  const [bal, nonce, cards, stk] = await Promise.all([api(`/balance/${id}`), api(`/nonce/${id}`), api(`/cards/${id}`), file('stakes.json')]);
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
  <h2>balance</h2><div class="tiles">${tile('balance', amtc(b.balance), `at height ${grp(b.height)}`, 'hero')}${tile('spendable', amtc(b.spendable), locked > 0n ? `${grp(locked.toString())} held but not yet spendable (maturing coinbase)` : 'all of it spendable')}${tile('nonce', grp(nonce ? nonce.confirmed : '—'), `next to sign: ${grp(nonce ? nonce.nonce : '—')}`)}${tile('positions', grp(cs.length), cs.length ? `staked ${grp(cs.reduce((s, c) => s + big(c.stake), 0n).toString())} · earned ${grp(earnedAll.toString())}` : 'staked cyberlinks authored')}</div>
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
  const [r, c, stk] = await Promise.all([req(`/focus/${id}`), cidOf(id), file('stakes.json')]);
  const f = r.ok ? r.data : null;
  const share = f ? pct(big(f.phi), SCALE) : '—';
  const touching = ((stk && stk.positions) || []).filter((p) => p.p === id || p.q === id);
  const sHead = ['neuron', 'p → q', 'valence', '>staked', '>earned'];
  const sRows = touching.map((p) => tds([ref('neuron', p.neuron), `${p.p === id ? '<span class="me">this</span>' : ref('particle', p.p)} → ${p.q === id ? '<span class="me">this</span>' : ref('particle', p.q)}`, val(p.valence), grp(p.stake), grp(p.earned)], sHead));
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
  ${touching.length ? `<h2>staked cyberlinks</h2>${table(sHead, sRows)}` : ''}
  <p class="note">the node serves focus per particle; the unstaked cyberlinks into and out of a particle are not indexed by this API yet. <a href="#/neuron/${id}">read it as a neuron</a> · <a href="#/focus">top particles</a></p>`;
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
  <h2>&nbsp;</h2>${table(EPOCH_HEAD, list.map(epochRow), 'no epoch settled yet: the first settles at height 360')}`;
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
  const pHead = ['card', 'owner', '>amount'];
  const pRows = (e.payouts || []).map((p) => tds([ref('card', p.card), ref('neuron', p.owner), grp(p.amount)], pHead));
  return `<p class="kick">epoch</p><h1>epoch <em>${grp(e.epoch)}</em></h1><p class="sub">digest ${full(e.digest)}</p>${crumbs}
  <h2>settlement</h2><div class="tiles">${tile('budget', amtc(e.budget), 'a quarter of the pool at settlement', 'hero')}${tile('paid', amtc(e.paid), `to ${grp((e.payouts || []).length)} positions`)}${tile('rewarded', grp(e.rewarded), 'positions with positive credit')}${tile('Δ syntropy', grp(e.delta_syntropy), 'J(φ*ₑ) − J(φ*ₑ₋₁), recorded')}</div>
  <h2>record</h2>${kv([
    ['boundary', hlink(e.boundary)], ['settled at', hlink(e.settled_at)],
    ['particles', grp(e.particles)], ['axons', grp(e.axons)], ['syntropy', grp(e.syntropy)], ['focus', `${grp(e.focus_bps)}${SEP}bps of the subsidy in epoch ${grp(e.epoch + 1)}`],
    ['pool after', amt(e.pool_after)], ['φ* digest', full(e.phi)], ['beacon', full(e.beacon)], ['boundary root', full(e.boundary_root)], ['payouts root', full(e.payouts_root)],
  ])}
  <h2>payouts</h2>${table(pHead, pRows, 'no payouts this epoch: no position took its axon side to a new high with a positive share')}`;
}

async function focus() {
  const st = await status();
  const r = await req('/focus?top=100');
  if (!r.ok) return `<p class="kick">focus</p><h1>focus <em>φ*</em></h1><div class="empty">no settled epoch with φ* on this node yet.</div>`;
  const f = r.data; const top = f.top || [];
  const max = top.length ? big(top[0].phi) : 1n;
  const head = ['rank', 'particle', '>share', '', '>φ* raw~'];
  const rows = top.map((t, i) => { const w = max ? Number((big(t.phi) * 1000n) / max) / 10 : 0; return tds([grp(i + 1), ref('particle', t.particle), pct(big(t.phi), SCALE), `<i class="bar" style="width:${Math.max(1, w * 1.2).toFixed(1)}px"></i>`, grp(t.phi)], head); });
  const sum = top.reduce((s, t) => s + big(t.phi), 0n);
  return `<p class="kick">focus · ${esc(st.chain)}</p><h1>focus <em>φ*</em></h1>
  <p class="sub">epoch ${grp(f.epoch)} · syntropy ${grp(f.syntropy)} · digest ${short(f.digest)}${cp(f.digest || '')}</p>
  <p class="note">φ* is the stationary attention of the graph: where a walk over all cyberlinks, weighted by stake, spends its time. share = φ* ÷ 2^${esc(f.scale_bits)}; the top ${grp(top.length)} hold ${pct(sum, SCALE)}.</p>
  <h2>top particles</h2>${table(head, rows, 'no focus yet')}`;
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
    return tds([ref('neuron', p.neuron), `${ref('particle', p.p)} → ${ref('particle', p.q)}`, val(p.valence), grp(p.stake), lock, grp(p.earned), `<a href="#/tx/${p.opened_tx}">${grp(p.opened_at)}</a>`, p.card ? ref('card', p.card) : '—'], pHead);
  });
  // the settlements ahead and what they judge
  const pending = positions.filter((p) => p.open && Number(p.valence) !== 0).map((p) => {
    const E = epochOf(Number(p.since), L); const S = E * L + D;
    return S > tip ? `${ref('card', p.card)} added stake at ${hlink(p.since)}: judged by epoch ${E}'s settlement at ${hlink(S)}, ${grp(S - tip)} blocks from now.` : null;
  }).filter(Boolean);
  const eps = stk && stk.epochs && stk.epochs.length ? stk.epochs : ((ep && ep.epochs) || []).slice().reverse().map((x) => ({ ...x, payouts: (x.payouts || []).length }));
  const eHead = ['epoch', '>settled at', '>focus', '>budget', '>paid', '>rewarded', '>pool after~', '>Δ syntropy~'];
  const eRows = eps.slice(0, 60).map((x) => tds([`<a href="#/epoch/${x.epoch}">${grp(x.epoch)}</a>`, hlink(x.settled_at), `${grp(x.focus_bps)}${SEP}bps`, grp(x.budget), grp(x.paid), grp(x.rewarded), grp(x.pool_after), grp(x.delta_syntropy)], eHead));
  const evHead = ['height', 'tx', 'kind', 'neuron', 'p → q', '>amount'];
  const evRows = ((stk && stk.events) || []).slice(0, 30).map((v) => tds([hlink(v.h), ref('tx', v.txid), kind(v.kind === 'cyberlink' ? 'lock' : v.kind), ref('neuron', v.from), `${ref('particle', v.p)} → ${ref('particle', v.q)}`, v.kind === 'payout' ? `owner ${short(v.payout)}` : grp(v.amount)], evHead));

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
  ${evRows.length ? `<h2>staking transactions</h2>${table(evHead, evRows)}` : ''}
  ${stk ? `<p class="note">index at height ${grp(stk.tip)}, written ${ago(stk.generated)}; current stake and lock come from the node's cards, earned is the sum of each card's payouts in the settled epochs.</p>` : ''}`;
}

/* ------------------------------------------------------------------ history: canvas charts, no library */
const CH = { range: 'all', data: null, at: 0 };
const COL = { pink: '#ff2d92', band: 'rgba(255,45,146,.20)', blue: '#00b8ff', grid: 'rgba(255,255,255,.08)', axis: '#8a8a8a', ink: '#f2f2f2', target: 'rgba(255,255,255,.45)' };
const CHARTS = [
  { key: 'hr', lo: 'hr_lo', hi: 'hr_hi', title: 'hashrate', unit: 'H/s', note: 'Σ work ÷ Δt per bin (at least 12 blocks); the band is the range of a 12-block rolling estimate inside the bin', fmt: (v) => si(v, 'H/s') },
  { key: 'd', lo: 'd_lo', hi: 'd_hi', title: 'difficulty', unit: 'hashes', note: 'expected hashes per block, 2^256 ÷ (target + 1); mean and range per bin', fmt: (v) => si(v) },
  { key: 'bt', lo: 'bt_lo', hi: 'bt_hi', title: 'block time', unit: 's', note: 'mean per bin (at least 12 blocks); the band is the fastest and slowest block; the dashed line is the 30 s target', fmt: (v) => `${v === null ? '—' : Number(v).toFixed(1)}${SEP}s`, target: TARGET, linear: true },
  { key: 'tx', title: 'transactions', unit: 'per bin', note: 'transactions per bin, coinbase excluded', fmt: (v) => grp(v), bars: true, linear: true },
  { key: 'sa', key2: 'st', title: 'stake', unit: '', note: 'active (valence ≠ 0) and total stake at the end of each bin', fmt: (v) => si(v), linear: true, legend: ['active', 'total'] },
];

async function history() {
  const st = await status();
  const [h, s] = await Promise.all([file('history.json', 10000), file('summary.json', 10000)]);
  CH.data = h; CH.at = Date.now();
  viewLive = async () => { if (Date.now() - CH.at > DATA_EVERY) { const fresh = await file('history.json'); if (fresh && fresh.generated !== (CH.data || {}).generated) { CH.data = fresh; CH.at = Date.now(); drawAll(); } } };
  if (!h) {
    return `<p class="kick">history · ${esc(st.chain)}</p><h1>the whole <em>chain</em></h1><div class="empty">the history comes from the explorer's index (data/history.json), which is not served here yet.</div>`;
  }
  const tiles = s ? [
    tile('indexed', grp(s.height), `every block from genesis · ${ago(s.generated)}`, 'hero'),
    tile('hashrate<span class="est">100 blocks</span>', si(s.hashrate_100, 'H/s'), `1,000 blocks: ${si(s.hashrate_1000, 'H/s')}`),
    tile('block time', `${Number(s.block_time_1000).toFixed(1)}<span class="u">s</span>`, `mean of the last 1,000 · last 100: ${Number(s.block_time_100).toFixed(1)}${SEP}s`),
    tile('chainwork', si(Number(s.chainwork)), `hashes behind the tip · difficulty now ${si(Number(s.difficulty))}`),
    tile('transactions', grp(s.txs_total), `coinbase excluded · ${grp(s.staking_txs)} staking`),
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

/* ------------------------------------------------------------------ search, routing */
function notFound(what, why) {
  return `<p class="kick">not found</p><h1>${what}</h1><div class="empty">${esc(why || 'this node does not know it')}.</div><p class="note"><a href="#/">back to the overview</a></p>`;
}

async function search(q) {
  q = decodeURIComponent(q).trim().toLowerCase().replace(/^0x/, '').replace(/[\s,_]/g, '');
  if (/^\d+$/.test(q)) { location.replace(`#/block/${Number(q)}`); return null; }
  if (!HEX64.test(q)) return notFound(`“${esc(q.slice(0, 80))}”`, 'search takes a height, or a 64-hex block id, tx id, neuron, particle or card');
  const go = (k) => { location.replace(`#/${k}/${q}`); return null; };
  if ((await req(`/tx/${q}`)).ok) return go('tx');
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
  [/^tx\/([0-9a-f]{64})$/, tx, 'blocks'],
  [/^neuron\/([0-9a-f]{64})$/, neuron, ''],
  [/^particle\/([0-9a-f]{64})$/, particle, 'focus'],
  [/^card\/([0-9a-f]{64})$/, card, 'staking'],
  [/^epochs$/, epochs, 'epochs'],
  [/^epoch\/(\d+)$/, epoch, 'epochs'],
  [/^staking$/, staking, 'staking'],
  [/^history$/, history, 'history'],
  [/^focus$/, focus, 'focus'],
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
  if (!hit) { viewLive = null; view.innerHTML = notFound('no such page', 'the explorer knows overview, blocks, block, tx, neuron, particle, card, epochs, epoch, staking, history and focus'); return; }
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
window.addEventListener('resize', () => { clearTimeout(CH.rz); CH.rz = setTimeout(drawAll, 120); });
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
  const el = e.target.closest('[data-copy]'); if (!el) return;
  e.preventDefault();
  const text = el.dataset.copy;
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  const t = $('#toast'); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1100);
});

render(false);
