'use strict';

const $ = id => document.getElementById(id);
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const freshState = () => ({ quarter: 0, budget: 120, congestion: 62, eco: 48, economy: 55, approval: 55, water: 60, floodRisk: 35, factions: { auto: 50, tech: 60, mafia: 55, tanker: 55, residents: 50 }, flags: {}, pending: [], decisions: [], flood: false, protest: false, strike: false, gameOver: false });
let G = freshState();
let started = false;
let activeCard = null;
let queue = [];
let world = null;
const factions = { auto: ['AUTO UNION', '#ffb020'], tech: ['TECH BROS', '#00e5ff'], mafia: ['BUILDER MAFIA', '#ff3b5c'], tanker: ['TANKER SYNDICATE', '#60a5fa'], residents: ['LOCAL RESIDENTS', '#34d399'] };

const sound = {
  ctx: null, enabled: true, master: null,
  start() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.25 : 0;
        this.master.connect(this.ctx.destination);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 160;
        const gain = this.ctx.createGain(); gain.gain.value = 0.08;
        filter.connect(gain).connect(this.master);
        [55, 55.3, 82.4].forEach(f => {
          const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
          o.connect(filter); o.start();
        });
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.08;
        const depth = this.ctx.createGain(); depth.gain.value = 70;
        lfo.connect(depth).connect(filter.frequency); lfo.start();
      }
      this.ctx.resume().catch(() => {});
    } catch { this.enabled = false; }
  },
  tone(f = 800, duration = 0.1, type = 'sine') {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + duration);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master); o.start(); o.stop(t + duration);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  },
  alarm() { [55, 130.8, 155.6, 196].forEach(f => this.tone(f, 1.6, 'sawtooth')); },
  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.25 : 0;
    $('btn-audio').textContent = this.enabled ? '♪' : '×';
    $('btn-audio').setAttribute('aria-pressed', String(this.enabled));
  }
};

