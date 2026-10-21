/* spacepussy.ai — the canary of the bootloader, reborn · the deck
   seven chapters, each a page: / · /rebirth · /balance · /story · /canary · /graph · /next
   marks: ● measured · ○ target · ◌ mock. every number carries one.
   no calendar years on the page: the countdown and the clock time carry the date */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const M = (k) => `<i class="mk ${k}"></i>`;
const COLS = ['#ff2d92', '#00b8ff', '#ffc400', '#ff1a00', '#ff7a00', '#1e00ff', '#7a00ff'];
const T0 = Date.parse('2026-11-05T13:37:00Z');   // fifteen minutes after bostrom, which returns five years to the second after its block 1
const BOSTROM_T0 = Date.parse('2026-11-05T13:22:42Z');

const sfx = (() => {
  let ac = null, master = null, on = localStorage.getItem('cyber.sound') !== 'off', amb = null;
  const ensure = () => { if (ac) return true; try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .22; master.connect(ac.destination); } catch { return false; } return true; };
  const resume = () => { if (ac && ac.state === 'suspended') ac.resume(); };
  const tone = (f0, f1, dur, type = 'sine', g = .5, at = 0) => { if (!on || !ensure()) return; resume(); const t = ac.currentTime + at; const o = ac.createOscillator(), v = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur); v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + .006); v.gain.exponentialRampToValueAtTime(.0005, t + dur); o.connect(v); v.connect(master); o.start(t); o.stop(t + dur + .02); };
  const noise = (dur, g = .3, hp = 2000) => { if (!on || !ensure()) return; resume(); const t = ac.currentTime; const n = ac.sampleRate * dur | 0, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const src = ac.createBufferSource(); src.buffer = b; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const v = ac.createGain(); v.gain.value = g; src.connect(f); f.connect(v); v.connect(master); src.start(t); };
  const ambient = (start) => { if (!ensure()) return; if (start && !amb && on) { const v = ac.createGain(); v.gain.value = 0; v.connect(master); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.connect(v); const os = [55, 55.4, 82.5].map((fr) => { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = fr; o.connect(f); o.start(); return o; }); v.gain.linearRampToValueAtTime(.06, ac.currentTime + 4); amb = { v, os }; } if (!start && amb) { amb.v.gain.linearRampToValueAtTime(0, ac.currentTime + 1); const a = amb; amb = null; setTimeout(() => a.os.forEach((o) => o.stop()), 1200); } };
  const NOTES = [220, 246.9, 277.2, 329.6, 370, 440, 493.9];
  return {
    get on() { return on; },
    toggle() { on = !on; localStorage.setItem('cyber.sound', on ? 'on' : 'off'); if (on) { ensure(); resume(); ambient(true); tone(660, 990, .12, 'sine', .4); } else ambient(false); return on; },
    wake() { if (on && ensure()) { resume(); ambient(true); } },
    tick() { noise(.02, .25, 3000); tone(1800, 1200, .03, 'square', .08); },
    move(dir, ch) { noise(.03, .2, 1500); tone(dir > 0 ? 440 : 520, dir > 0 ? 560 : 400, .08, 'sine', .25); if (ch != null) { const r = NOTES[ch]; tone(r, null, .5, 'sine', .18, .04); tone(r * 1.5, null, .45, 'sine', .1, .08); } },
    link() { tone(880, 1320, .16, 'sine', .35); tone(1320, 1760, .22, 'triangle', .18, .1); },
    hash() { noise(.012, .12, 4000); },
    ticket() { tone(1760, 1750, .35, 'sine', .3); tone(2640, 2630, .25, 'sine', .12, .02); },
    converge(d) { const f = 220 + 1200 * Math.min(1, Math.max(0, (-Math.log10(Math.max(d, 1e-9)) - 1) / 7)); tone(f, f * 1.02, .07, 'triangle', .22); },
    stake(v) { tone(v ? 160 : 110, 60, .25, 'sine', .45); noise(.05, .15, 800); },
    mentor() { [0, 2, 4, 6].forEach((k, i) => tone(NOTES[k] * 2, null, .3, 'sine', .22, i * .09)); },
    chord(ch) { const r = NOTES[ch]; [1, 1.25, 1.5, 2].forEach((m, i) => tone(r * m, null, .9, 'sine', .14, i * .05)); },
  };
})();


/* ------------------------------------------------------------------ chapters = pages */
const CH = [
  { id: '', path: '/', name: 'space-pussy', c: COLS[0] },
  { id: 'rebirth', path: '/rebirth', name: 'rebirth', c: COLS[1] },
  { id: 'balance', path: '/balance', name: 'balance', c: COLS[2] },
  { id: 'story', path: '/story', name: 'the story', c: COLS[3] },
  { id: 'canary', path: '/canary', name: 'the canary', c: COLS[4] },
  { id: 'graph', path: '/graph', name: 'the graph', c: COLS[5] },
  { id: 'next', path: '/next', name: 'what next', c: COLS[6] },
];
const S = []; const push = (ch, html, cls = '', extra = {}) => S.push({ ch, cls, html, ...extra });
const count = (cls = '') => `<div class="count ${cls}" data-count><div><b>--</b><span>days</span></div><div><b>--</b><span>hours</span></div><div><b>--</b><span>min</span></div><div><b>--</b><span>sec</span></div></div>`;

/* 1 · cover */
push(0, `<div><p class="kick">the canary of the bootloader · a memecoin with balls · block 368 → halt → ∞</p><p class="hero-word boot">SPACE-PUSSY</p><p class="sub">halted · the cat sleeps · reborn</p><p class="lead">almost four years, 32,682 particles, 48,370 cyberlinks, 616 accounts. halted at height <b>19,940,993</b>. fifteen minutes after bostrom the cat wakes in a new body on soft3 — with $PUSSY, every balance and the recovered graph.</p>${count('mini')}<p class="kbd">→ or space · swipe · every arrow is one step · <span id="nslides"></span> pages</p></div>`, 'one');

