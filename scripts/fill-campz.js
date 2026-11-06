#!/usr/bin/env node
/**
 * Eenmalig script: werkt de bestaande (AI-toegevoegde) weekendjes-weg in de gist bij
 * met een camping + camperplaats uit Campz, inclusief Campz-link en reviewcijfer.
 *
 * Geeft de API een fout over 'workspace', zet dan ook ANTHROPIC_WORKSPACE_ID=<id van je workspace>.
 *
 * Gebruik (Node 18+):
 *   ANTHROPIC_API_KEY=... GIST_ID=... GIST_TOKEN=... [CAMPZ_TOKEN=...] node scripts/fill-campz.js [--dry-run] [--force]
 *
 *   --dry-run  alleen tonen, niets wegschrijven
 *   --force    ook weekenden opnieuw doen die al een Campz-link/rating hebben
 *
 * - Cijfers komen letterlijk uit Campz; staat er geen cijfer, dan blijft het leeg.
 * - Begon de oorspronkelijke invoer met "camping ...", dan blijft die camping de camping
 *   (alleen link + cijfer worden aangevuld als Campz hem kent).
 * - Weekenden waarvoor Campz niets oplevert blijven ongewijzigd.
 * - De vaste kaarten in index.html zijn al met Campz-gegevens bijgewerkt.
 */
const { ANTHROPIC_API_KEY, GIST_ID, GIST_TOKEN, CAMPZ_TOKEN } = process.env;
const CAMPZ_URL = process.env.CAMPZ_MCP_URL || 'https://mcp.campz.app';
const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const LIST = process.argv.includes('--list');
const APPLY = (process.argv.find(a => a.startsWith('--apply=')) || '').slice(8);
if (!GIST_ID || !GIST_TOKEN || (!LIST && !APPLY && !ANTHROPIC_API_KEY)) {
  console.error('Zet ANTHROPIC_API_KEY, GIST_ID en GIST_TOKEN als omgevingsvariabelen (en CAMPZ_TOKEN als Campz die vereist).');
  process.exit(1);
}

const GIST_API = 'https://api.github.com/gists/' + GIST_ID;
const ghHeaders = { Authorization: 'Bearer ' + GIST_TOKEN, Accept: 'application/vnd.github+json' };

async function readGist(filename, fallback) {
  const res = await fetch(GIST_API, { headers: ghHeaders });
  if (!res.ok) throw new Error('Gist lezen mislukt: ' + res.status);
  const f = (await res.json()).files?.[filename];
  if (!f) return fallback;
  try { return JSON.parse(f.content); } catch { return fallback; }
}
async function writeGist(filename, data) {
  const res = await fetch(GIST_API, {
    method: 'PATCH',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(data, null, 2) } } }),
  });
  if (!res.ok) throw new Error('Gist schrijven mislukt: ' + res.status);
}