function option(label, cost, detail, changes, extra = {}) { return { label, cost, detail, changes, ...extra }; }
function card(id, title, body, options, intel = 'Forecasts are modeled, not guarantees. Every figure here belongs to a fictional civic simulation.') { return { id, title, body, options, intel }; }
const policies = [
  card('drain', 'THE RAJAKALUVE REMEMBERS', 'A developer has built across a storm-water drain near Ecospace. Their liaison arrives with a donation. The monsoon arrives without an appointment.', [
    option('Send the bulldozers', 35, 'Clear the drain. Protect the corridor. Builder standing becomes 0%.', { eco: 10, approval: 7, floodRisk: -35 }, { flag: 'drainClear', standing: { mafia: 0 }, reaction: ['mafia', 'Our lawyers will be in touch. All of them.'] }),
    option('Accept the development contribution', -35, 'Gain ₹35 CR now. Flooding hits in exactly three quarters.', { economy: 8, eco: -8, floodRisk: 50 }, { risky: true, event: ['flood', 3], reaction: ['mafia', 'A visionary planner. A very flexible definition of a drain.'] })
  ], 'INTEL / Drain clearance prevents the delayed ORR flood. Ignoring it schedules inundation at Q4.'),
  card('water', 'THE LAST TANKER', 'Panathur apartments have run dry. Piped water is five years away. A tanker now costs more than a family holiday.', [
    option('Cap tanker prices', 0, 'Approval +18. The syndicate will strike next quarter.', { approval: 18, water: 8 }, { event: ['strike', 1], standing: { tanker: 5 }, reaction: ['residents', 'For once, the city is on our side. Will the trucks still come?'] }),
    option('Let the market decide', -12, 'Revenue +12. Approval −14. Protests next quarter.', { approval: -14, water: -10 }, { risky: true, event: ['protest', 1], reaction: ['tanker', 'Scarcity is not a bug. It is our business model.'] }),
    option('Contract a public emergency fleet', 26, 'Water +24, approval +6. Public delivery capacity persists.', { water: 24, approval: 6 }, { flag: 'publicWater', reaction: ['residents', 'A blue truck without a cash negotiation. Unprecedented.'] })
  ]),
  card('techpark', 'ONE MILLION MORE BADGES', 'A new tech campus promises jobs, tax revenue, and 30,000 commuters. Its footprint includes one of the last green buffers.', [
    option('Approve the glass cathedral', -24, 'Economy +18. Congestion +12. Trees become concrete; sewage arrives in two quarters.', { economy: 18, congestion: 12, eco: -12, water: -8 }, { risky: true, flag: 'techPark', event: ['sewage', 2], reaction: ['tech', 'New campus, same commute. At least the cafeteria has kombucha.'] }),
    option('Approve a smaller transit-first campus', 18, 'Economy +10, congestion −6. Reuse brownfield land.', { economy: 10, congestion: -6, eco: 3 }, { flag: 'greenCampus', reaction: ['mafia', 'You want fewer parking spaces than employees? Radical.'] }),
    option('Keep the green buffer', 5, 'Ecology +14, water +6. Economy −4.', { eco: 14, water: 6, economy: -4 }, { reaction: ['residents', 'The trees do not pay property tax. They do keep us alive.'] })
  ]),
  card('transit', 'THE BUS HAS RIGHT OF WAY', 'A dedicated ORR bus lane could move thousands. The Auto Union wants feeder contracts; the car owners want another lane.', [
    option('Bus priority + auto feeder contracts', 25, 'Congestion −20, ecology +7. Auto standing +15.', { congestion: -20, eco: 7, approval: 5 }, { flag: 'transit', faction: { auto: 15 }, reaction: ['auto', 'Last-mile contracts? Now we are talking, boss.'] }),
    option('Widen the road', 12, 'Congestion −10 now. Induced traffic returns in two quarters; trees are cut.', { congestion: -10, eco: -10 }, { flag: 'treeCut', event: ['induced', 2], reaction: ['tech', 'One more lane should fix it. We said that last time too.'] }),
    option('Stagger office shifts', 0, 'Congestion −8. Economy −3; no construction required.', { congestion: -8, economy: -3 }, { reaction: ['tech', 'The 7 a.m. stand-up is now an urban planning policy.'] })
  ]),
  card('lake', 'A LAKE IS NOT A LANDFILL', 'White foam crosses Bellandur Road. A laboratory report identifies untreated effluent. The industry association asks for another extension.', [
    option('Build treatment wetlands', 28, 'Ecology +22, water +10. Cleaner water persists.', { eco: 22, water: 10 }, { flag: 'wetlands', reaction: ['residents', 'Today the lake smells less like a chemistry practical.'] }),
    option('Enforce discharge limits', 8, 'Ecology +12. Economy −5.', { eco: 12, economy: -5 }, { reaction: ['mafia', 'Compliance has a cost. We prefer someone else pays it.'] }),
    option('Extend the exemptions', -15, 'Gain ₹15 CR. Ecology −16. More sewage in one quarter.', { eco: -16, economy: 5 }, { risky: true, event: ['sewage', 1], reaction: ['residents', 'The lake has a new color. None of us voted for it.'] })
  ]),
  card('housing', 'WHO GETS TO STAY?', 'Rents along the corridor are climbing faster than salaries. A mixed-income housing plan competes with luxury towers.', [
    option('Fund homes near jobs', 22, 'Approval +14, congestion −8. Residents standing +12.', { approval: 14, congestion: -8 }, { faction: { residents: 12 }, reaction: ['residents', 'Living near work should not require a founder exit.'] }),
    option('Auction luxury development rights', -28, 'Economy +8. Approval −10; water −8.', { economy: 8, approval: -10, water: -8 }, { risky: true, faction: { mafia: 15 }, reaction: ['mafia', 'Affordable housing, for a sufficiently expansive definition of affordable.'] })
  ]),
  card('recharge', 'THE GROUND IS EMPTY', 'Borewells are chasing groundwater deeper every month. The ward needs rainwater harvesting, not another drilling contest.', [
    option('Retrofit rooftop harvesting', 18, 'Water +22, ecology +8. Recharge persists.', { water: 22, eco: 8 }, { flag: 'recharge', reaction: ['tanker', 'You are turning perfectly good demand into rainwater.'] }),
    option('Subsidize deeper borewells', 8, 'Water +14 now. Aquifer depletion in two quarters.', { water: 14, eco: -5 }, { risky: true, event: ['aquifer', 2], reaction: ['residents', 'The drill keeps going. Nobody knows where it stops.'] }),
    option('Ration by household', 0, 'Water +6. Approval −5.', { water: 6, approval: -5 }, { reaction: ['residents', 'We can share a shortage, if the penthouses share it too.'] })
  ]),
  card('audit', 'FOLLOW THE RECEIPTS', 'A procurement audit finds duplicate invoices. Recover the money, negotiate a settlement, or make the file disappear.', [
    option('Publish every contract', 5, 'Recover ₹22 CR next quarter. Approval +9; builders −15.', { approval: 9 }, { event: ['auditRefund', 1], faction: { mafia: -15 }, reaction: ['residents', 'A spreadsheet has never felt so revolutionary.'] }),
    option('Accept a settlement', -12, 'Gain ₹12 CR. Approval −3.', { approval: -3 }, { reaction: ['mafia', 'Let us resolve this quietly, in the public interest.'] }),
    option('Bury the audit', -24, 'Gain ₹24 CR. Scandal breaks in two quarters.', { economy: 3 }, { risky: true, event: ['scandal', 2], reaction: ['tech', 'The transparency portal is suspiciously offline.'] })
  ]),
  card('metro', 'THE MISSING LAST MILE', 'A transit interchange is ready. Getting across the junction still requires sprinting through six lanes.', [
    option('Accessible walks + feeder buses', 20, 'Congestion −16, approval +8, ecology +5.', { congestion: -16, approval: 8, eco: 5 }, { flag: 'transit', reaction: ['auto', 'We connect the station to the street. Give us a place to stop.'] }),
    option('Build a parking structure', 8, 'Economy +6. Congestion +6.', { economy: 6, congestion: 6 }, { reaction: ['tech', 'Now there is a queue to park before the queue to commute.'] }),
    option('Paint crossings and enforce speeds', 3, 'Approval +5, congestion −5.', { approval: 5, congestion: -5 }, { reaction: ['residents', 'Paint is not infrastructure, but enforcement helps.'] })
  ]),
  card('heat', 'FORTY DEGREES IN THE SHADE', 'Heat pools above concrete. Outdoor workers and residents without cooling are paying the price.', [
    option('Shade corridors and public cool rooms', 16, 'Ecology +12, approval +10. Restore cut green zones.', { eco: 12, approval: 10 }, { flag: 'restoreTrees', reaction: ['auto', 'A shaded stand is better than another app update.'] }),
    option('Cool-roof rebates', 8, 'Ecology +7, approval +5.', { eco: 7, approval: 5 }, { reaction: ['residents', 'A little less heat. A little less electricity debt.'] }),
    option('Issue a weather advisory', 0, 'Approval −8, ecology −3.', { approval: -8, eco: -3 }, { risky: true, reaction: ['residents', 'We were already aware that it is hot.'] })
  ]),
  card('budget', 'THE LAST BIG ALLOCATION', 'The city has survived your experiments. The remaining funds can strengthen its weakest system, or chase one final headline.', [
    option('Resilience reserve', 18, 'Water +10, ecology +8, approval +6.', { water: 10, eco: 8, approval: 6 }, { reaction: ['residents', 'Boring infrastructure. Beautifully boring infrastructure.'] }),
    option('Small-business recovery grants', 15, 'Economy +16, approval +5.', { economy: 16, approval: 5 }, { reaction: ['tech', 'Not every startup is an app. Some sell breakfast.'] }),
    option('Maintain existing services', 0, 'Approval +2. Preserve cash for the final quarter.', { approval: 2 }, { reaction: ['auto', 'No ribbon cutting? Just a working city? We can live with that.'] })
  ]),
  card('mandate', 'THE CITY REMEMBERS', 'Three years of choices are now written into roads, water, and public trust. Your final order sets the tone for the next administration.', [
    option('Hand over an open civic ledger', 4, 'Approval +10. Economy +3.', { approval: 10, economy: 3 }, { reaction: ['residents', 'Leave the records. We will hold the next planner to them.'] }),
    option('Fund neighborhood maintenance', 12, 'Ecology +8, congestion −6, approval +6.', { eco: 8, congestion: -6, approval: 6 }, { reaction: ['auto', 'Fix the street, not just the presentation.'] }),
    option('Close the books', 0, 'Keep the remaining budget intact.', {}, { reaction: ['tech', 'The quarterly report is finally not a disaster deck.'] })
  ])
];