/* 2 · rebirth */
push(1, `<div><p class="kick">rebirth · 13:37 UTC · <span data-days>soon</span></p><h2>fifteen minutes<br><em>after bostrom.</em></h2><p class="lead">bostrom is reborn at 13:22:42 UTC, five years to the second after its block 1. at 13:37 the cat wakes: space-pussy returns as a root chain on soft3. <span id="local-time" class="fine"></span></p><p class="mute">the canary goes first through every rehearsal, and second on the day.</p></div><div>${count()}<p class="fine">counting against your clock · the genesis time is pinned in the binary ${M('m')}</p></div>`, '', { bridge: 'what returns, and what changes' });
push(1, `<div><p class="kick">rebirth · what returns</p><h2>everything you had.<br><em>nothing you must do.</em></h2><p class="lead">the genesis is built from the burial snapshot by a deterministic pipeline: two independent builds give the same bytes, and the particle of that file is the chain id.</p><div class="tiles"><span class="tile"><b>$PUSSY</b>every balance, liquid again</span><span class="tile"><b>the graph</b>29,112 links, recovered</span><span class="tile"><b>your keys</b>the same secp256k1 key signs</span><span class="tile"><b>616 accounts</b>every holder of every denom</span></div></div><div class="steps"><div class="step"><b>balances</b><span>liquid, delegated and undelegating amounts return to the account; LP positions dissolve into their tokens at halt reserves; every denom is carried as its own token ${M('m')}</span></div><div class="step"><b>graph</b><span>every recovered cyberlink re-played in chain order; particles re-addressed from IPFS CIDs to hemera hashes, the old address kept resolvable ${M('m')}</span></div><div class="step"><b>the pruned past</b><span>19,258 early links were pruned before any archive existed — they are gone, and the snapshot says so ${M('m')}</span></div><div class="step"><b>the swap</b><span>every other onchain token is priced at the warp pools of the last block and swapped into PUSSY ${M('m')}</span></div></div>`, '', { bridge: 'the new body' });
push(1, `<div><p class="kick">rebirth · the new body</p><h2>same keys.<br><em>new body.</em></h2><p class="lead">the new space-pussy runs on soft3: one binary, the canary as data. your keys sign as before; every balance is liquid at genesis; the recovered graph is carried whole. the rules of the new chain are published on the launch page as they are frozen — this site repeats nothing before then.</p><p class="mute">what is already fixed: the genesis time, the genesis file and its chain id, and that nothing a holder must do before the rebirth.</p></div><div class="nums"><div class="n"><big>13:37:00</big><small>UTC · genesis, fifteen minutes after bostrom ${M('m')}</small></div><div class="n"><big>1 file</big><small>the genesis: deterministic, its particle is the chain id ${M('m')}</small></div><div class="n"><big>0 steps</big><small>for a holder before rebirth — the same key, the same balance ${M('m')}</small></div><div class="n"><big>the launch page</big><small><a href="https://cyber.page/launch/" target="_blank" rel="noopener">cyber.page/launch</a> — the rules, as they freeze ${M('t')}</small></div></div>`, 'ink', { bridge: 'check your balance before it moves' });

/* 3 · balance */
push(2, `<div><p class="kick">balance · from the final snapshot</p><h2>what you hold<br><em>at halt.</em></h2><p class="lead">balances are read from the burial snapshot, in your browser. a mnemonic or a private key is derived locally and never leaves this page. the chain is halted, so what you see is exactly what the genesis carries.</p><div class="nums"><div class="n"><big>616</big><small>accounts with a balance ${M('m')}</small></div><div class="n"><big>52</big><small>validators at halt ${M('m')}</small></div></div><p class="fine">PUSSY value at halt uses warp prices from the snapshot pools; every other token is swapped at that price</p></div>
<div class="panel checker" id="checker"><div class="tabs"><button class="tab on" data-m="name">name</button><button class="tab" data-m="addr">address</button><button class="tab" data-m="mnem">mnemonic</button><button class="tab" data-m="priv">private key</button><button class="tab" data-m="ledger">ledger</button></div>
<div data-in="name"><input id="pname" placeholder="passport name" autocomplete="off"></div>
<div data-in="addr" hidden><input id="addr" placeholder="pussy1… or bostrom1…" autocomplete="off"></div>
<div data-in="mnem" hidden><textarea id="mnem" placeholder="twelve or twenty-four words — derived locally, never sent anywhere"></textarea></div>
<div data-in="priv" hidden><input id="priv" placeholder="private key hex (64 chars) — derived locally"></div>
<div data-in="ledger" hidden><p class="hint">connect a Ledger with the Cosmos app open, then check.</p></div>
<div class="row"><button class="btn" id="go">check balance</button><button class="btn ghost" id="clr">clear</button></div>
<div class="addr" id="derived"></div><div class="bal" id="bal"></div><div class="err" id="err"></div>
<p class="hint">the chain is halted — balances are read from the snapshot. keys never leave this page. a bostrom address is converted to its pussy twin.</p></div>`, '', { id: 'balance', bridge: 'how it got here' });

