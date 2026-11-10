// Refreshes league tables and upcoming fixtures from public BBC Sport pages.
// Fail-safe: if a page cannot be parsed or fails sanity checks, that part of data/ is left untouched.
// Hand-curated data (squad, injuries, history, results list) is never modified.
// Offline testing: DATA_DIR=<folder with pl.html, ucl.html, fix.html>
import { readFile, writeFile } from 'node:fs/promises';

const BASE = 'https://www.bbc.co.uk/sport/football/';
const PAGES = { pl: 'premier-league/table', ucl: 'champions-league/table', fix: 'teams/liverpool/scores-fixtures' };
const D = n => new URL(`../data/${n}.json`, import.meta.url);
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

async function lines(name) {
  const html = process.env.DATA_DIR
    ? await readFile(`${process.env.DATA_DIR}/${name}.html`, 'utf8')
    : await (await fetch(BASE + PAGES[name], { headers: { 'user-agent': 'liverbird-news/1.0' } })).text();
  const text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '\n')
    .replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&nbsp;', ' ');
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

function parseTable(L) {
  const start = L.indexOf('Played');
  if (start < 0) throw new Error('table header not found');
  const rows = [];
  for (let k = start; k < L.length - 9;) {
    const r = L.slice(k, k + 10);
    if (/^\d{1,2}$/.test(r[0]) && /[A-Za-z]/.test(r[1]) && r.slice(2).every(x => /^-?\d+$/.test(x))) {
      const [pos, team, P, W, Dr, Lo, GF, GA, GD, Pts] = [r[0], r[1], ...r.slice(2).map(Number)];
      rows.push({ pos: +pos, team, P, W, D: Dr, L: Lo, GF, GA, GD, Pts, me: team === 'Liverpool' });
      k += 10;
    } else k++;
  }
  const upd = L[L.indexOf('Last Updated') + 1] || '';
  return { rows, upd };
}

function sane(rows, n) {
  return rows.length >= n
    && rows.every((r, i) => r.pos === i + 1 && r.W + r.D + r.L === r.P && r.GF - r.GA === r.GD);
}

function parseFixtures(L, now = new Date()) {
  const out = [];
  let date = null, comp = '';
  for (const l of L) {
    const d = l.match(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\d{1,2})(?:st|nd|rd|th) ([A-Za-z]+)$/);
    if (d) {
      const m = MONTHS.indexOf(d[2].toLowerCase());
      if (m < 0) continue;
      let y = now.getFullYear();
      if (new Date(y, m, +d[1]) < new Date(now.getTime() - 40 * 864e5)) y++;
      date = `${y}-${String(m + 1).padStart(2, '0')}-${String(d[1]).padStart(2, '0')}`;
      continue;
    }
    if (/^(Premier League|UEFA|Carabao|FA Cup|League Cup|Champions League|Europa)/.test(l) && !/ versus /.test(l)) { comp = l; continue; }
    const v = l.match(/^(.+) versus (.+) kick off (\d\d:\d\d)$/);
    if (v && date && (v[1] === 'Liverpool' || v[2] === 'Liverpool')) {
      const home = v[1] === 'Liverpool';
      const opp = home ? v[2] : v[1];
      out.push({ date, t: `${opp} (${home ? 'H' : 'A'})`, comp: comp.replace(/^UEFA /, '').replace(/ - League Stage$/, '') || 'Fixture', k: v[3] });
    }
  }
  return out;
}

const today = new Date();
const iso = today.toISOString().slice(0, 10);
const log = [];

// ---- tables
try {
  const comps = JSON.parse(await readFile(D('competitions'), 'utf8'));
  for (const [id, page, keep, label] of [['pl', 'pl', 20, 'Premier League'], ['ucl', 'ucl', 24, 'Champions League']]) {
    try {
      const { rows, upd } = parseTable(await lines(page));
      const me = rows.find(r => r.team === 'Liverpool');
      if (!sane(rows, id === 'pl' ? 20 : 36) || !me) throw new Error('sanity check failed');
      const c = comps.competitions.find(x => x.id === id);
      c.summary = { pos: ordinal(me.pos), P: me.P, W: me.W, D: me.D, L: me.L, Pts: me.Pts, GF: me.GF, GA: me.GA };
      c.table = rows.slice(0, Math.max(keep, me.pos + 3)).map(({ GF, GA, ...r }) => r);
      c.status = id === 'pl'
        ? `Table and record auto-updated from BBC Sport (${upd}). The results list below is partial and entered by hand.`
        : `League phase, auto-updated from BBC Sport (${upd}). Top 8 go straight to the last 16; places 9-24 play off.`;
      log.push(`${label}: ${ordinal(me.pos)}, ${me.Pts} pts`);
    } catch (e) { log.push(`${label}: skipped (${e.message})`); }
  }
  await writeFile(D('competitions'), JSON.stringify(comps, null, 1) + '\n');
} catch (e) { log.push('competitions: ' + e.message); }

// ---- fixtures
try {
  const fx = parseFixtures(await lines('fix'), today).filter(f => f.date >= iso);
  if (!fx.length) throw new Error('no fixtures parsed');
  const meta = JSON.parse(await readFile(D('meta'), 'utf8'));
  const manual = (meta.upcoming || []).filter(u => u.manual && u.date >= iso);
  meta.upcoming = [...fx.slice(0, 5), ...manual].sort((a, b) => a.date.localeCompare(b.date));
  const n = fx[0];
  meta.next = { opponent: n.t.replace(/ \([HA]\)$/, ''), competition: n.comp, date: n.date, venue: n.t.endsWith('(H)') ? `Anfield · ${n.k} UK` : `Away · ${n.k} UK`, note: 'Auto-updated from BBC Sport fixtures' };
  meta.updated = iso;
  await writeFile(D('meta'), JSON.stringify(meta, null, 1) + '\n');
  log.push(`Fixtures: next ${n.t} on ${n.date}`);
} catch (e) { log.push(`Fixtures: skipped (${e.message})`); }

console.log(log.join('\n'));

function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