const events = {
  flood: { title: 'ORR FLOODING', changes: { congestion: 22, economy: -18, approval: -12, water: -10 }, fire() { G.flood = true; }, response: () => card('flood-response', 'THE CORRIDOR IS UNDERWATER', 'Three quarters ago, the drain became a development opportunity. Today, the tech parks are islands.', [option('Pump, evacuate and clear the drain', 24, 'End flooding. Congestion −14, approval +8; drain restored.', { congestion: -14, approval: 8, floodRisk: -85 }, { flag: 'drainClear', clear: 'flood' }), option('Keep offices remote; wait for recession', 0, 'Economy −8. Water recedes next quarter.', { economy: -8 }, { event: ['recede', 1] })]) },
  strike: { title: 'TANKER STRIKE / WATER AT ZERO', changes: {}, fire() { G.strike = true; G.water = 0; }, response: () => card('strike-response', 'NOT ONE BLUE TRUCK', 'The price cap is popular. The empty taps are not. The Tanker Syndicate has parked its fleet.', [option('Mobilize a public water fleet', 25, 'Water returns to 45%. Public supply continues.', { water: 45, approval: 4 }, { flag: 'publicWater', clear: 'strike' }), option('Negotiate a guaranteed minimum tariff', 8, 'Water returns to 35%. Approval −8.', { water: 35, approval: -8 }, { clear: 'strike', standing: { tanker: 65 } })]) },
  protest: { title: 'PANATHUR ROAD BLOCKADE', changes: { congestion: 14, approval: -6 }, fire() { G.protest = true; }, response: () => card('protest-response', 'THE STREET IS THE MEETING ROOM', 'Residents blocked the junction after another tanker price increase. Their demand is simple: water they can afford.', [option('Negotiate water vouchers', 14, 'End protest. Water +16, approval +10, congestion −10.', { water: 16, approval: 10, congestion: -10 }, { clear: 'protest' }), option('Divert traffic and wait', 0, 'Approval −5. Blockade dissolves in two quarters.', { approval: -5 }, { event: ['protestEnd', 2] })]) },
  sewage: { title: 'UNTREATED DISCHARGE DETECTED', changes: { eco: -12, water: -6 }, response: () => card('sewage-response', 'FOAM ON THE WATERLINE', 'Untreated campus discharge is feeding the lake. A cleanup order is waiting for your signature.', [option('Emergency treatment contract', 14, 'Ecology +15, water +5.', { eco: 15, water: 5 }), option('Leave it to the next administration', 0, 'Ecology −6. Lake fire starts below 25% ecology.', { eco: -6 }, { risky: true })]) },
  induced: { title: 'INDUCED DEMAND / LANES FULL AGAIN', changes: { congestion: 18, eco: -4 } },
  aquifer: { title: 'BOREWELLS FAIL / AQUIFER DEPLETED', changes: { water: -24, approval: -7, eco: -5 } },
  auditRefund: { title: 'AUDIT RECOVERS ₹22 CR', changes: {}, fire() { G.budget += 22; }, good: true },
  scandal: { title: 'PROCUREMENT FILE LEAKED', changes: { approval: -24, economy: -5 } },
  recede: { title: 'FLOODWATERS RECEDE', changes: { congestion: -12 }, fire() { G.flood = false; }, good: true },
  protestEnd: { title: 'BLOCKADE ENDS', changes: { congestion: -10 }, fire() { G.protest = false; }, good: true }
};