/* 4 · the story */
push(3, `<div><p class="kick">the story · block 368 · the first link</p><h2>a memecoin with balls.<br><em>built as the playground.</em></h2><p class="lead">launched as the second network on cyber-sdk: community-led, cheaper and more fun — not a doge, a collaborative computer with sequential and parallel computing, autonomous execution and cyb. one exa PUSSY, liquid pussy minted while staking, eighteen heroes in genesis.</p><p class="mute">the serious idea behind the cat: the inter-knowledge protocol — a convention over IBC to sync knowledge between chains. bostrom needed a second brain for bidirectional experiments.</p></div><div class="nums"><div class="n"><big>32,682</big><small>particles ${M('m')}</small></div><div class="n"><big>48,370</big><small>cyberlinks on chain ${M('m')}</small></div><div class="n"><big>616</big><small>accounts ${M('m')}</small></div><div class="n"><big>52</big><small>validators ${M('m')}</small></div><div class="n"><big>19,940,993</big><small>blocks in almost four years ${M('m')}</small></div><div class="n"><big>26</big><small>warp pools at halt ${M('m')}</small></div></div>`, '', { bridge: 'the idea it tested' });
push(3, `<div><p class="kick">the story · the idea</p><h2>two brains<br><em>that learn from each other.</em></h2><p class="quote">one chain with a knowledge graph is a model. <b>two chains syncing their links over IBC is a protocol</b> — knowledge that moves between sovereign brains, priced by the pools between them.</p><p class="lead">space-pussy was that second brain: the place where a link, a price and a community could cross a border before the protocol did.</p></div><div><p class="quote">it tested what bostrom could not test alone: links crossing chains, tokens priced against each other in warp pools, a community running its own computer on the same stack. <b>cheaper, funnier, first.</b></p><p class="quote">the cat was never the product. it was the proving ground of the proving ground — and that is exactly the job it keeps.</p></div>`, 'ink', { bridge: 'the canary' });

/* 5 · the canary — why, the family, the hand-over */
push(4, `<div><p class="kick">the canary · why</p><h2>takes every rehearsal<br><em>first.</em></h2><p class="lead">the launch runs through the cat before it touches the bootloader: the live test network, then a rehearsal chain built from the real genesis on three nodes, then space-pussy itself. small enough to rebuild in minutes, real enough to break what will break.</p><p class="mute">it returns on soft3 as one of the two root books, carrying $PUSSY and the recovered graph.</p></div><div class="steps"><div class="step"><b>rehearsal</b><span>the test network is live; the rehearsal chain boots from the real genesis of pussy on three machines ${M('m')}</span></div><div class="step"><b>the day</b><span>bostrom at 13:22:42 UTC, space-pussy at 13:37 UTC — same binary, same pipeline, two genesis roots ${M('m')}</span></div><div class="step"><b>under real use</b><span>ninety days of the two chains under real use and a weekly red team before the money chain exists ${M('t')}</span></div></div>`, '', { bridge: 'bostrom · pussy · cyber' });
push(4, `<div class="col"><p class="kick">the canary · the family</p><h2>two root books.<br><em>one money.</em></h2><p class="lead">same binary, same genesis pipeline, two genesis roots minutes apart. every neuron's own book hangs off them.</p></div><div class="fig"><table class="cmp"><thead><tr><th></th><th><i style="--c:#00ff41"></i>bostrom</th><th><i style="--c:#ff2d92"></i>pussy</th><th><i style="--c:#00b8ff"></i>cyber</th></tr></thead><tbody>
<tr><td>what</td><td>the bootloader</td><td>the canary — takes every rehearsal first</td><td>the money</td></tr>
<tr><td>token</td><td>$BOOT</td><td>$PUSSY</td><td>$CYB</td></tr>
<tr><td>genesis</td><td>13:22:42 UTC · five years after block 1 ${M('m')}</td><td>13:37:00 UTC · the same day ${M('m')}</td><td>phase 3 ${M('t')}</td></tr>
<tr><td>carries</td><td>every balance · 2.9M links · 47,837 names</td><td>every balance · 29K links</td><td>TOCYB × 666 → CYB</td></tr>
<tr><td>consensus</td><td>foculus</td><td>foculus</td><td>foculus</td></tr>
</tbody></table><p class="fine">the rules of both chains are published on <a href="https://cyber.page/launch/" target="_blank" rel="noopener">cyber.page/launch</a> as they freeze</p></div>`, '', { bridge: 'what the hand-over carries' });
push(4, `<div><p class="kick">the canary · the hand-over</p><h2>every onchain token<br><em>becomes PUSSY.</em></h2><p class="lead">at halt, every other onchain token is priced at the warp pool prices of the last block and swapped into PUSSY. the supply audit, from the snapshot:</p><p class="mute">pool coins are excluded; tokens without a direct pussy pool are routed through liquid pussy; dust pools below a million micro-units do not quote.</p></div><div class="nums"><div class="n"><big>1,099,389,810,279,114,036</big><small>PUSSY native supply at halt ${M('m')}</small></div><div class="n"><big>5,389,836,483,227,616</big><small>of it in IBC escrows · nearly all on channel-0 to bostrom ${M('m')}</small></div><div class="n"><big>+52,685,989,888,822,264</big><small>minted by the swap · +4.8 %, mostly LP, V and A ${M('m')}</small></div><div class="n"><big>1,152,075,800,167,936,256</big><small>final total supply of PUSSY ${M('m')}</small></div></div>`, '', { bridge: 'the graph itself' });

/* 6 · the graph */
push(5, `<div class="fullgraph"><div><p class="kick">the graph · a sample of the real thing</p><h2>29,112 links.<br><em>recovered from the cat.</em></h2><p class="lead">behind this page: 1,200 particles and 3,835 cyberlinks sampled from the recovered space-pussy graph — the 400 heaviest particles and the 800 that link into them most, laid out by the graph's own spectrum.</p><div class="gstat"><div><b>16,271</b><span>particles in the recovered set</span></div><div><b>29,112</b><span>cyberlinks recovered</span></div><div><b>1,200 · 3,835</b><span>drawn here ${M('m')}</span></div></div></div></div>`, 'one bare', { id: 'cybergraph' });
push(5, `<div><p class="kick">the graph · the datasets</p><h2>the record<br><em>outlives every server.</em></h2><p class="lead">every dataset of the burial is content-addressed on IPFS, pinned to Pinata and to the cybernode. the manifest carries the sha256 of every file; the genesis pipeline reads these files and nothing else.</p><p class="mute">the node was pruned below height 10,455,265 and no archive node exists anywhere: 29,112 of 48,370 links were recovered — 28,302 from the indexer, 810 from block events, cross-checked where the ranges overlap. 19,258 early links are unrecoverable.</p><p class="fine">reproduce every file from the node: <a href="https://github.com/cyberia-to/space-pussy/tree/main/snapshot" target="_blank" rel="noopener">github.com/cyberia-to/space-pussy/snapshot</a> · the burial page: <a href="/snapshot">spacepussy.ai/snapshot</a></p></div><div class="panel checker"><table class="files" id="files"><tbody></tbody></table><p class="hint" id="manlink"></p></div>`, '', { id: 'datasets', bridge: 'the people who ran it' });

