/* spacepussy.ai/explorer — a static page over a node's read API (cybernode rs/src/node/chain_routes.rs).
   the node answers at /explorer/api/<path> on the same origin; ?api=<base> points the page at another node.
   no build, no framework: one file, hash routes, big integers kept as strings or BigInt, never floats for amounts. */
'use strict';

const API = (new URLSearchParams(location.search).get('api') || '/explorer/api').replace(/\/+$/, '');
const TARGET = 30;          // s per block, the ASERT target
const WINDOW = 100;         // blocks for the median block time and the hashrate estimate
const PAGE = 25;            // rows per page of blocks
const REFRESH = 15000;      // ms
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

function up() { if (downSince) { downSince = 0; $('#banner').hidden = true; } }
function down(why) {
  if (!downSince) downSince = now();
  const b = $('#banner'); b.hidden = false;
  b.textContent = `the node is not answering right now (${why}). what you see may be stale; the page asks again every ${REFRESH / 1000} s.`;
  const n = $('#net'); n.classList.add('down'); n.innerHTML = `<i></i>node away · retrying`;
}

/* ------------------------------------------------------------------ numbers */
const SEP = '\u2009';  // thin space: long numbers wrap between groups; tables are nowrap
const grp = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  let s = String(v); const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  if (!/^\d+$/.test(s)) return esc(v);
  return (neg ? '−' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, SEP);
};
let DENOM = '';
const amt = (v) => `${grp(v)}<span class="u">${esc(DENOM)}</span>`;
const big = (v) => { try { return BigInt(v); } catch { return 0n; } };
const si = (x, unit = '') => {
  if (!isFinite(x)) return '—';
  const p = ['', 'k', 'M', 'G', 'T', 'P', 'E']; let i = 0;
  while (Math.abs(x) >= 1000 && i < p.length - 1) { x /= 1000; i++; }
  return `${x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0)}${SEP}${p[i]}${unit}`;
};
const dur = (s) => {
  s = Math.max(0, Math.round(s));
  if (s < 90) return `${s}${SEP}s`;
  if (s < 5400) return `${Math.round(s / 60)}${SEP}min`;
  if (s < 172800) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)}${SEP}h`;
  return `${Math.round(s / 86400)}${SEP}d`;
};
const ago = (t) => (t ? `${dur(now() - Number(t))} ago` : '—');
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

/* ------------------------------------------------------------------ ids */
const short = (id) => (id && id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-6)}` : esc(id ?? '—'));
const cp = (id) => `<button class="cp" data-copy="${esc(id)}" title="copy" aria-label="copy">⧉</button>`;
const ref = (kind, id) => (id ? `<a class="id" href="#/${kind}/${esc(id)}" title="${esc(id)}">${short(id)}</a>${cp(id)}` : '—');
const full = (id) => (id ? `<span class="id full" data-copy="${esc(id)}" title="click to copy">${esc(id)}</span>` : '—');
const kind = (k) => `<span class="kind ${esc(k)}">${esc(k)}</span>`;

/* ------------------------------------------------------------------ the node */
let ST = null; let stAt = 0;
async function status(fresh) {
  if (!fresh && ST && Date.now() - stAt < 5000) return ST;
  const r = await req('/status');
  if (!r.ok || typeof r.data !== 'object') throw new Down(`status HTTP ${r.status}`);
  ST = r.data; stAt = Date.now();
  DENOM = ST.chain || DENOM; $('#denom-foot').textContent = DENOM || 'its denom';
  const n = $('#net'); n.classList.remove('down');
  const rc = /-rc$/.test(ST.chain || '') ? ' · rehearsal' : '';
  n.innerHTML = `<i></i><b>${esc(ST.chain)}</b> · height ${grp(ST.height)}${rc}`;
  return ST;
}