function apply(changes = {}) {
  for (const [key, value] of Object.entries(changes)) G[key] = clamp(G[key] + value);
}
function feed(who, text, crisis = false) {
  const item = document.createElement('div'); item.className = `feed-item ${crisis ? 'crisis' : who === 'system' ? 'sys' : ''}`;
  const name = document.createElement('div'); name.className = 'who'; name.textContent = `${factions[who]?.[0] || 'CIVIC OS'} / Q${G.quarter || 1}`;
  name.style.color = factions[who]?.[1] || '#ffd54a';
  const message = document.createElement('div'); message.className = 'txt'; message.textContent = text;
  item.append(name, message); $('feed').prepend(item);
  while ($('feed').children.length > 35) $('feed').lastChild.remove();
}
function toast(text, danger = false) {
  const el = document.createElement('div'); el.className = `toast${danger ? ' danger' : ''}`; el.textContent = text;
  $('toast-wrap').replaceChildren(el);
  setTimeout(() => el.remove(), 6500);
  if (danger) { sound.alarm(); $('stinger-flash').classList.remove('go'); void $('stinger-flash').offsetWidth; $('stinger-flash').classList.add('go'); }
}
function updateHUD() {
  const q = Math.max(1, G.quarter);
  $('turn-chip').textContent = `Q${(q - 1) % 4 + 1} · ${2027 + Math.floor((q - 1) / 4)} / ${q}/12`;
  $('budget-chip').textContent = `₹ ${G.budget.toFixed(1)} CR`;
  for (const key of ['congestion', 'eco', 'economy', 'approval']) {
    const el = $(`gauge-${key}`), value = Math.round(G[key]);
    const bad = key === 'congestion' ? value > 80 : value < 25;
    const color = bad ? '#ff3b5c' : key === 'eco' ? '#34d399' : key === 'economy' ? '#ffd54a' : '#00e5ff';
    el.querySelector('.g-num').textContent = value;
    el.querySelector('.g-val').style.strokeDashoffset = 257.6 * (1 - value / 100);
    el.querySelector('.g-val').style.stroke = color; el.classList.toggle('alarm', bad);
    el.querySelector('svg').setAttribute('aria-label', `${key}: ${value} percent`);
  }
  const aqi = Math.round(45 + G.congestion * 1.3 + (100 - G.eco) * 1.7);
  for (const [id, value, max] of [['water', G.water, 100], ['flood', G.floodRisk, 100], ['aqi', aqi, 400]]) {
    $(`${id}-num`).textContent = `${Math.round(value)}${id === 'aqi' ? '' : '%'}`;
    $(`${id}-fill`).style.width = `${clamp(value / max * 100)}%`;
    $(`${id}-fill`).style.background = id === 'water' ? '#60a5fa' : '#ffb020';
  }
  $('faction-bars').replaceChildren();
  for (const [id, [name, color]] of Object.entries(factions)) {
    const el = document.createElement('div'); el.className = 'f-row';
    el.innerHTML = `<span class="f-name">${name}</span><span class="f-bar"><span class="f-fill" style="width:${G.factions[id]}%;background:${color}"></span></span><span class="f-num">${G.factions[id]}</span>`;
    $('faction-bars').append(el);
  }
  $('intel-list').replaceChildren();
  for (const pending of G.pending) {
    const el = document.createElement('div'); el.className = 'intel-chip';
    el.textContent = `IN ${pending.q - G.quarter}Q / ${events[pending.key].title}`; $('intel-list').append(el);
  }
  if (!G.pending.length) $('intel-list').textContent = 'No scheduled cascades. Structural risks remain.';
  $('weather-line').textContent = `${q % 4 === 3 || G.flood ? 'MONSOON / HEAVY RAIN' : q % 4 === 2 ? 'PRE-MONSOON / HEAT' : 'DRY SEASON'} · ${G.flood ? 'FLOOD ACTIVE' : 'SYSTEM LIVE'}`;
  $('ticker').textContent = `BLR CIVIC WIRE  /  ${G.strike ? 'TANKER STRIKE' : G.flood ? 'ORR FLOOD EMERGENCY' : G.eco < 25 ? 'LAKE FIRE ALERT' : 'MARATHAHALLI LIVE'}  /  WATER ${Math.round(G.water)}%  /  ${Math.round(12 + G.congestion * 0.9)} MIN CORRIDOR COMMUTE  /  Decisions have consequences. The city remembers.`;
  $('advance-btn').disabled = !started || !!activeCard || G.gameOver;
  $('advance-btn').classList.toggle('armed', G.pending.some(e => e.q === G.quarter + 1));
  syncWorld();
}
function showCard(c) {
  activeCard = c;
  $('card-title').textContent = c.title; $('card-body').textContent = c.body;
  $('card-tag').textContent = c.id.includes('response') ? 'CASCADE RESPONSE' : 'POLICY DECISION';
  $('card-dossier').textContent = `WARD 12 / TURN ${G.quarter} / ₹${G.budget.toFixed(0)} CR`;
  $('card-intel').textContent = c.intel; $('card-intel').classList.toggle('hidden', !c.intel);
  $('card-options').replaceChildren();
  c.options.forEach((o, i) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = `card-opt${o.risky ? ' risky' : ''}`;
    const cost = document.createElement('span'); cost.className = 'o-cost'; cost.textContent = o.cost > 0 ? `−₹${o.cost} CR` : o.cost < 0 ? `+₹${-o.cost} CR` : 'NO COST';
    const label = document.createElement('div'); label.className = 'o-label'; label.textContent = `${i + 1}. ${o.label}`;
    const detail = document.createElement('div'); detail.className = 'o-detail'; detail.textContent = o.detail;
    btn.append(cost, label, detail); btn.onclick = () => choose(i); btn.onpointerenter = () => sound.tone(1600, 0.025);
    $('card-options').append(btn);
  });
  $('card-backdrop').classList.add('show'); $('policy-card').scrollTop = 0;
  lockBackground($('card-backdrop')); $('card-options').querySelector('button').focus(); updateHUD();
}
function choose(index) {
  if (!activeCard || G.gameOver) return;
  const o = activeCard.options[index]; if (!o) return;
  const oldEco = G.eco;
  G.budget -= o.cost; apply(o.changes);
  if (o.flag) G.flags[o.flag] = true;
  if (o.clear) G[o.clear] = false;
  if (o.event) G.pending.push({ key: o.event[0], q: G.quarter + o.event[1] });
  for (const [id, delta] of Object.entries(o.faction || {})) G.factions[id] = clamp(G.factions[id] + delta);
  Object.assign(G.factions, o.standing || {});
  if (o.reaction) feed(...o.reaction);
  G.decisions.push({ quarter: G.quarter, policy: activeCard.id, choice: o.label });
  feed('system', `${o.label} / ${o.cost > 0 ? 'spent' : 'received'} ₹${Math.abs(o.cost)} CR`);
  activeCard = null; sound.tone(990, 0.18, 'triangle');
  $('card-backdrop').classList.remove('show'); lockBackground(null);
  if (oldEco >= 25 && G.eco < 25) toast('ECOLOGY BELOW 25% / LAKE FIRE', true);
  if (collapse()) return;
  if (queue.length) { showCard(queue.shift()); return; }
  settleQuarter();
}
function collapse() {
  const reason = G.approval <= 0 ? 'A vote of no confidence ends your mandate.' : G.eco <= 0 ? 'Ecological collapse makes the ward uninhabitable.' : G.economy <= 0 ? 'The economic base has collapsed.' : G.congestion >= 100 ? 'Complete gridlock has paralyzed emergency services.' : G.budget < -40 ? 'The ward exceeded its ₹40 CR emergency credit line.' : '';
  if (reason) { finish(false, reason); return true; } return false;
}
function settleQuarter() {
  const income = Math.round(5 + G.economy * 0.14);
  G.budget += income;
  apply({ congestion: G.flags.transit ? -1 : 2, eco: G.flags.wetlands ? 1 : -1, water: G.flags.publicWater || G.flags.recharge ? 2 : -3, approval: G.water < 20 ? -7 : G.water > 70 ? 1 : 0 });
  if (G.flood) apply({ economy: -5, congestion: 3 });
  if (G.protest) apply({ approval: -2, congestion: 2 });
  if (G.strike) G.water = 0;
  if (G.eco < 25) apply({ approval: -3, economy: -2 });
  feed('system', `Quarter settled. Net tax revenue +₹${income} CR. ${G.flags.transit ? 'Transit is easing pressure.' : 'Traffic demand grows.'}`);
  updateHUD();
  if (collapse()) return;
  if (G.quarter === 12) { finish(true, 'Twelve quarters complete. Your choices have reshaped the ward.'); return; }
  $('advance-btn').focus();
}
function advance() {
  if (!started || G.gameOver || activeCard || $('help-modal').classList.contains('show')) return;
  G.quarter++; queue = [];
  const due = G.pending.filter(e => e.q <= G.quarter); G.pending = G.pending.filter(e => e.q > G.quarter);
  for (const e of due) {
    const event = events[e.key]; apply(event.changes); if (event.fire) event.fire();
    feed('system', event.title, !event.good); toast(event.title, !event.good);
    if (event.response) queue.push(event.response());
  }
  if (collapse()) return;
  queue.push(policies[G.quarter - 1]); showCard(queue.shift());
}
function finish(won, reason) {
  G.gameOver = true; activeCard = null; queue = [];
  $('card-backdrop').classList.remove('show');
  const score = Math.round((100 - G.congestion + G.eco + G.economy + G.approval + G.water) / 5);
  $('go-title').textContent = won ? 'MANDATE COMPLETE' : 'CIVIC COLLAPSE';
  $('go-title').style.color = won ? '#7df2d0' : '#ff5b78';
  $('go-rank').textContent = won ? score >= 70 ? 'THE CITY BUILDER' : score >= 45 ? 'THE SURVIVOR' : 'THE DAMAGE CONTROLLER' : 'SYSTEM OVERWHELMED';
  $('go-cause').textContent = `${reason} ${G.pending.length ? `${G.pending.length} unresolved cascades pass to the next administration.` : ''}`;
  $('go-stats').innerHTML = `<div>QUARTERS <b>${G.quarter}/12</b></div><div>CIVIC SCORE <b>${score}/100</b></div><div>DECISIONS <b>${G.decisions.length}</b></div><div>TREASURY <b>₹${G.budget.toFixed(0)} CR</b></div><div>ECOLOGY <b>${G.eco}%</b></div><div>APPROVAL <b>${G.approval}%</b></div>`;
  $('gameover-screen').classList.add('show'); updateHUD(); lockBackground($('gameover-screen')); $('restart-btn').focus();
  if (won) sound.tone(1046, 0.8, 'triangle'); else sound.alarm();
}
function startGame() {
  G = freshState(); queue = []; activeCard = null; started = true;
  $('intro-screen').classList.add('hidden'); $('gameover-screen').classList.remove('show'); $('card-backdrop').classList.remove('show');
  $('feed').replaceChildren(); $('toast-wrap').replaceChildren();
  lockBackground(null); sound.start();
  feed('system', 'Command transferred. Survive 12 quarters. Emergency credit limit: −₹40 CR.');
  feed('auto', 'Welcome to Marathahalli. Meter? We will discuss it.');
  updateHUD(); $('advance-btn').focus();
}
function lockBackground(modal) {
  for (const child of document.body.children) {
    if (child.tagName === 'SCRIPT') continue;
    child.inert = !!modal && child !== modal && child.id !== 'toast-wrap' && child.id !== 'stinger-flash';
  }
}

