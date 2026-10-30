#!/usr/bin/env node
/**
 * Eenmalig script: vult de dichtstbijzijnde supermarkt + fietsafstand aan voor
 * de bestaande weekendjes-weg.
 *
 *  - AI-toegevoegde weekenden (gist-bestand weekends.json): velden `supermarkt`
 *    en `fietsAfstand` worden direct in het object gezet.
 *  - Vaste kaarten uit index.html: worden uitgelezen (titel, camping, plaats) en
 *    opgeslagen in weekends-extra.json, per kaarttitel. De site legt die er bij het
 *    laden overheen (zie loadStaticExtras in index.html).
 *
 * Gebruik (Node 18+):
 *   ANTHROPIC_API_KEY=... GIST_ID=... GIST_TOKEN=... node scripts/fill-supermarkt.js [--dry-run] [--force]
 *
 *   --dry-run  alleen tonen, niets wegschrijven
 *   --force    ook weekenden opnieuw invullen die al een supermarkt hebben
 *
 * De afstanden zijn schattingen van het model (geen routeplanner): controleer ze
 * gerust, bv. met Google Maps (fietsroute), en pas ze zo nodig aan in de gist.
 */
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const { ANTHROPIC_API_KEY, GIST_ID, GIST_TOKEN } = process.env;
if (!ANTHROPIC_API_KEY || !GIST_ID || !GIST_TOKEN) {
  console.error('Zet ANTHROPIC_API_KEY, GIST_ID en GIST_TOKEN als omgevingsvariabelen.');
  process.exit(1);
}

const GIST_API = 'https://api.github.com/gists/' + GIST_ID;
const ghHeaders = { Authorization: 'Bearer ' + GIST_TOKEN, Accept: 'application/vnd.github+json' };

async function readGist(filename, fallback) {
  const res = await fetch(GIST_API, { headers: ghHeaders });
  if (!res.ok) throw new Error('Gist lezen mislukt: ' + res.status);
  const gist = await res.json();
  const f = gist.files && gist.files[filename];
  if (!f) return fallback;
  try { return JSON.parse(f.content); } catch { return fallback; }
}
async function writeGist(files) {
  const body = {};
  for (const [name, data] of Object.entries(files)) body[name] = { content: JSON.stringify(data, null, 2) };
  const res = await fetch(GIST_API, {
    method: 'PATCH',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: body }),
  });
  if (!res.ok) throw new Error('Gist schrijven mislukt: ' + res.status);
}

// Vaste kaarten uit index.html: titel, camping, plaats
function staticCards() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const grid = html.split('id="destGrid"')[1] || '';
  const cards = [];
  const re = /<div class="dest-card">([\s\S]*?)<span class="dest-drive">/g;
  let m;
  while ((m = re.exec(grid))) {
    const b = m[1];
    const pick = (re2) => (b.match(re2) || [])[1]?.replace(/<[^>]+>/g, '').trim();
    cards.push({
      title: pick(/<h3>([\s\S]*?)<\/h3>/),
      region: pick(/class="dest-region">([\s\S]*?)<\/div>/),
      camping: pick(/<strong>Camping:<\/strong>\s*([\s\S]*?)<\/span>/),
      plaats: pick(/<strong>Plaats:<\/strong>\s*([\s\S]*?)<\/span>/),
    });
  }
  return cards.filter(c => c.title);
}

const SYSTEM = `Je helpt bij het plannen van campertripjes. Geef voor de opgegeven camping/plaats de dichtstbijzijnde bestaande supermarkt en een realistische schatting van de fietsafstand (camping → supermarkt). Antwoord UITSLUITEND met één JSON-object, geen markdown, exact: {"supermarkt":"<naam, plaats>","fietsAfstand":"<bv. '~3 km (±12 min)'>"}. Verzin geen supermarkt: kies er een die je zeker kent. Weet je het niet zeker, geef dan de dichtstbijzijnde supermarkt in de genoemde plaats en zet een "?" achter de afstand.`;

async function ask(d) {
  const prompt = `Bestemming: ${d.title} (${d.region || ''})\nCamping: ${d.camping}\nPlaats: ${d.plaats}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 300, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('AI-fout ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const raw = (await res.json()).content.find(b => b.type === 'text')?.text || '';
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('geen JSON in antwoord: ' + raw.slice(0, 120));
  const j = JSON.parse(raw.slice(start, end + 1));
  if (!j.supermarkt) throw new Error('leeg antwoord');
  return { supermarkt: String(j.supermarkt), fietsAfstand: String(j.fietsAfstand || '') };
}

(async () => {
  const dests = await readGist('weekends.json', []);
  const extra = await readGist('weekends-extra.json', {});
  let done = 0;

  for (const d of dests) {
    if (d.supermarkt && !FORCE) continue;
    try {
      Object.assign(d, await ask(d));
      console.log(`✓ ${d.title}: ${d.supermarkt} — ${d.fietsAfstand}`);
      done++;
    } catch (e) { console.error(`✗ ${d.title}: ${e.message}`); }
  }
  for (const c of staticCards()) {
    if (extra[c.title]?.supermarkt && !FORCE) continue;
    try {
      extra[c.title] = await ask(c);
      console.log(`✓ ${c.title}: ${extra[c.title].supermarkt} — ${extra[c.title].fietsAfstand}`);
      done++;
    } catch (e) { console.error(`✗ ${c.title}: ${e.message}`); }
  }

  if (DRY) return console.log(`\nDry-run: ${done} aanvullingen, niets weggeschreven.`);
  if (!done) return console.log('Niets te doen.');
  await writeGist({ 'weekends.json': dests, 'weekends-extra.json': extra });
  console.log(`\n${done} aanvullingen weggeschreven naar de gist. Ververs de site.`);
})().catch(e => { console.error(e.message); process.exit(1); });