/* 7 · next */
push(6, `<div><p class="kick">what next · the validators</p><h2>fifty-two validators<br><em>ran the cat.</em></h2><p class="lead">the ones still bonded at halt, and the ones who carried it longest. a validator on the new body is whoever runs the binary — the set is open from block one.</p></div><div class="heroes">${['saturnia', 'Deep Fields', 'Galaxy', 'Bro_n_Bro', 'cyberG', 'web34ever', 'Citizen Web3', 'Techstur', 'PensionFund4ALL', 'Kerman', 'BigfOOT', 'PLap'].map((h) => `<span>${esc(h)}<small>validator</small></span>`).join('')}</div>`, '', { bridge: 'where the knowledge goes' });
push(6, `<div><p class="kick">what next · the new body</p><h2>the knowledge<br><em>moves to soft3.</em></h2><p class="lead">space-pussy was the playground; soft3 is the protocol it played with. the same graph, the same balances continue on a stack that proves every computation and keeps every proof.</p><div class="ctas"><a class="btn" href="/balance">check your balance</a><a class="btn ghost" href="https://cyber.page/launch/" target="_blank" rel="noopener">the launch</a><a class="btn ghost" href="https://soft3.org" target="_blank" rel="noopener">soft3</a><a class="btn ghost" href="https://cyb.ai" target="_blank" rel="noopener">cyb · the robot</a></div></div><div class="links"><a href="https://cyber.page/bootloader/tokens/$pussy/" target="_blank" rel="noopener"><b>cyber.page</b><span>the book: $PUSSY</span></a><a href="https://github.com/cyberia-to/space-pussy" target="_blank" rel="noopener"><b>github</b><span>the chain, the snapshot, this site</span></a><a href="https://bostrom.network" target="_blank" rel="noopener"><b>bostrom.network</b><span>the bootloader, reborn at 13:22:42</span></a><a href="/snapshot"><b>the burial</b><span>the final snapshot page and its datasets</span></a><a href="https://t.me/cyber" target="_blank" rel="noopener"><b>telegram</b><span>the community chat</span></a><a href="https://x.com/cyber_devs" target="_blank" rel="noopener"><b>x</b><span>updates</span></a></div><p class="fine">measured · target · mock — every number wears the word its source carries. the dead chain's numbers are measured; the new body's are pinned in its spec.</p>`, 'ink', { id: 'next' });

/* ------------------------------------------------------------------ build */
const deck = $('#deck'), segs = $('#segs');
S.forEach((s, i) => deck.appendChild(el(`<section class="slide ch${s.ch} ${s.cls || ''}" data-i="${i}" data-ch="${String(s.ch + 1).padStart(2, '0')}" ${s.id ? `id="${s.id}"` : ''} style="--c:${CH[s.ch].c}"><div class="body">${s.html}</div>${s.bridge ? `<p class="bridge">→ ${esc(s.bridge)}</p>` : ''}</section>`)));
CH.forEach((c, i) => { const d = el(`<div class="seg" style="--sc:${c.c}" data-ch="${i}"><div class="fill"></div><span class="lab">${String(i + 1).padStart(2, '0')} ${c.name}</span></div>`); d.addEventListener('click', () => go(S.findIndex((s) => s.ch === i))); segs.appendChild(d); });
$('#nslides').textContent = S.length;
let cur = -1;
const fit = () => {
  const sl = document.querySelectorAll('.slide')[cur]; if (!sl) return;
  const body = sl.querySelector('.body');
  Object.assign(body.style, { transform: '', width: '', height: '', maxHeight: '', margin: '' }); sl.classList.remove('tight', 'tighter', 'scaled');
  const availW = body.clientWidth, availH = body.clientHeight;
  const over = () => body.scrollHeight > availH + 1 || body.scrollWidth > availW + 1;
  if (!over()) return;
  sl.classList.add('tight'); if (!over()) return;
  sl.classList.add('tighter'); if (!over()) return;
  let z = Math.min(availH / body.scrollHeight, availW / body.scrollWidth);
  sl.classList.add('scaled');
  for (let k = 0; k < 5; k++) {
    z = Math.max(.4, Math.floor(z * 100) / 100);
    Object.assign(body.style, { width: availW / z + 'px', height: availH / z + 'px', maxHeight: 'none', margin: '0', transform: `scale(${z})` });
    if (body.scrollHeight <= availH / z + 1 && body.scrollWidth <= availW / z + 1) break;
    z *= .96;
  }
};

let fitT = 0; const refit = () => { clearTimeout(fitT); fitT = setTimeout(fit, 40); };
addEventListener('resize', refit); addEventListener('orientationchange', refit); document.fonts?.ready.then(refit);