function initWorld() {
  if (!window.THREE) throw new Error('Three.js could not load. Connect to the internet and reload.');
  const T = window.THREE;
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x030910); renderer.outputColorSpace = T.SRGBColorSpace;
  $('scene-container').append(renderer.domElement); renderer.domElement.style.touchAction = 'none';
  const scene = new T.Scene(); scene.fog = new T.FogExp2(0x030910, 0.00065);
  const camera = new T.PerspectiveCamera(43, innerWidth / innerHeight, 1, 3500);
  scene.add(new T.AmbientLight(0x7bbed1, 1.1));
  const sun = new T.DirectionalLight(0x74dbff, 2); sun.position.set(-200, 500, 120); scene.add(sun);
  const redLight = new T.PointLight(0xff4318, 0, 650, 1); redLight.position.set(-280, 65, 40); scene.add(redLight);
  world = { T, renderer, scene, camera, sun, redLight, yaw: 0.35, pitch: 0.85, distance: 1100, time: 0, trafficPhase: 0, buildings: [], trees: [], tankers: [], paths: [], labels: [], floodLevel: 0 };
  const mesh = (geometry, color, x, y, z, opacity = 1) => {
    const obj = new T.Mesh(geometry, new T.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.4, transparent: opacity < 1, opacity }));
    obj.position.set(x, y, z); scene.add(obj); return obj;
  };
  const base = mesh(new T.BoxGeometry(1040, 14, 720), 0x071b27, 0, -10, 0);
  scene.add(new T.LineSegments(new T.EdgesGeometry(base.geometry), new T.LineBasicMaterial({ color: 0x236079 })).translateY(-10));
  const grid = new T.GridHelper(1200, 60, 0x12546b, 0x0b2c3a); grid.position.y = -2; scene.add(grid);
  for (const radius of [510, 535, 550]) {
    const ring = new T.Mesh(new T.RingGeometry(radius, radius + 0.6, 120), new T.MeshBasicMaterial({ color: 0x167287, transparent: true, opacity: 0.35, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -1; scene.add(ring);
  }
  let seed = 74;
  const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  function path(points, width, color = 0x153445) {
    const curve = new T.CatmullRomCurve3(points.map(([x, z]) => new T.Vector3(x, 0.5, z)));
    const pts = curve.getSpacedPoints(180), vertices = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const ox = -dz / len * width / 2, oz = dx / len * width / 2;
      vertices.push(a.x + ox, 0, a.z + oz, b.x + ox, 0, b.z + oz, a.x - ox, 0, a.z - oz, a.x - ox, 0, a.z - oz, b.x + ox, 0, b.z + oz, b.x - ox, 0, b.z - oz);
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    scene.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color, side: T.DoubleSide })));
    scene.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: 0x528594, dashSize: 4, gapSize: 6 })).computeLineDistances());
    world.paths.push(curve); return curve;
  }
  path([[-490, -110], [-250, -55], [-40, -20], [170, -5], [490, -80]], 20);
  path([[-400, -300], [-190, -185], [-40, -20], [90, 135], [220, 330]], 14);
  path([[-460, 240], [-230, 190], [90, 135], [460, 210]], 11);
  path([[200, -320], [170, -5], [90, 135], [40, 330]], 10);
  path([[-440, -245], [-180, -220], [160, -200], [480, -220]], 9);
  const drain = path([[280, -210], [210, -100], [220, 70], [350, 140]], 5, 0x146386);
  world.drain = drain;
  function building(x, z, w, d, h, tech = false, fresh = false) {
    const group = new T.Group(); group.position.set(x, 0, z); scene.add(group);
    const body = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color: tech ? 0x0b3a4b : 0x16303e, metalness: 0.55, roughness: 0.35 })); body.position.y = h / 2; group.add(body);
    const edges = new T.LineSegments(new T.EdgesGeometry(body.geometry), new T.LineBasicMaterial({ color: tech ? 0x35cbdc : 0x386b81, transparent: true, opacity: tech ? 0.8 : 0.45 })); edges.position.y = h / 2; group.add(edges);
    for (let y = 7; y < h; y += 8) {
      const floor = new T.Mesh(new T.BoxGeometry(w + 0.1, 0.7, d + 0.1), new T.MeshBasicMaterial({ color: tech ? 0x55ccdb : 0x96abb2, transparent: true, opacity: tech ? 0.55 : 0.25 })); floor.position.y = y; group.add(floor);
    }
    if (tech) { const beacon = new T.Mesh(new T.SphereGeometry(1.5, 6, 6), new T.MeshBasicMaterial({ color: 0x8fffff })); beacon.position.y = h + 2; group.add(beacon); }
    group.scale.y = fresh ? 0.001 : 1;
    world.buildings.push({ group, fresh });
  }
  for (const [cx, cz, count, tech] of [[145, -130, 18, true], [-70, -170, 20, false], [-180, 120, 26, false], [135, 230, 22, false], [340, -190, 17, true], [-330, -230, 16, false]]) {
    for (let i = 0; i < count; i++) building(cx + (rand() - 0.5) * 125, cz + (rand() - 0.5) * 90, 9 + rand() * 12, 10 + rand() * 14, (tech ? 25 : 8) + rand() * (tech ? 60 : 25), tech);
  }
  for (let i = 0; i < 7; i++) building(285 + i % 3 * 27, -5 + Math.floor(i / 3) * 30, 17, 19, 45 + rand() * 55, true, true);
  for (let i = 0; i < 115; i++) {
    const x = -60 + (rand() - 0.5) * 190, z = 220 + (rand() - 0.5) * 130;
    const tree = mesh(new T.ConeGeometry(3 + rand() * 2, 12, 5), 0x198b62, x, 5, z);
    world.trees.push(tree);
  }
  world.park = mesh(new T.BoxGeometry(205, 1, 150), 0x103a2b, -60, -0.3, 220);
  const lakeUniforms = { time: { value: 0 }, toxicity: { value: 0.6 } };
  world.lakeUniforms = lakeUniforms;
  const lakeMaterial = new T.ShaderMaterial({ uniforms: lakeUniforms, side: T.DoubleSide, vertexShader: `varying vec2 p; void main(){ p=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`, fragmentShader: `uniform float time; uniform float toxicity; varying vec2 p; float h(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);} float n(vec2 v){vec2 i=floor(v),f=fract(v); f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);} void main(){vec2 q=p*18.; float a=n(q+vec2(time*.16,0.));float b=n(q*3.+a*3.-time*.3);float foam=smoothstep(.6-toxicity*.48,.8-toxicity*.35,b);vec3 col=mix(vec3(.015,.18,.23),vec3(.03,.4,.43),a);col=mix(col,vec3(.84,.95,.92),foam*toxicity);float lines=pow(.5+.5*sin((p.y+a*.03)*160.+time),18.); col+=vec3(.05,.25,.28)*lines; gl_FragColor=vec4(col,1.);}` });
  for (const [x, z, rx, rz] of [[-315, 15, 115, 78], [400, 100, 74, 100]]) {
    const geo = new T.CircleGeometry(1, 70);
    const lake = new T.Mesh(geo, lakeMaterial); lake.rotation.x = -Math.PI / 2; lake.scale.set(rx, rz, 1); lake.position.set(x, 0.8, z); scene.add(lake);
    const shore = new T.Mesh(new T.RingGeometry(1, 1.025, 70), new T.MeshBasicMaterial({ color: 0x4ca1a5, side: T.DoubleSide })); shore.rotation.x = -Math.PI / 2; shore.scale.set(rx, rz, 1); shore.position.set(x, 0.5, z); scene.add(shore);
  }
  const dotCanvas = document.createElement('canvas'); dotCanvas.width = dotCanvas.height = 64;
  const ctx = dotCanvas.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.2, '#ffffff'); gradient.addColorStop(0.45, 'rgba(255,255,255,.35)'); gradient.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const texture = new T.CanvasTexture(dotCanvas);
  function particles(count, color, size) {
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3), 3));
    const object = new T.Points(geo, new T.PointsMaterial({ color, size, map: texture, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); object.frustumCulled = false; scene.add(object); return object;
  }
  world.traffic = particles(2400, 0xffb63a, 4);
  world.fire = particles(340, 0xff6c17, 18);
  world.protest = particles(90, 0xff3b6a, 6);
  world.rain = particles(500, 0x60b9d8, 1.8);
  for (let i = 0; i < 38; i++) {
    const group = new T.Group();
    const tank = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 4.6, 8), new T.MeshBasicMaterial({ color: 0x359af9 })); tank.rotation.x = Math.PI / 2; tank.position.y = 2; group.add(tank);
    const cab = new T.Mesh(new T.BoxGeometry(2.5, 2.5, 2), new T.MeshBasicMaterial({ color: 0x9fdfff })); cab.position.set(0, 1.5, 3); group.add(cab);
    scene.add(group); world.tankers.push(group);
  }
  world.flood = new T.Mesh(new T.PlaneGeometry(360, 240, 20, 20), new T.MeshBasicMaterial({ color: 0x159dca, transparent: true, opacity: 0.45, side: T.DoubleSide })); world.flood.rotation.x = -Math.PI / 2; world.flood.position.set(180, 0, 0); scene.add(world.flood);
  function label(text, x, y, z, color = '#9dc9d5') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64; const cc = c.getContext('2d');
    cc.fillStyle = 'rgba(3,12,20,.82)'; cc.fillRect(0, 0, 512, 64); cc.fillStyle = color; cc.font = '500 26px monospace'; cc.textAlign = 'center'; cc.fillText(text, 256, 41);
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthTest: false })); s.position.set(x, y, z); s.scale.set(135, 17, 1); scene.add(s); world.labels.push(s);
  }
  label('MARATHAHALLI', -35, 50, -35, '#f1ffff'); label('OUTER RING ROAD', -160, 9, -67, '#ffcc65');
  label('ECOSPACE', 170, 115, -120, '#70ecff'); label('PANATHUR', 160, 58, 240);
  label('BELLANDUR LAKE', -315, 13, 30, '#85e4d9'); label('VARTHUR LAKE', 400, 14, 125, '#85e4d9'); label('RAJAKALUVE', 255, 14, 100);
  let pointer = null;
  renderer.domElement.addEventListener('pointerdown', e => { pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    world.yaw -= (e.clientX - pointer.x) * 0.006; world.pitch = clamp(world.pitch + (e.clientY - pointer.y) * 0.004, 0.3, 1.3);
    pointer.x = e.clientX; pointer.y = e.clientY;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(name, () => { pointer = null; });
  renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); world.distance = clamp(world.distance + e.deltaY * 0.6, 500, 1900); }, { passive: false });
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); toast('Graphics context lost. Reload to restore the 3D view.', true); });
  syncWorld();
  const frameClock = new T.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(frameClock.getDelta(), 0.05);
    if (document.hidden) return;
    animateWorld(dt);
  });
}
function syncWorld() {
  if (!world) return;
  world.lakeUniforms.toxicity.value = clamp((80 - G.eco) / 65, 0, 1);
  world.traffic.material.color.set(G.congestion > 75 ? 0xff2749 : G.congestion > 45 ? 0xffb23d : 0x58f5c8);
  world.fire.visible = G.eco < 25; world.redLight.intensity = G.eco < 25 ? 35 : 0;
  world.protest.visible = G.protest; world.rain.visible = G.quarter % 4 === 3 || G.flood;
  world.park.material.color.set((G.flags.treeCut || G.flags.techPark) && !G.flags.restoreTrees ? 0x48565a : 0x103a2b);
  for (const tree of world.trees) {
    const cut = (G.flags.treeCut || G.flags.techPark) && !G.flags.restoreTrees;
    tree.material.color.set(cut ? 0x606569 : 0x198b62); tree.scale.y = cut ? 0.1 : 1;
  }
}
function animateWorld(dt) {
  const w = world, T = w.T;
  w.time += dt; w.lakeUniforms.time.value = w.time;
  const mobile = innerWidth < 821;
  const distance = w.distance * (mobile ? 1.35 : 1);
  w.camera.position.set(Math.sin(w.yaw) * Math.cos(w.pitch) * distance, Math.sin(w.pitch) * distance, Math.cos(w.yaw) * Math.cos(w.pitch) * distance);
  w.camera.lookAt(0, 0, mobile ? 40 : 0);
  const pace = Math.max(0.06, 1 - G.congestion / 105) * (G.flood ? 0.3 : 1);
  w.trafficPhase += dt * pace * 0.04;
  const positions = w.traffic.geometry.attributes.position;
  const p = new T.Vector3(), tangent = new T.Vector3();
  for (let i = 0; i < 600; i++) {
    const road = w.paths[i < 400 ? 0 : 1 + i % 4];
    const direction = i % 2 ? 1 : -1;
    for (let tail = 0; tail < 4; tail++) {
      const u = ((i * 0.6180339 + w.trafficPhase * direction - tail * 0.0009 * direction) % 1 + 1) % 1;
      road.getPointAt(u, p); road.getTangentAt(u, tangent);
      positions.setXYZ(i * 4 + tail, p.x - tangent.z * direction * 4, 1.4, p.z + tangent.x * direction * 4);
    }
  }
  positions.needsUpdate = true;
  w.tankers.forEach((tank, i) => {
    tank.visible = !G.strike && i < 8 + (100 - G.water) * 0.3;
    const road = w.paths[1 + i % 3]; const u = (i / 38 + w.time * 0.012) % 1;
    road.getPointAt(u, p); road.getTangentAt(u, tangent); tank.position.set(p.x + 3, 0, p.z); tank.rotation.y = Math.atan2(tangent.x, tangent.z);
  });
  w.buildings.forEach(b => { if (b.fresh) { const target = G.flags.techPark || G.flags.greenCampus ? 1 : 0.001; b.group.scale.y += (target - b.group.scale.y) * Math.min(1, dt * 1.5); } });
  w.floodLevel += ((G.flood ? 1 : 0) - w.floodLevel) * dt;
  w.flood.visible = w.floodLevel > 0.01; w.flood.scale.set(0.2 + w.floodLevel, 0.2 + w.floodLevel, 1); w.flood.position.y = 1 + w.floodLevel * 8 + Math.sin(w.time) * 0.3;
  const fire = w.fire.geometry.attributes.position;
  if (w.fire.visible) {
    for (let i = 0; i < fire.count; i++) {
      const life = (i * 0.173 + w.time * 0.4) % 1, angle = i * 2.39996;
      fire.setXYZ(i, -315 + Math.cos(angle) * (15 + i % 80), 2 + life * 55, 15 + Math.sin(angle) * (10 + i % 50));
    }
    fire.needsUpdate = true; w.fire.material.opacity = 0.65 + Math.sin(w.time * 11) * 0.15;
  }
  const protest = w.protest.geometry.attributes.position;
  if (w.protest.visible) { for (let i = 0; i < protest.count; i++) protest.setXYZ(i, 87 + Math.sin(i * 2.4) * (i % 22), 3 + Math.sin(w.time * 3 + i), 130 + Math.cos(i * 2.4) * (i % 18)); protest.needsUpdate = true; }
  const rain = w.rain.geometry.attributes.position;
  if (w.rain.visible) { for (let i = 0; i < rain.count; i++) rain.setXYZ(i, (i * 73 % 1000) - 500, 260 - (i * 17 + w.time * 150) % 260, (i * 43 % 680) - 340); rain.needsUpdate = true; }
  w.renderer.render(w.scene, w.camera);
}