function extractJson(raw) {
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('geen JSON in antwoord');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return raw.slice(start, i + 1);
  }
  throw new Error('JSON afgekapt');
}
const num = (v, max) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) && n >= 0 && n <= max ? String(n) : ''; };
const https = u => (/^https:\/\//.test(u || '') ? u : '');

const SYSTEM = `Je zoekt in Campz (via de Campz-tools) een camping en een camperplaats bij een weekendbestemming. Bepaal de coördinaten van de plaats, zoek met find_places_near (radiusKm ~10 voor campings, ~15 voor camperplaatsen, placeTypes ["campsite"] resp. ["motorhome_area"], sortBy "rating", minReviews 3; zakt dat te laag, probeer minReviews 1 of een grotere straal). Gebruik get_place_details als een titel een adres/omschrijving is en je de echte naam nodig hebt. Neem rating en reviewCount LETTERLIJK over uit Campz; verzin of schat nooit een cijfer, laat het leeg als het ontbreekt. Noem geen plek die niet in de resultaten stond. Antwoord na het zoeken UITSLUITEND met één JSON-object:
{"camping":"<naam>","campzUrl":"<url uit Campz of leeg>","campingRating":"<cijfer of leeg>","campingReviews":"<aantal of leeg>","camperplaats":"<naam of leeg>","camperplaatsUrl":"<url uit Campz of leeg>","camperplaatsRating":"<cijfer of leeg>","camperplaatsReviews":"<aantal of leeg>"}`;

async function ask(d) {
  const named = /^\s*camping\b/i.test(d.input || '');
  const prompt = `Weekend: ${d.title} (${d.region || ''})\nPlaats: ${d.plaats}\nHuidige camping: ${d.camping}\n` +
    (named ? `De gebruiker koos zelf deze camping ("${d.camping}"): zoek PRECIES die camping in Campz en geef die terug; staat hij er niet, geef dan een lege campzUrl en laat rating/reviews leeg.` : 'Kies een goed beoordeelde camping in de buurt.');
  const server = { type: 'url', url: CAMPZ_URL, name: 'campz' };
  if (CAMPZ_TOKEN) server.authorization_token = CAMPZ_TOKEN;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : {}), 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'mcp-client-2025-04-04', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 4000, system: SYSTEM, mcp_servers: [server], messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('AI-fout ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  if (!(data.content || []).some(b => b.type === 'mcp_tool_result' && !b.is_error)) throw new Error('Campz gaf geen resultaat (token nodig of server onbereikbaar?)');
  const texts = data.content.filter(b => b.type === 'text');
  const j = JSON.parse(extractJson(texts[texts.length - 1]?.text || ''));
  return {
    named,
    camping: String(j.camping || ''), campzUrl: https(j.campzUrl),
    campingRating: num(j.campingRating, 5), campingReviews: num(j.campingReviews, 100000),
    camperplaats: String(j.camperplaats || ''), camperplaatsUrl: https(j.camperplaatsUrl),
    camperplaatsRating: num(j.camperplaatsRating, 5), camperplaatsReviews: num(j.camperplaatsReviews, 100000),
  };
}

(async () => {
  const dests = await readGist('weekends.json', []);
  let done = 0;

  // Zonder Campz-API: --list toont de weekenden, --apply=bestand.json voert door Claude opgezochte Campz-data door
  if (LIST) {
    console.log(JSON.stringify(dests.map(d => ({ title: d.title, region: d.region, plaats: d.plaats, camping: d.camping, input: d.input || '' })), null, 2));
    return;
  }
  if (APPLY) {
    const patch = JSON.parse(require('fs').readFileSync(APPLY, 'utf8'));
    for (const p of patch) {
      const d = dests.find(x => x.title === p.title);
      if (!d) { console.error('✗ niet gevonden: ' + p.title); continue; }
      const { title, ...fields } = p;
      Object.assign(d, fields);
      console.log('✓ ' + d.title);
      done++;
    }
    if (DRY) return console.log(`\nDry-run: ${done} aangepast.`);
    if (done) await writeGist('weekends.json', dests);
    return console.log(`\n${done} weekenden bijgewerkt. Ververs de site.`);
  }
  for (const d of dests) {
    if ((d.campzUrl || d.camperplaatsUrl) && !FORCE) continue;
    try {
      const r = await ask(d);
      const { named, camping, ...rest } = r;
      if (!named && camping) d.camping = camping;
      if (named && !rest.campzUrl) { rest.campingRating = ''; rest.campingReviews = ''; }
      Object.assign(d, rest);
      console.log(`✓ ${d.title}: ${d.camping} ${d.campingRating ? '⭐' + d.campingRating + ' (' + d.campingReviews + ')' : '–'} | ${d.camperplaats || '–'} ${d.camperplaatsRating ? '⭐' + d.camperplaatsRating + ' (' + d.camperplaatsReviews + ')' : ''}`);
      done++;
    } catch (e) { console.error(`✗ ${d.title}: ${e.message}`); }
  }
  if (DRY) return console.log(`\nDry-run: ${done} aangepast, niets weggeschreven.`);
  if (!done) return console.log('Niets te doen.');
  await writeGist('weekends.json', dests);
  console.log(`\n${done} weekenden bijgewerkt in de gist. Ververs de site.`);
})().catch(e => { console.error(e.message); process.exit(1); });