/* pages: /<chapter>[/<n>] */
const pathOf = (i) => { const ch = S[i].ch, k = S.filter((s, j) => s.ch === ch && j < i).length; return CH[ch].path + (k ? `/${k + 1}` : ''); };
const fromPath = (p) => { const parts = p.replace(/^\/+|\/+$/g, '').replace(/^(tokens|bootloader)/, 'canary').split('/'); const ch = parts[0] ? CH.findIndex((c) => c.id === parts[0]) : 0; if (ch < 0) return 0; const k = Math.max(1, parseInt(parts[1]) || 1); const idx = S.map((s, i) => s.ch === ch ? i : -1).filter((i) => i >= 0); return idx[Math.min(k, idx.length) - 1] ?? 0; };
const go = (i, push = true) => {
  i = Math.max(0, Math.min(S.length - 1, i)); if (i === cur) return;
  const dir = i > cur ? 1 : -1, prevCh = cur >= 0 ? S[cur].ch : -1; cur = i; deck.dataset.dir = dir;
  document.querySelectorAll('.slide').forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('left', k < i); });
  document.body.classList.toggle('ink', (S[i].cls || '').includes('ink')); document.body.className = document.body.className.replace(/\bch\d+\b/g, '').trim() + ' ch' + S[i].ch;
  const ch = S[i].ch, idx = S.filter((s, k) => s.ch === ch && k <= i).length, n = S.filter((s) => s.ch === ch).length;
  document.querySelectorAll('.seg').forEach((sg, k) => { sg.classList.toggle('cur', k === ch); sg.classList.toggle('done', k < ch); $('.fill', sg).style.width = k < ch ? '100%' : k === ch ? (idx / n * 100) + '%' : '0'; });
  sfx.move(dir, ch !== prevCh ? ch : null); if (navigator.vibrate) navigator.vibrate(8);
  graph.chapter(ch, S[i].cls || ''); graph.pulse();
  $('#pos').textContent = `${String(i + 1).padStart(2, '0')} / ${S.length}`;
  const p = pathOf(i); if (location.pathname !== p) { if (push) history.pushState({ i }, '', p); else history.replaceState({ i }, '', p); }
  requestAnimationFrame(() => requestAnimationFrame(fit));
};
window.deckGo = go; window.deckCount = () => S.length; window.deckFit = fit;
$('#prev').onclick = () => go(cur - 1); $('#next').onclick = () => go(cur + 1);
document.addEventListener('keydown', (e) => { if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || (e.target.tagName === 'BUTTON' && [' ', 'Enter'].includes(e.key))) return; if (['ArrowRight', ' ', 'PageDown', 'ArrowDown'].includes(e.key)) { e.preventDefault(); go(cur + 1); } if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); } if (e.key === 'Home') go(0); if (e.key === 'End') go(S.length - 1); });
let wheelLock = 0; document.addEventListener('wheel', (e) => { const sc = e.target.closest('.checker'); if (sc && sc.scrollHeight > sc.clientHeight + 4) { const top = sc.scrollTop <= 0, bot = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2; if (!(e.deltaY > 0 && bot) && !(e.deltaY < 0 && top)) return; } const t = Date.now(); const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (t - wheelLock < 700 || Math.abs(d) < 24) return; wheelLock = t; go(cur + (d > 0 ? 1 : -1)); }, { passive: true });
let tx = null, ty = 0; document.addEventListener('touchstart', (e) => { tx = e.target.closest('input, textarea') ? null : e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; if (Math.abs(dx) < 48 && Math.abs(dy) < 48) return; const sc = e.target.closest('.checker'); if (sc && Math.abs(dy) > Math.abs(dx) && sc.scrollHeight > sc.clientHeight + 4) { const top = sc.scrollTop <= 0, bot = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2; if (!(dy < 0 && bot) && !(dy > 0 && top)) return; } if (Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1)); else go(cur + (dy < 0 ? 1 : -1)); tx = null; });
document.addEventListener('click', (e) => { const a = e.target.closest('a[href^="/"]'); if (!a || a.target === '_blank') return; const p = a.getAttribute('href'); if (!/^\/(rebirth|balance|story|canary|bootloader|tokens|graph|next)?(\/\d+)?$/.test(p)) return; e.preventDefault(); go(fromPath(p)); });
addEventListener('popstate', () => go(fromPath(location.pathname), false));
document.addEventListener('pointerdown', (e) => { sfx.wake(); if (e.target.closest('button, a, .seg, .tab')) sfx.tick(); }, { passive: true });
document.addEventListener('keydown', () => sfx.wake(), { once: true });
/* music: the portal ambient of the old cat app. on by default; browsers allow sound only after a gesture, so it starts on the first touch or key */
const music = (() => { const a = new Audio('/music/portal.mp3'); a.loop = true; a.preload = 'auto'; a.volume = .5; let on = localStorage.getItem('pussy.music') !== 'off', armed = false; const btn = $('#music');
  const paint = () => { btn.textContent = (on && !a.paused ? '❚❚' : '▶') + ' portal'; btn.classList.toggle('off', !on); btn.title = 'portal · ' + (on ? (a.paused ? 'tap anywhere to start' : 'playing') : 'play'); };
  const play = () => a.play().then(paint).catch(paint);
  btn.onclick = (e) => { e.stopPropagation(); on = !on; localStorage.setItem('pussy.music', on ? 'on' : 'off'); if (on) play(); else { a.pause(); paint(); } };
  const arm = () => { if (on && a.paused && !armed) { armed = true; play(); } };
  document.addEventListener('pointerdown', arm, { passive: true }); document.addEventListener('keydown', arm); document.addEventListener('touchstart', arm, { passive: true });
  a.addEventListener('play', paint); a.addEventListener('pause', paint); if (on) play(); paint(); return { get on() { return on; } }; })();
