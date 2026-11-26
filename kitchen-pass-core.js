// Kitchen Pass core: pure logic shared by the app and selftest.cjs (no DOM).
// Works a dinner backwards from the serve time: prep, preheat, fire, baste, pull, rest, serve.
// Finds oven clashes (two temperatures at once) and can solve them by finishing a dish early and holding it warm.
(function (root) {
  const MIN = 60000;

  // "3h30", "3:30", "210", "1h", "45m" -> minutes
  function parseDur(s) {
    s = String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return 0;
    let m = s.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m?)?$/);
    if (m) return Math.round(+m[1] * 60 + (+m[2] || 0));
    m = s.match(/^(\d+):(\d{1,2})$/);
    if (m) return +m[1] * 60 + +m[2];
    m = s.match(/^(\d+(?:\.\d+)?)m?(?:in)?$/);
    if (m) return Math.round(+m[1]);
    return NaN;
  }
  const fmtDur = min => {
    min = Math.round(min);
    if (min < 60) return min + ' min';
    return Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + String(min % 60).padStart(2, '0') : '');
  };
  const toC = f => Math.round((f - 32) * 5 / 9 / 5) * 5;
  const toF = c => Math.round((c * 9 / 5 + 32) / 5) * 5;
  const fmtTemp = (f, unit) => unit === 'C' ? toC(f) + '°C' : f + '°F';

  function clean(d) {
    const where = ['oven', 'stove', 'counter'].includes(d.where) ? d.where : 'oven';
    return {
      name: String(d.name || 'Dish').slice(0, 40),
      cook: Math.max(0, Math.min(24 * 60, Math.round(+d.cook || 0))),
      rest: Math.max(0, Math.min(240, Math.round(+d.rest || 0))),
      prep: Math.max(0, Math.min(240, Math.round(+d.prep || 0))),
      where,
      temp: where === 'oven' ? Math.max(150, Math.min(550, Math.round(+d.temp || 350))) : null,
      check: Math.max(0, Math.min(240, Math.round(+d.check || 0))),
      checkLabel: String(d.checkLabel || (where === 'stove' ? 'Stir' : 'Baste')).slice(0, 16),
    };
  }

  // Oven usage at any moment: distinct temperatures of the oven dishes cooking then.
  // A clash is a span where more temperatures are needed than there are ovens.
  function ovenClashes(items, ovens = 1) {
    const oven = items.filter(i => i.dish.where === 'oven' && i.dish.cook > 0);
    const cuts = [...new Set(oven.flatMap(i => [i.fireAt, i.pullAt]))].sort((a, b) => a - b);
    const out = [];
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k], b = cuts[k + 1];
      const on = oven.filter(i => i.fireAt < b && i.pullAt > a);
      const temps = [...new Set(on.map(i => i.dish.temp))];
      if (temps.length > ovens) {
        const last = out[out.length - 1];
        const names = on.map(i => i.dish.name);
        if (last && last.to === a && last.names.join() === names.join()) last.to = b;
        else out.push({ from: a, to: b, temps, names });
      }
    }
    return out;
  }

  function place(d, serve, hold) {
    const readyAt = serve - hold * MIN;
    const pullAt = readyAt - d.rest * MIN;
    const fireAt = pullAt - d.cook * MIN;
    return { dish: d, hold, readyAt, pullAt, fireAt, prepAt: fireAt - d.prep * MIN };
  }

  // opts: { ovens: 1, solve: false, preheat: 15 }
  function schedule(dishes, serve, opts = {}) {
    const ovens = opts.ovens || 1, preheat = opts.preheat == null ? 15 : opts.preheat;
    const list = dishes.map(clean);
    let items;
    if (!opts.solve) items = list.map(d => place(d, serve, 0));
    else {
      // ponytail: greedy, longest oven dish keeps its slot; each later one tries (1) finishing up to 1 h early and holding warm,
      // (2) sharing a nearby temperature (within 25°F) with a dish already in, (3) holding up to 3 h. Fine for a home dinner.
      const order = list.map((d, i) => i).sort((a, b) => (list[b].where === 'oven') - (list[a].where === 'oven') || list[b].cook - list[a].cook);
      const placed = [];
      const fits = it => !ovenClashes(placed.filter(Boolean).concat(it), ovens).length;
      const tryHolds = (d, max) => { for (let h = 0; h <= max; h += 5) { const it = place(d, serve, h); if (fits(it)) return it; } return null; };
      for (const i of order) {
        const d = list[i];
        let it = d.where !== 'oven' ? place(d, serve, 0) : tryHolds(d, 60);
        if (!it) {
          const near = [...new Set(placed.filter(p => p && p.dish.where === 'oven').map(p => p.dish.temp))]
            .filter(t => Math.abs(t - d.temp) <= 25).sort((a, b) => Math.abs(a - d.temp) - Math.abs(b - d.temp));
          for (const t of near) { const c = tryHolds(Object.assign({}, d, { temp: t }), 60); if (c && (!it || c.hold < it.hold)) { it = c; it.moved = d.temp; } }
        }
        if (!it) it = tryHolds(d, 180) || place(d, serve, 0);
        placed[i] = it;
      }
      items = placed;
    }
    const clashes = ovenClashes(items, ovens);

    const ev = [];
    const add = (t, kind, it, text) => ev.push({ t, kind, dish: it ? it.dish.name : null, text, idx: it ? items.indexOf(it) : -1 });
    for (const it of items) {
      const d = it.dish, where = d.where === 'oven' ? 'oven ' + d.temp + '°F' : d.where;
      if (d.prep) add(it.prepAt, 'prep', it, 'Prep ' + d.name + ' · ' + fmtDur(d.prep));
      if (d.cook) add(it.fireAt, 'fire', it, 'Fire ' + d.name + ' · ' + where + ' · ' + fmtDur(d.cook) + (it.moved ? (d.temp > it.moved ? ' · ' + (d.temp - it.moved) + '° hotter than the recipe, check early' : ' · ' + (it.moved - d.temp) + '° cooler than the recipe, check late') : ''));
      if (d.check && d.cook) for (let t = it.fireAt + d.check * MIN; t < it.pullAt - 2 * MIN; t += d.check * MIN) add(t, 'check', it, d.checkLabel + ' ' + d.name);
      if (d.cook) add(it.pullAt, 'pull', it, (d.where === 'oven' ? 'Pull ' : 'Off heat: ') + d.name + (d.rest ? ' · rest ' + fmtDur(d.rest) : ''));
      if (it.hold) add(it.readyAt, 'hold', it, 'Hold ' + d.name + ' warm, covered · ' + fmtDur(it.hold));
    }
    // preheat whenever the oven has to change temperature
    const fires = items.filter(i => i.dish.where === 'oven' && i.dish.cook).sort((a, b) => a.fireAt - b.fireAt);
    let cur = null, curEnd = -Infinity;
    for (const it of fires) {
      if (it.dish.temp !== cur || it.fireAt > curEnd + 30 * MIN) {
        if (preheat) {
          // one oven still busy with the last dish: change the dial as that dish comes out
          const busy = cur !== null && curEnd > it.fireAt - preheat * MIN;
          ev.push(busy ? { t: Math.min(curEnd, it.fireAt), kind: 'heat', dish: null, idx: -1, text: 'Oven ' + (it.dish.temp > cur ? 'up' : 'down') + ' to ' + it.dish.temp + '°F' }
            : { t: it.fireAt - preheat * MIN, kind: 'heat', dish: null, idx: -1, text: 'Preheat oven to ' + it.dish.temp + '°F' });
        }
        cur = it.dish.temp;
      }
      curEnd = Math.max(curEnd, it.pullAt);
    }
    ev.push({ t: serve, kind: 'serve', dish: null, idx: -1, text: 'Serve' });
    const rank = { pull: 0, heat: 1, prep: 2, hold: 3, fire: 4, check: 5, serve: 6 };
    ev.sort((a, b) => a.t - b.t || rank[a.kind] - rank[b.kind]);
    ev.forEach((e, i) => e.n = i + 1);
    const start = ev.length ? ev[0].t : serve;
    return { items, events: ev, clashes, start, serve };
  }

  // Serve time "HH:MM" -> the next such moment after `now` (today, or tomorrow if it has passed by > 1 h).
  function serveAt(hhmm, now) {
    const [h, m] = String(hhmm).split(':').map(Number);
    const d = new Date(now); d.setHours(h || 0, m || 0, 0, 0);
    if (d.getTime() < now - 60 * MIN) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const clock = (t, h24) => {
    const d = new Date(t); let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    if (h24) return String(h).padStart(2, '0') + ':' + m;
    const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return h + ':' + m + ' ' + ap;
  };
  const countdown = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
  };

  const b64 = s => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'); };
  const W = ['oven', 'stove', 'counter'];
  const encodeMenu = m => b64(JSON.stringify({ v: 1, s: m.serve, t: m.title || '', d: m.dishes.slice(0, 24).map(clean).map(d => [d.name, d.cook, d.rest, d.prep, W.indexOf(d.where), d.temp || 0, d.check, d.checkLabel]) }));
  function decodeMenu(s) {
    try {
      const o = JSON.parse(unb64(s));
      if (o.v !== 1 || !Array.isArray(o.d) || !/^\d{1,2}:\d{2}$/.test(o.s)) return null;
      return { serve: o.s, title: String(o.t || '').slice(0, 40), dishes: o.d.slice(0, 24).map(a => clean({ name: a[0], cook: a[1], rest: a[2], prep: a[3], where: W[a[4]], temp: a[5], check: a[6], checkLabel: a[7] })) };
    } catch { return null; }
  }

  const PRESETS = {
    thanksgiving: { title: 'Thanksgiving for 8', serve: '17:00', dishes: [
      { name: 'Turkey 14 lb', where: 'oven', temp: 325, cook: 210, rest: 40, prep: 20, check: 45, checkLabel: 'Baste' },
      { name: 'Stuffing', where: 'oven', temp: 375, cook: 40, rest: 0, prep: 20 },
      { name: 'Green beans', where: 'oven', temp: 350, cook: 25, rest: 0, prep: 15 },
      { name: 'Mashed potatoes', where: 'stove', cook: 25, rest: 0, prep: 20, check: 10, checkLabel: 'Stir' },
      { name: 'Gravy', where: 'stove', cook: 15, rest: 0, prep: 5, check: 5, checkLabel: 'Whisk' },
      { name: 'Rolls', where: 'oven', temp: 375, cook: 15, rest: 5, prep: 0 },
    ] },
    roast: { title: 'Sunday roast', serve: '13:30', dishes: [
      { name: 'Roast chicken', where: 'oven', temp: 400, cook: 80, rest: 15, prep: 15, check: 30, checkLabel: 'Baste' },
      { name: 'Roast potatoes', where: 'oven', temp: 425, cook: 50, rest: 0, prep: 15, check: 20, checkLabel: 'Turn' },
      { name: 'Carrots', where: 'stove', cook: 15, prep: 10 },
      { name: 'Gravy', where: 'stove', cook: 10, prep: 5, check: 5, checkLabel: 'Whisk' },
    ] },
    weeknight: { title: 'Weeknight pasta', serve: '19:30', dishes: [
      { name: 'Pasta water', where: 'stove', cook: 12, prep: 0 },
      { name: 'Spaghetti', where: 'stove', cook: 10, prep: 0, check: 3, checkLabel: 'Stir' },
      { name: 'Sauce', where: 'stove', cook: 20, prep: 10, check: 5, checkLabel: 'Stir' },
      { name: 'Garlic bread', where: 'oven', temp: 400, cook: 10, prep: 5 },
      { name: 'Salad', where: 'counter', cook: 0, prep: 10 },
    ] },
  };

  const api = { MIN, parseDur, fmtDur, toC, toF, fmtTemp, clean, ovenClashes, schedule, serveAt, clock, countdown, encodeMenu, decodeMenu, PRESETS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.KPCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