$('start-btn').onclick = startGame;
$('restart-btn').onclick = startGame;
$('advance-btn').onclick = advance;
$('btn-audio').onclick = () => { sound.start(); sound.toggle(); };
let helpFocus = null;
$('btn-help').onclick = () => { helpFocus = document.activeElement; $('help-modal').classList.add('show'); lockBackground($('help-modal')); $('help-close').focus(); };
function closeHelp() { $('help-modal').classList.remove('show'); lockBackground(activeCard ? $('card-backdrop') : G.gameOver ? $('gameover-screen') : !started ? $('intro-screen') : null); helpFocus?.focus(); }
$('help-close').onclick = closeHelp;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('help-modal').classList.contains('show')) { closeHelp(); return; }
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toLowerCase() === 'm') sound.toggle();
  if ($('help-modal').classList.contains('show')) return;
  if (activeCard && /^[1-3]$/.test(e.key)) { e.preventDefault(); choose(Number(e.key) - 1); }
  if (e.code === 'Space' && !['BUTTON', 'SUMMARY'].includes(document.activeElement.tagName)) { e.preventDefault(); advance(); }
});
if (innerWidth > 820) { $('right-panel').open = true; document.querySelector('.faction-disclosure').open = true; }
try { initWorld(); } catch (error) {
  const warning = document.createElement('div'); warning.style.cssText = 'position:fixed;top:45%;left:30%;right:25%;color:#ffcf7a;font:16px monospace;';
  warning.textContent = `${error.message} Policy simulation is still available.`; $('scene-container').append(warning);
}
updateHUD(); lockBackground($('intro-screen')); $('start-btn').focus();