const sndBtn = $('#snd'); const sndPaint = () => { sndBtn.textContent = sfx.on ? '◉ sound' : '○ sound'; sndBtn.classList.toggle('off', !sfx.on); }; sndBtn.onclick = () => { sfx.toggle(); sndPaint(); }; sndPaint();
if (matchMedia('(pointer:fine)').matches) { const dot = el('<div class="cur-dot"></div>'), ring = el('<div class="cur-ring"></div>'); document.body.append(dot, ring); let rx = 0, ry = 0, px = 0, py = 0; addEventListener('mousemove', (e) => { px = e.clientX; py = e.clientY; dot.style.transform = `translate(${px}px,${py}px)`; ring.classList.toggle('hot', !!e.target.closest('button, a, .seg, .tab, input, textarea')); }, { passive: true }); const lag = () => { rx += (px - rx) * .18; ry += (py - ry) * .18; ring.style.transform = `translate(${rx}px,${ry}px)`; requestAnimationFrame(lag); }; lag(); document.body.classList.add('has-cursor'); }

/* ------------------------------------------------------------------ the countdown: every .count on the page, and the hud */
(() => {
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const lt = $('#local-time'); if (lt) lt.textContent = `that is ${new Date(T0).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} your time.`;
  const tick = () => {
    const d = T0 - Date.now();
    const boxes = document.querySelectorAll('[data-count]');
    if (d <= 0) { boxes.forEach((b) => { b.classList.add('live'); b.innerHTML = '<div><b>live</b><span>the new body</span></div>'; }); $('#hud-clock').textContent = 'live'; return; }
    const s = Math.floor(d / 1000), D = Math.floor(s / 86400), H = Math.floor(s % 86400 / 3600), Mi = Math.floor(s % 3600 / 60), Se = s % 60;
    const html = `<div><b>${D}</b><span>days</span></div><div><b>${pad(H)}</b><span>hours</span></div><div><b>${pad(Mi)}</b><span>min</span></div><div><b>${pad(Se)}</b><span>sec</span></div>`;
    boxes.forEach((b) => { b.innerHTML = html; });
    $('#hud-clock').textContent = `${D}d ${pad(H)}:${pad(Mi)}:${pad(Se)}`;
    document.querySelectorAll('[data-days]').forEach((e) => { e.textContent = D > 0 ? `in ${D} day${D === 1 ? '' : 's'}` : 'today'; });
    setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
})();

/* ------------------------------------------------------------------ the balance checker — the snapshot app's logic, same data, same local derivation */
const GW = 'https://gateway.pinata.cloud/ipfs';
const CIDS = {
  'cyberlinks_indexed.csv.gz': 'QmQQ1Xz8edsEeGRwnvgA831Ve7bRjsqYfEESLSwGtEG2iX', 'balances.csv': 'QmPZJtShm1tQzzYc6aJMBFcV1YHoCxiKs5r29DVH5UF7Pc', 'holdings.jsonl': 'QmcxDahwm8hSwZdp8gBWhnBZx8BRBXKyaNkdviiynaFeYi', 'prices.json': 'QmR2hWtY2mYx27eAHeB1TdebDhSTU3h7s3WWN6gVCFb3e3', 'passports.jsonl': 'QmTvMKGSjB44arkBNwc8qdBWCEScj1PHCg4c4y2nj8r8nx', 'passports_by_owner.json': 'QmeySKGA4SAR9UDkpyv4dMZ5zC8STQqGuPSAd6Cdcrr6kc', 'pools.json': 'Qmb5gLZEx12vC6W4PkRR5PwnCp38t2GmzLpHZuQ272qo91', 'delegations.csv': 'QmZFu4fvS7BDr6Ny4FvJz4VpyjwWvVV2LgP6uLXWCq3dgw', 'validators.json': 'QmXK1mnpfo9o637YdthorAqtMPjcM1wBRorBYtUhnNzmZ4', 'pubkeys.csv': 'QmSHTTz46f87KYjY936SLwjdkExD1WN2QFKLnJ8bu6ANvz', 'supply.json': 'QmXPkBWZ6XkhQJxrFAfMVYnGDf4BL3Z67r1ceSPFCsaGhA', 'manifest.json': '',
};
const DESC = {
  'cyberlinks_indexed.csv.gz': 'the recovered cyberlink graph: 29,112 links of 48,370 — indexer below the prune height, block events above it', 'balances.csv': 'every holder of every denom — liquid bank balances', 'holdings.jsonl': 'per-account breakdown: liquid · delegated · per-pool (LP decomposed into underlying tokens)', 'prices.json': 'pussy rate per denom from snapshot pool reserves + pool compositions', 'passports_by_owner.json': 'owner address → passport nicknames', 'passports.jsonl': 'the passports minted on the cat', 'pools.json': '26 warp pools: reserves at halt', 'delegations.csv': 'delegator · validator · shares · pussy', 'validators.json': 'the 52 validators with metadata', 'pubkeys.csv': 'account public keys (for future claims)', 'supply.json': 'total supply per denom',
};
const V = '5';
const ipfsUrl = (f) => `${GW}/${CIDS[f]}/${f}`;
const localUrl = (f) => `/${f}?v=${V}`;
const fetchData = async (f) => { try { const r = await fetch(localUrl(f)); if (r.ok) return r; } catch { } return fetch(ipfsUrl(f)); };
const ORDER = ['cyberlinks_indexed.csv.gz', 'holdings.jsonl', 'prices.json', 'balances.csv', 'passports_by_owner.json', 'passports.jsonl', 'pools.json', 'delegations.csv', 'validators.json', 'pubkeys.csv', 'supply.json'];
let man = {};
const fmtB = (b) => { if (!b) return ''; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b > 1024 && i < 3) { b /= 1024; i++; } return b.toFixed(b < 10 && i > 0 ? 1 : 0) + u[i]; };
const renderFiles = () => { const tb = $('#files tbody'); if (!tb) return; tb.innerHTML = ORDER.map((f) => `<tr><td>${f}</td><td class="desc">${DESC[f] || ''}</td><td class="sz">${man[f] ? fmtB(man[f].bytes) : ''}</td><td><a href="${localUrl(f)}" download>download ↓</a><a class="ipfs" href="${ipfsUrl(f)}" title="permanent IPFS copy">ipfs</a></td></tr>`).join(''); $('#manlink').innerHTML = `manifest (sha256 of every file): <a href="${localUrl('manifest.json')}" style="color:var(--c)">manifest.json</a> · each ipfs link is &lt;CID&gt;/&lt;filename&gt; on any IPFS gateway`; };
renderFiles(); fetchData('manifest.json').then((r) => r.json()).then((m) => { man = m.files || {}; renderFiles(); }).catch(() => { });