const kv = (rows) => `<div class="kv">${rows.filter(Boolean).map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('')}</div>`;
const tile = (label, value, small = '', cls = '') => `<div class="tile ${cls}${String(value).replace(/<[^>]*>[^<]*<\/span>|<[^>]*>/g, '').length > 13 ? ' long' : ''}"><b>${value}</b><span>${label}</span>${small ? `<small>${small}</small>` : ''}</div>`;
const table = (head, rows, empty = 'nothing here yet') => rows.length
  ? `<div class="tbl"><table><thead><tr>${head.map((h) => `<th class="${h.startsWith('>') ? 'r' : ''}${h.includes('~') ? ' hide-s' : ''}">${h.replace(/^>|~/g, '')}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<div class="empty">${empty}</div>`;
const tds = (cells, head) => `<tr>${cells.map((c, i) => `<td class="${(head[i] || '').startsWith('>') ? 'r' : ''}${(head[i] || '').includes('~') ? ' hide-s' : ''}">${c}</td>`).join('')}</tr>`;

/* ------------------------------------------------------------------ pages */
const BLOCK_HEAD = ['height', 'block', 'age', '>txs', '>size~', 'miner~'];
const blockRow = (b) => tds([`<a href="#/block/${b.height}">${grp(b.height)}</a>`, ref('block', b.id), ago(b.time), grp(b.txs), `${grp(b.size)}${SEP}B`, ref('neuron', b.miner)], BLOCK_HEAD);
const EPOCH_HEAD = ['epoch', '>boundary', '>settled at', '>budget', '>paid', '>rewarded~', '>Δ syntropy~'];
const epochRow = (e) => tds([`<a href="#/epoch/${e.epoch}">${grp(e.epoch)}</a>`, `<a href="#/block/${e.boundary}">${grp(e.boundary)}</a>`, `<a href="#/block/${e.settled_at}">${grp(e.settled_at)}</a>`, grp(e.budget), grp(e.paid), grp(e.rewarded), grp(e.delta_syntropy)], EPOCH_HEAD);

async function overview() {
  const st = await status(true);
  const tip = Number(st.height); const last = Number(st['last-settled'] || 0);
  const [bl, eco, ep] = await Promise.all([
    api(`/blocks?limit=${WINDOW + 1}`),
    api('/economy'),
    api(`/epochs?after=${Math.max(0, last - 6)}&limit=6`),
  ]);
  const blocks = (bl && bl.blocks) || [];
  const head = blocks[blocks.length - 1]; const first = blocks[0];
  const gaps = blocks.slice(1).map((b, i) => b.time - blocks[i].time);
  const med = median(gaps);
  // hashrate ≈ Σ work / Δt over the window; per-block chainwork is not served, so the work is sampled from five headers' bits
  let rate = NaN; let span = 0;
  if (first && head && head.height > first.height && head.time > first.time) {
    span = head.height - first.height;
    const hs = [...new Set([0, 1, 2, 3, 4].map((k) => first.height + 1 + Math.round(((span - 1) * k) / 4)))];
    const hdrs = (await Promise.all(hs.map((h) => api(`/header/${h}`)))).filter(Boolean);
    if (hdrs.length) {
      const avg = hdrs.reduce((s, h) => s + work(h.bits), 0n) / BigInt(hdrs.length);
      rate = Number(avg * BigInt(span)) / (head.time - first.time);
    }
  }
  const epLen = Number((eco && eco.epoch_length) || 240); const delay = Number((eco && eco.settle_delay) || 120);
  const nextB = Number(st['next-boundary'] || 0);
  const epochs = ((ep && ep.epochs) || []).slice().reverse();
  const lastRec = epochs[0];
  const particles = lastRec ? lastRec.particles : (eco && eco.timings && eco.timings[0] ? eco.timings[0].particles : st.particles);
  const supply = st.supply;
  const tiles = [
    tile('height', grp(tip), `tip ${head ? ago(head.time) : '—'} · ${ref('block', st.tip)}`, 'hero'),
    tile('block time', isFinite(med) ? `${med}<span class="u">s</span>` : '—', `median over the last ${grp(gaps.length)} blocks · target ${TARGET}${SEP}s`),
    tile('hashrate<span class="est">estimate</span>', si(rate, 'H/s'), span ? `Σ work ÷ Δt over ${grp(span)} blocks, work from sampled bits` : 'needs two blocks'),
    tile('difficulty', si(Number(work(st.bits || '0x1e010000'))), `expected hashes per block · bits ${esc(st.bits)} → next ${esc(st['next-bits'] || '—')}`),
    tile('supply', amt(supply), `raw units · subsidy now ${grp(st.subsidy)} per block`),
    tile('neurons', grp(st.neurons), 'keys with state'),
    tile('particles', grp(particles), lastRec ? `in the graph of epoch ${grp(lastRec.epoch)}` : 'in the graph'),
    tile('axons', grp(st.axons), 'cyberlinked pairs p → q'),
    tile('epoch', grp(st.epoch), `next boundary <b>${grp(nextB)}</b> in ${grp(nextB - tip)} blocks · last settled <a href="#/epoch/${last}">${grp(last)}</a>`),
    tile('active stake', amt(st['active-stake']), `total ${grp(st['total-stake'])} · focus ${grp(st['focus-bps'])}${SEP}bps`),
    tile('pool', amt(st.pool), `focus pool · settlement ${st['settlement-ok'] === 'true' ? 'ok' : esc(st['settlement-ok'] || '—')}`),
    tile('mempool', grp(st.mempool), `transactions waiting · peers ${grp(st.peers)} · finalized ${grp(st.finalized)}`),
  ];
  const latest = blocks.slice(-12).reverse();
  return `<p class="kick">${esc(st.chain)} · ${esc(st.protocol || '')} · ${esc(st.version ? 'v' + st.version : '')}</p>
  <h1>the chain, <em>live</em></h1>
  <p class="sub">genesis block ${ref('block', st['genesis-block'])} · moniker ${esc(st.moniker)} · state root ${short(st['bbg-root'])}${cp(st['bbg-root'] || '')}</p>
  <h2>now</h2><div class="tiles">${tiles.join('')}</div>
  <div class="cols"><div><h2>latest blocks</h2>${table(BLOCK_HEAD, latest.map(blockRow), 'no blocks served')}<div class="pager"><a class="end" href="#/blocks">all blocks →</a></div></div>
  <div><h2>latest epochs</h2>${table(['epoch', '>boundary', '>settled at', '>paid'], epochs.map((e) => tds([`<a href="#/epoch/${e.epoch}">${grp(e.epoch)}</a>`, grp(e.boundary), grp(e.settled_at), grp(e.paid)], ['', '>', '>', '>'])), 'no epoch settled yet')}
  <p class="note">an epoch is ${grp(epLen)} blocks; it settles ${grp(delay)} blocks after its boundary. epoch ${grp(st.epoch)} closes at ${grp(nextB)} and settles at ${grp(nextB + delay)}.</p>
  <div class="pager"><a class="end" href="#/epochs">all epochs →</a></div></div></div>`;
}

async function blocks(top) {
  const st = await status();
  const tip = Number(st.height);
  let hi = top === undefined ? tip : Math.min(Number(top), tip);
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
  const newer = hi < tip ? `<a href="#/blocks${hi + PAGE >= tip ? '' : '/' + (hi + PAGE)}">← newer</a>` : '<span>← newer</span>';
  const older = lo > 0 ? `<a href="#/blocks/${lo - 1}">older →</a>` : '<span>older →</span>';
  return `<p class="kick">blocks · ${esc(st.chain)}</p><h1>blocks <em>${grp(lo)}–${grp(hi)}</em></h1><p class="sub">tip ${grp(tip)} · ${PAGE} per page</p>
  <h2>&nbsp;</h2>${table(BLOCK_HEAD, rows.map(blockRow))}<div class="pager">${newer}${older}</div>`;
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
  if (!r.ok) return notFound(`block ${esc(idh)}`, r.data && r.data.error);
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

async function tx(id) {
  await status();
  const r = await req(`/tx/${id}`);
  if (!r.ok) return notFound(`transaction ${short(id)}`, 'not in a block on this node, nor in its mempool');
  const t = r.data; const x = t.tx || {};
  const where = t.height === 'mempool' ? 'in the mempool, not yet in a block' : `block ${ref('block', t.block)} at height <a href="#/block/${t.height}">${grp(t.height)}</a>, index ${grp(t.index)}`;
  let link3 = ''; let extra = '';
  if (t.kind === 'cyberlink' || t.kind === 'unlock' || t.kind === 'payout') {
    link3 = `<div class="link3"><div class="pt"><span>from particle</span>${pAnchor(x.p)}</div><div class="arrow"><b>→</b>${t.kind === 'cyberlink' ? `<small>valence ${val(x.valence)}</small>` : ''}</div><div class="pt"><span>to particle</span>${pAnchor(x.q)}</div></div>`;
  }
  if (t.kind === 'cyberlink') {
    const staking = big(x.amount) > 0n && Number(x.valence) !== 0;
    let card = '';
    if (staking && t.height !== 'mempool') {
      const cs = await api(`/cards/${x.from}`).catch(() => null);
      const c = cs && (cs.cards || []).find((c) => c.p === x.p && c.q === x.q && Number(c.since) === Number(t.height));
      if (c) card = `the position it opened: card ${ref('card', c.card)} · stake ${amt(c.stake)} · locked until height ${grp(c.unlock_at)}.`;
    }
    extra = `<p class="note">${staking ? `a staking position: amount &gt; 0 and valence ≠ 0. it is paid at a settlement (boundary + 120 blocks) by its share of the syntropy gain. ${card}` : 'a cyberlink with no stake: it adds to the graph, it does not earn.'}</p>`;
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
  return `<p class="kick">transaction · ${esc(t.kind)}</p><h1>tx <em>${short(id)}</em></h1><p class="sub">${full(id)}</p>${link3}${extra}<h2>fields</h2>${kv(rows)}`;
}
const pAnchor = (p) => (p ? `<a href="#/particle/${esc(p)}">${esc(p)}</a>` : '—');

async function neuron(id) {
  const st = await status();
  const [bal, nonce, cards] = await Promise.all([api(`/balance/${id}`), api(`/nonce/${id}`), api(`/cards/${id}`)]);
  const last = Number(st['last-settled'] || 0);
  const eps = last ? await api(`/epochs?after=${Math.max(0, last - 60)}&limit=60`).catch(() => null) : null;
  const pays = [];
  for (const e of (eps && eps.epochs) || []) for (const p of e.payouts || []) if (p.owner === id) pays.push({ ...p, epoch: e.epoch, settled_at: e.settled_at });
  const b = bal || {};
  const locked = big(b.balance) - big(b.spendable);
  const cs = (cards && cards.cards) || [];
  const cHead = ['card', 'p → q', 'valence', '>stake', '>since', '>unlock at~'];
  const cRows = cs.map((c) => tds([ref('card', c.card), `${ref('particle', c.p)} → ${ref('particle', c.q)}`, val(c.valence), grp(c.stake), `<a href="#/block/${c.since}">${grp(c.since)}</a>`, grp(c.unlock_at)], cHead));
  const pHead = ['epoch', '>settled at', 'card', '>amount'];
  const pRows = pays.reverse().map((p) => tds([`<a href="#/epoch/${p.epoch}">${grp(p.epoch)}</a>`, grp(p.settled_at), ref('card', p.card), grp(p.amount)], pHead));
  const quiet = big(b.balance) === 0n && !Number(nonce && nonce.confirmed) && !cs.length;
  return `<p class="kick">neuron</p><h1>neuron <em>${short(id)}</em></h1><p class="sub">${full(id)}</p>
  ${quiet ? `<p class="note">this key holds nothing and has signed nothing on this chain. if it is a particle, see <a href="#/particle/${id}">its focus</a>.</p>` : ''}
  <h2>balance</h2><div class="tiles">${tile('balance', amt(b.balance), `at height ${grp(b.height)}`, 'hero')}${tile('spendable', amt(b.spendable), locked > 0n ? `${grp(locked.toString())} held but not yet spendable (maturing coinbase)` : 'all of it spendable')}${tile('nonce', grp(nonce ? nonce.confirmed : '—'), `next to sign: ${grp(nonce ? nonce.nonce : '—')}`)}${tile('positions', grp(cs.length), 'staked cyberlinks authored')}</div>
  <p class="note">token ${short(b.token)}${cp(b.token || '')} · ${esc(b.denom || DENOM)} · supply ${grp(b.supply)}</p>
  <h2>staked positions</h2>${table(cHead, cRows, 'no positions: no staked cyberlink authored by this neuron')}
  <h2>payouts</h2>${table(pHead, pRows, `no payouts in the last ${grp(Math.min(last, 60))} settled epochs`)}`;
}

async function particle(id) {
  const st = await status();
  const r = await req(`/focus/${id}`);
  const f = r.ok ? r.data : null;
  const share = f ? pct(big(f.phi), SCALE) : '—';
  return `<p class="kick">particle</p><h1>particle <em>${short(id)}</em></h1><p class="sub">${full(id)}</p>
  <h2>focus φ*</h2>${f ? `<div class="tiles">${tile('share of focus', share, `epoch ${grp(f.epoch)} · the last settled with φ*`, 'hero')}${tile('rank', `${grp(f.rank)}<span class="u">of ${grp(f.particles)}</span>`, '1 = the most attended')}${tile('φ* raw', grp(f.phi), `fixed point, scale 2^${esc(f.scale_bits)}`)}</div>`
    : `<div class="empty">no focus for this particle at the last settled epoch (${grp(st['last-settled'])}). a particle gets focus once a settlement sees it in the graph.</div>`}
  <p class="note">the node serves focus per particle; the cyberlinks into and out of a particle are not indexed by this API yet. <a href="#/neuron/${id}">read it as a neuron</a> · <a href="#/focus">top particles</a></p>`;
}

async function card(id) {
  await status();
  const c = await api(`/card/${id}`);
  if (!c) return notFound(`position ${short(id)}`, 'no position with this id');
  return `<p class="kick">position · card</p><h1>card <em>${short(id)}</em></h1><p class="sub">${full(id)}</p>
  <div class="link3"><div class="pt"><span>from particle</span>${pAnchor(c.p)}</div><div class="arrow"><b>→</b><small>valence ${val(c.valence)}</small></div><div class="pt"><span>to particle</span>${pAnchor(c.q)}</div></div>
  <h2>fields</h2>${kv([['stake', amt(c.stake)], ['owner', ref('neuron', c.owner)], ['author', ref('neuron', c.author)], ['axon', full(c.axon)], ['since', `<a href="#/block/${c.since}">${grp(c.since)}</a>`], ['unlock at', grp(c.unlock_at)]])}`;
}

async function epochs() {
  const st = await status();
  const last = Number(st['last-settled'] || 0);
  const r = last ? await api(`/epochs?after=${Math.max(0, last - 500)}&limit=500`) : null;
  const list = ((r && r.epochs) || []).slice().reverse();
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
    const eco = await api('/economy').catch(() => null);
    const L = Number((eco && eco.epoch_length) || 240); const D = Number((eco && eco.settle_delay) || 120);
    const tip = Number(st.height); const settle = n * L + D;
    return `<p class="kick">epoch</p><h1>epoch <em>${grp(n)}</em></h1>${crumbs}<h2>&nbsp;</h2><div class="empty">not settled ${settle > tip ? `yet: its boundary is height ${grp(n * L)}, it settles at ${grp(settle)}, ${grp(settle - tip)} blocks from the tip` : 'on this node'}.</div>`;
  }
  const e = r.data;
  const pHead = ['card', 'owner', '>amount'];
  const pRows = (e.payouts || []).map((p) => tds([ref('card', p.card), ref('neuron', p.owner), grp(p.amount)], pHead));
  return `<p class="kick">epoch</p><h1>epoch <em>${grp(e.epoch)}</em></h1><p class="sub">digest ${full(e.digest)}</p>${crumbs}
  <h2>settlement</h2><div class="tiles">${tile('budget', amt(e.budget), 'tokens set aside for the epoch', 'hero')}${tile('paid', amt(e.paid), `to ${grp((e.payouts || []).length)} positions`)}${tile('rewarded', grp(e.rewarded), 'positions with positive credit')}${tile('Δ syntropy', grp(e.delta_syntropy), 'J(φ*ₑ) − J(φ*ₑ₋₁), recorded')}</div>
  <h2>record</h2>${kv([
    ['boundary', `<a href="#/block/${e.boundary}">${grp(e.boundary)}</a>`], ['settled at', `<a href="#/block/${e.settled_at}">${grp(e.settled_at)}</a>`],
    ['particles', grp(e.particles)], ['axons', grp(e.axons)], ['syntropy', grp(e.syntropy)], ['focus', `${grp(e.focus_bps)}${SEP}bps`],
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

/* ------------------------------------------------------------------ routing */
const ROUTES = [
  [/^$/, overview, 'overview', true],
  [/^blocks$/, () => blocks(), 'blocks', true],
  [/^blocks\/(\d+)$/, blocks, 'blocks'],
  [/^block\/([0-9a-f]{64}|\d+)$/, block, 'blocks'],
  [/^tx\/([0-9a-f]{64})$/, tx, 'blocks'],
  [/^neuron\/([0-9a-f]{64})$/, neuron, ''],
  [/^particle\/([0-9a-f]{64})$/, particle, 'focus'],
  [/^card\/([0-9a-f]{64})$/, card, ''],
  [/^epochs$/, epochs, 'epochs'],
  [/^epoch\/(\d+)$/, epoch, 'epochs'],
  [/^focus$/, focus, 'focus'],
  [/^search\/(.+)$/, search, ''],
];
let gen = 0; let failed = false; let live = false;
async function render(soft) {
  const my = ++gen;
  const path = location.hash.replace(/^#\/?/, '');
  const low = /^search\//.test(path) ? path : path.toLowerCase();
  const hit = ROUTES.find(([re]) => re.test(low));
  const view = $('#view');
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', !!hit && a.dataset.tab === hit[2]));
  if (!hit) { view.innerHTML = notFound('no such page', 'the explorer knows overview, blocks, block, tx, neuron, particle, card, epochs, epoch and focus'); return; }
  live = !!hit[3];
  if (!soft) view.innerHTML = `<p class="muted pad">reading the node…</p>`;
  try {
    const html = await hit[1](...(low.match(hit[0]).slice(1)));
    if (my !== gen || html === null) return;
    failed = false;
    const y = window.scrollY; view.innerHTML = html; if (soft) window.scrollTo(0, y);
    if (!soft) document.title = `${(view.querySelector('h1') || {}).textContent || 'explorer'} — space-pussy explorer`;
  } catch (e) {
    if (my !== gen) return;
    failed = true;
    if (e instanceof Down) down(e.message); else console.error(e);
    if (!soft || !view.querySelector('h1')) {
      view.innerHTML = `<p class="kick">waiting for the node</p><h1>the chain is <em>out of reach</em> for a moment</h1>
      <div class="empty">${e instanceof Down ? 'the node behind this page does not answer. blocks keep coming whether or not this page can see them; it asks again every 15 s.' : esc('the page could not read this answer: ' + e.message)}</div>`;
    }
  }
}

window.addEventListener('hashchange', () => { render(false); window.scrollTo(0, 0); });
setInterval(() => { if (!document.hidden && (live || failed)) render(true); }, REFRESH);
document.addEventListener('visibilitychange', () => { if (!document.hidden && live) render(true); });

$('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#q').value.trim(); if (!q) return;
  $('#q').blur(); location.hash = `#/search/${encodeURIComponent(q)}`;
});

let toastT = 0;
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-copy]'); if (!el) return;
  e.preventDefault();
  const text = el.dataset.copy;
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  const t = $('#toast'); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1100);
});

render(false);