let mode = 'name';
document.querySelectorAll('#checker .tab').forEach((t) => t.onclick = () => { mode = t.dataset.m; document.querySelectorAll('#checker .tab').forEach((x) => x.classList.toggle('on', x === t)); document.querySelectorAll('#checker [data-in]').forEach((d) => { d.hidden = d.dataset.in !== mode; }); $('#derived').textContent = ''; $('#bal').innerHTML = ''; $('#err').textContent = ''; refit(); });
['pname', 'addr', 'priv'].forEach((id) => { const e = $('#' + id); if (e) e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('#go').click(); }); });
$('#clr').onclick = () => { ['pname', 'addr', 'mnem', 'priv'].forEach((id) => { const e = $('#' + id); if (e) e.value = ''; }); $('#derived').textContent = ''; $('#bal').innerHTML = ''; $('#err').textContent = ''; document.querySelectorAll('.slide.has-result').forEach((x) => x.classList.remove('has-result')); refit(); };
let LIB = null;
const libs = async () => { if (LIB) return LIB; const v = await import(`/vendor.js?v=${V}`); LIB = { bip39: v.bip39, bip32: v.bip32, secp: v.secp, sha: v.sha, rip: v.rip, base: v.base }; return LIB; };
const addrOf = async (compressedPub) => { const { sha, rip, base } = await libs(); const h = rip.ripemd160(sha.sha256(compressedPub)); return base.bech32.encode('pussy', base.bech32.toWords(h)); };
const twin = async (a) => { const { base } = await libs(); const d = base.bech32.decode(a, 90); return base.bech32.encode('pussy', d.words); };
const fromMnemonic = async (m) => { const { bip39, bip32, secp } = await libs(); const seed = await bip39.mnemonicToSeed(m.trim().replace(/\s+/g, ' ')); const hd = bip32.HDKey.fromMasterSeed(seed).derive("m/44'/118'/0'/0/0"); return addrOf(secp.secp256k1.getPublicKey(hd.privateKey, true)); };
const fromPriv = async (hex) => { const { secp, base } = await libs(); const pk = base.hex.decode(hex.trim().replace(/^0x/, '').toLowerCase()); return addrOf(secp.secp256k1.getPublicKey(pk, true)); };
const fromLedger = async () => { const tp = (await import('https://cdn.jsdelivr.net/npm/@ledgerhq/hw-transport-webusb@6.28.1/+esm')).default; const Cosmos = (await import('https://cdn.jsdelivr.net/npm/@ledgerhq/hw-app-cosmos@6.30.0/+esm')).default; const transport = await tp.create(); const app = new Cosmos(transport); const { address } = await app.getAddress("m/44'/118'/0'/0/0", 'pussy'); return address; };
let HOLD = null, PRICES = null, PASS = null, NICK = null;
const loadHoldings = async () => { if (HOLD) return HOLD; const [txt, pr, ps] = await Promise.all([fetchData('holdings.jsonl').then((r) => r.text()), fetchData('prices.json').then((r) => r.json()).catch(() => null), fetchData('passports_by_owner.json').then((r) => r.json()).catch(() => null)]); PRICES = pr; PASS = ps; HOLD = {}; for (const line of txt.split('\n')) { if (!line.trim()) continue; const r = JSON.parse(line); HOLD[r.address] = r.holdings; } return HOLD; };
const N = (x) => Number(x).toLocaleString('en-US'), NB = (x) => Number(Math.round(x)).toLocaleString('en-US');
const ORD = { PUSSY: 0, LP: 1, A: 2, V: 3, BOOT: 4, H: 5, TOCYB: 6, ATOM: 7, OSMO: 8 };
const poolName = (id) => { const p = PRICES && PRICES.pools && PRICES.pools[id]; return p ? `pool ${id} · ${p.labels.join('/')}` : `pool ${id}`; };
$('#go').onclick = async () => {
  const err = $('#err'), der = $('#derived'), bal = $('#bal'); err.textContent = ''; bal.innerHTML = ''; der.textContent = 'deriving…'; sfx.hash();
  try {
    let addr;
    if (mode === 'name') { const q = $('#pname').value.trim().toLowerCase(); if (!q) { der.textContent = ''; err.textContent = 'enter a passport name'; return; } der.textContent = 'looking up…'; await loadHoldings(); if (!NICK) { NICK = {}; for (const o in (PASS || {})) for (const n of PASS[o]) NICK[n.toLowerCase()] = o; } addr = NICK[q]; if (!addr) { der.textContent = ''; err.textContent = `passport "${q}" not found in the snapshot`; return; } }
    else if (mode === 'addr') { addr = $('#addr').value.trim(); if (addr.startsWith('bostrom1')) addr = await twin(addr); }
    else if (mode === 'mnem') addr = await fromMnemonic($('#mnem').value);
    else if (mode === 'priv') addr = await fromPriv($('#priv').value);
    else if (mode === 'ledger') addr = await fromLedger();
    if (!addr || !addr.startsWith('pussy1')) { der.textContent = ''; err.textContent = 'not a pussy address'; return; }
    der.textContent = addr; bal.innerHTML = '<p class="hint">loading snapshot holdings…</p>';
    const H = await loadHoldings(); const rec = H[addr];
    if (!rec) { bal.innerHTML = '<p class="hint">no holdings for this address in the snapshot.</p>'; refit(); return; }
    const rate = (d) => { const r = PRICES && PRICES.rates && PRICES.rates[d]; return r > 0 ? r : null; };
    const tok = {};
    for (const d in rec) { const h = rec[d], L = h.label; const t = tok[L] || (tok[L] = { rate: null, liquid: 0, delegated: 0, undelegating: 0, pools: {}, total: 0, boot: 0, priced: true }); for (const k of ['liquid', 'delegated', 'undelegating', 'total']) t[k] += h[k]; for (const id in h.pools) t.pools[id] = (t.pools[id] || 0) + h.pools[id]; const r = rate(d); if (r !== null) { t.boot += h.total * r; if (t.rate === null) t.rate = r; } else if (h.total > 0) t.priced = false; }
    const labels = Object.keys(tok).sort((a, b) => (ORD[a] ?? 99) - (ORD[b] ?? 99) || (tok[b].total - tok[a].total));
    const est = (v) => v === null ? '–' : NB(v);
    let grand = 0, unpriced = false;
    const rows = labels.map((L) => { const t = tok[L]; grand += t.boot; if (!t.priced) unpriced = true; const r = t.rate; const subs = [['liquid', 'liquid'], ['delegated', 'delegated'], ['undelegating', 'undelegating']].filter(([k]) => t[k] > 0).map(([k, lab]) => `<div class="sub"><span class="lbl">${lab}</span><span class="amt">${N(t[k])}</span><span class="est">${r ? est(t[k] * r) : ''}</span></div>`); for (const id of Object.keys(t.pools).sort((a, b) => t.pools[b] - t.pools[a])) if (t.pools[id] > 0) subs.push(`<div class="sub"><span class="lbl">${poolName(id)}</span><span class="amt">${N(t.pools[id])}</span><span class="est">${r ? est(t.pools[id] * r) : ''}</span></div>`); const tokEst = t.priced || t.boot > 0 ? est(t.boot) : '–'; return `<div class="tk"><div class="trow"><span class="d">${esc(L)}</span><span class="amt">${N(t.total)}</span><span class="est">${tokEst}</span></div><div class="subs">${subs.join('')}</div></div>`; }).join('');
    const hero = `<div class="hero">${NB(grand)}${unpriced ? ' +' : ''}<span class="unit">PUSSY</span></div><div class="hero-sub">total swap value · warp prices at halt</div>`;
    const nicks = PASS && PASS[addr]; const passline = nicks && nicks.length ? `<div class="passline">passport${nicks.length > 1 ? 's' : ''}: ${nicks.map((n) => `<b>${esc(n)}</b>`).join(' · ')}</div>` : '';
    bal.innerHTML = hero + passline + `<div class="bal-grid">` + rows + `</div><p class="hint">tap a token for liquid · delegated · pools</p>`;
    bal.querySelectorAll('.trow').forEach((r) => r.addEventListener('click', () => { r.parentElement.classList.toggle('open'); refit(); }));
    document.querySelectorAll('.slide')[cur].classList.add('has-result'); sfx.chord(2); refit();
  } catch (e) { der.textContent = ''; err.textContent = String(e.message || e); }
};

/* ------------------------------------------------------------------ the graph behind everything: the real bostrom sample from graph.json, drawn as the chapter's colour */
const graph = (() => {
  const cv = $('#graph'), ctx = cv.getContext('2d'); let W = 0, H = 0, hue = COLS[0], pulse = 0, full = false, data = null, t0 = performance.now();
  const resize = () => { W = cv.width = innerWidth * devicePixelRatio; H = cv.height = innerHeight * devicePixelRatio; }; addEventListener('resize', resize); resize();
  const synth = () => { const nodes = [], links = []; for (let i = 0; i < 400; i++) nodes.push(['s', 1 + Math.floor(Math.random() * 30), Math.random(), Math.random()]); for (let i = 1; i < 400; i++) links.push([i, Math.floor(Math.pow(Math.random(), 2.2) * i)]); return { nodes, links }; };
  fetch('/graph.json').then((r) => r.ok ? r.json() : synth()).catch(synth).then((d) => { data = d; const mx = Math.max(...d.nodes.map((n) => n[1])); d.nodes.forEach((n) => { n.r = .6 + 2.6 * Math.sqrt(n[1] / mx); n.ph = Math.random() * 6.28; }); });
  const tick = () => {
    ctx.clearRect(0, 0, W, H);
    if (data) {
      const t = (performance.now() - t0) / 1000, dpr = devicePixelRatio, pad = full ? .04 : .08, sx = W * (1 - 2 * pad), sy = H * (1 - 2 * pad);
      const X = (n) => W * pad + n[2] * sx + Math.sin(t * .3 + n.ph) * 2 * dpr, Y = (n) => H * pad + n[3] * sy + Math.cos(t * .27 + n.ph) * 2 * dpr;
      ctx.lineWidth = (full ? .9 : .6) * dpr; ctx.strokeStyle = hue; ctx.globalAlpha = (full ? .22 : .1) + pulse * .25; ctx.beginPath();
      for (const [i, j] of data.links) { const a = data.nodes[i], b = data.nodes[j]; ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); } ctx.stroke();
      for (const n of data.nodes) { const big = n.r > 2; ctx.globalAlpha = (full ? .55 : .3) + (big ? .4 : 0) + pulse * .3; ctx.fillStyle = big ? '#fff' : hue; ctx.beginPath(); ctx.arc(X(n), Y(n), n.r * dpr * (full ? 1.3 : 1) * (1 + pulse * .6), 0, 6.283); ctx.fill(); }
    }
    ctx.globalAlpha = 1; pulse *= .95; requestAnimationFrame(tick);
  };
  tick();
  return { chapter(c, cls) { hue = COLS[c]; full = c === 5; cv.style.opacity = cls.includes('ink') ? '.18' : full ? '1' : '.85'; }, pulse() { pulse = Math.max(pulse, .8); } };
})();

go(fromPath(location.pathname), false);
})();
