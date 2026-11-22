const GIST_API = 'https://api.github.com/gists/';

async function gistHeaders() {
  return {
    Authorization: 'Bearer ' + process.env.GIST_TOKEN,
    Accept: 'application/vnd.github+json',
  };
}

async function readGistFile(filename, fallback) {
  const gistId = process.env.GIST_ID;
  const token = process.env.GIST_TOKEN;
  if (!gistId || !token) throw new Error('GIST_ID of GIST_TOKEN ontbreekt');
  const res = await fetch(GIST_API + gistId, { headers: await gistHeaders() });
  if (!res.ok) throw new Error('Kon gist niet lezen (status ' + res.status + ')');
  const gist = await res.json();
  const file = gist.files && gist.files[filename];
  if (!file) return fallback;
  try {
    return JSON.parse(file.content || JSON.stringify(fallback));
  } catch (e) {
    return fallback;
  }
}

async function writeGistFile(filename, data) {
  const gistId = process.env.GIST_ID;
  const res = await fetch(GIST_API + gistId, {
    method: 'PATCH',
    headers: { ...(await gistHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(data, null, 2) } } }),
  });
  if (!res.ok) throw new Error('Kon gist niet bijwerken (status ' + res.status + ')');
}

function extractJson(raw) {
  const start = raw.indexOf('{');
  if (start === -1) throw new Error('geen JSON-object gevonden in AI-antwoord');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  throw new Error('JSON leek afgekapt (onvolledig antwoord)');
}

// Herstelt veelvoorkomende "geldige tekst, ongeldige JSON"-fouten die LLM's maken:
// losse regeleinden/tabs binnen string-waarden (niet ge-escaped) en komma's
// vlak voor een sluitend `}` of `]`.
function sanitizeJson(str) {
  let out = '';
  let inStr = false, esc = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function slugify(s) {
  return 'trip-' + String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}

const SCHEMA_INSTRUCTIONS = `Je bent een reisplanner die camperroutes (of vliegreizen) bouwt in dezelfde stijl als bestaande Nederlandstalige camperroute-apps voor Dordrecht als vertrekpunt. Genereer een volledige, realistische dag-voor-dag reis.

Antwoord UITSLUITEND met geldige JSON, geen markdown, geen uitleg, in exact deze vorm:
{
  "destination": "<bestemmingsnaam voor in de titel, bv. 'Zweden' of 'Kroatië'>",
  "headerLabel": "<korte label, bv. 'Camperreis · augustus 2028'>",
  "meta": "<samenvattende regel: aantal dagen · vervoer · met/zonder hond · bijzonderheden>",
  "barText": "<één regel sfeertekst met een relevante emoji vooraan>",
  "specs": ["<emoji + korte spec>", "... 4-5 stuks, bv. vervoerswijze, hond, periode, totale afstand, klimaat"],
  "tabLabel": "<kort label voor het tabblad, met vlag-emoji, bv. '🇸🇪 Zweden'>",
  "countryCode": "<ISO 3166-1 alpha-2 landcode in kleine letters van de hoofdbestemming, bv. 'se' voor Zweden, 'hr' voor Kroatië>",
  "phases": [
    {
      "label": "Fase 1 — <naam>",
      "dayRange": "Dag 1–X",
      "days": [
        {
          "id": "d1",
          "num": "01",
          "title": "<Van → Naar of activiteit>",
          "sub": "<korte ondertitel met sfeer/route-info>",
          "km": "<afstand, bv. '~320 km' of '— km' voor rustdagen>",
          "duration": "<bv. '±4 uur' of 'Rustdag'>",
          "type": "drive" of "rest",
          "lat": <decimaal getal, breedtegraad van de belangrijkste locatie/overnachtingsplek van deze dag, bv. 45.4642>,
          "lon": <decimaal getal, lengtegraad van diezelfde locatie, bv. 9.19>,
          "body": "<2-4 zinnen beschrijving van de dag, concreet en informatief>",
          "tags": [{"cls":"tag-camper|tag-hond|tag-wandel|tag-rust|tag-ferry|tag-warn|tag-natuur","label":"<korte tag>"}],
          "boxes": [{"cls":"box-tip|box-camper|box-warn|box-natuur","label":"<Label:>","text":"<toelichting>"}]
        }
      ]
    }
  ],
  "totals": [
    {"val":"<aantal dagen>","lbl":"Dagen"},
    {"val":"<totale km of vluchttijd>","lbl":"Km totaal"},
    {"val":"<aantal rijdagen>","lbl":"Rijdagen"},
    {"val":"<aantal rust/verblijfsdagen>","lbl":"Rust/verblijf"}
  ]
}

Regels:
- Elke dag krijgt een unieke "id" (bv. "d1", "d2", ...), oplopend door de hele reis.
- Elke dag krijgt verplicht een realistische "lat" en "lon" (decimale graden, WGS84) van de belangrijkste locatie/overnachtingsplek die dag — dit wordt gebruikt om een routekaartje te tekenen, dus de coördinaten moeten geografisch kloppen en in de juiste volgorde een logische route vormen (begin/eind bij Dordrecht: 51.81, 4.67).
- Bouw een logische, geografisch samenhangende route met een paar dagen reistijd heen en terug, en de rest verdeeld over de belangrijkste natuurgebieden/bezienswaardigheden van de bestemming.
- Als het vervoer "vliegtuig" is: geen dagenlange rijdagen, wel vlucht + eventueel huurcamper/auto ter plekke, en km's slaan op verplaatsingen ter plekke.
- Als de hond meegaat: voeg relevante hond-tags en -tips toe (hondvriendelijke campings, aangelijnd bij vee, etc). Zo niet, laat hond-gerelateerde content achterwege.
- Gebruik het gevraagde aantal dagen/periode nauwkeurig.
- Schrijf alles in het Nederlands, in dezelfde toon als een ervaren campervriend: concreet, warm, praktisch.`;


const WS_HEADER = () => ({ 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID || 'wrkspc_01Q2r3TTRGRiovzfU84LEm1V' });

async function askJson(apiKey, system, user, maxTokens) {
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { ...WS_HEADER(), 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!aiRes.ok) throw new Error('AI-fout ' + aiRes.status + ': ' + (await aiRes.text()).slice(0, 300));
  const aiData = await aiRes.json();
  const block = aiData.content && aiData.content.find(b => b.type === 'text');
  const raw = block ? block.text : '';
  try {
    if (!raw) throw new Error('leeg antwoord van AI');
    const jsonStr = extractJson(raw);
    try { return JSON.parse(jsonStr); } catch (e) { return JSON.parse(sanitizeJson(jsonStr)); }
  } catch (e) {
    console.error('generate-trip JSON-parsefout:', e.message, '| stop_reason:', aiData.stop_reason, '| raw (laatste 400):', raw.slice(-400));
    throw new Error('AI gaf ongeldige JSON terug: ' + e.message + (aiData.stop_reason === 'max_tokens' ? ' — antwoord werd afgekapt' : ''));
  }
}

const DAY_FORMAT = `{
  "id": "d<n>", "num": "<nn>", "title": "<Van → Naar of activiteit>", "sub": "<korte ondertitel>",
  "km": "<bv. '~320 km' of '— km' voor rustdagen>", "duration": "<bv. '±4 uur' of 'Rustdag'>", "type": "drive" of "rest",
  "lat": <decimaal>, "lon": <decimaal>, "body": "<2-4 zinnen, concreet>",
  "tags": [{"cls":"tag-camper|tag-hond|tag-wandel|tag-rust|tag-ferry|tag-warn|tag-natuur","label":"<korte tag>"}],
  "boxes": [{"cls":"box-tip|box-camper|box-warn|box-natuur","label":"<Label:>","text":"<toelichting>"}]
}`;

const OUTLINE_PROMPT = `Je bent een reisplanner voor Nederlandstalige camperroutes (vertrek Dordrecht). Maak ALLEEN het grove plan van de reis, geen dagdetails. Antwoord UITSLUITEND met geldige JSON:
{
  "destination": "<bestemmingsnaam>", "headerLabel": "<bv. 'Camperreis · juni 2027'>",
  "meta": "<aantal dagen · vervoer · met/zonder hond · bijzonderheden>", "barText": "<één regel sfeertekst met emoji vooraan>",
  "specs": ["<emoji + korte spec>", "... 4-5 stuks"], "tabLabel": "<kort label met vlag-emoji>", "countryCode": "<ISO alpha-2 klein>",
  "totalDays": <aantal dagen>,
  "phases": [ {"label":"Fase 1 — <naam>","startDay":1,"endDay":5,"summary":"<1-2 zinnen: waar, wat, hoe te rijden, overnachtingsgebieden>"} ],
  "totals": [{"val":"<aantal dagen>","lbl":"Dagen"},{"val":"<totale km of vluchttijd>","lbl":"Km totaal"},{"val":"<aantal rijdagen>","lbl":"Rijdagen"},{"val":"<aantal rust/verblijfsdagen>","lbl":"Rust/verblijf"}]
}
Regels: de fases sluiten aansluitend op elkaar aan (startDay van fase n+1 = endDay van fase n + 1), beginnen bij dag 1 en eindigen bij totalDays; elke fase heeft maximaal 5 dagen; logische, geografisch samenhangende route; houd rekening met overtocht/ferry, hond en periode; Nederlands, warm en praktisch.`;

const PHASE_PROMPT = `Je werkt één fase uit van een Nederlandstalige camperreis. Je krijgt het grove plan (outline), de te maken fase en de vorige dag voor aansluiting. Antwoord UITSLUITEND met geldige JSON: {"days":[ ... ]} met precies één object per dag van startDay t/m endDay, in dit formaat:
${DAY_FORMAT}
Regels: "id" is "d<dagnummer>" over de hele reis (bv. d7), "num" het tweecijferige dagnummer; elke dag krijgt realistische "lat"/"lon" (WGS84) van de belangrijkste plek/overnachting; sluit geografisch aan op de vorige dag; concrete, bestaande plekken, wandelingen en praktische tips (camperwegen, campings, hond indien meegaat); Nederlands, warme toon.`;

function cleanDays(days, startDay, endDay) {
  const out = (Array.isArray(days) ? days : []).slice(0, 12).map((d, i) => ({
    ...d,
    id: 'd' + (startDay + i),
    num: String(startDay + i).padStart(2, '0'),
    lat: typeof d.lat === 'number' ? d.lat : null,
    lon: typeof d.lon === 'number' ? d.lon : null,
  }));
  if (!out.length) throw new Error('AI gaf geen dagen terug voor deze fase');
  return out;
}

function buildTrip(parsed, bestemming, wanneer, periode, trips) {
  const themes = ['italy', 'england', 'ocean'];
  return {
    id: slugify(bestemming),
    theme: themes[trips.length % themes.length],
    destination: parsed.destination || bestemming,
    headerLabel: parsed.headerLabel || `Camperreis · ${wanneer}`,
    meta: parsed.meta || periode,
    barText: parsed.barText || '',
    specs: parsed.specs || [],
    tabLabel: parsed.tabLabel || ('🧭 ' + (parsed.destination || bestemming)),
    countryCode: (parsed.countryCode || '').toLowerCase().trim() || null,
    phases: (parsed.phases || []).map(phase => ({
      ...phase,
      days: (phase.days || []).map(d => ({
        ...d,
        lat: typeof d.lat === 'number' ? d.lat : null,
        lon: typeof d.lon === 'number' ? d.lon : null,
      })),
    })),
    totals: parsed.totals || [],
    createdAt: new Date().toISOString(),
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const trips = await readGistFile('trips.json', []);
      res.status(200).json(trips);
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const { bestemming, wanneer, brooklyn, vervoer, periode, password } = req.body || {};
    if (!bestemming || !wanneer || !periode) {
      res.status(400).json({ error: 'bestemming, wanneer en periode zijn verplicht' });
      return;
    }
    if (!password || password !== process.env.TIP_PASSWORD) {
      res.status(401).json({ error: 'Ongeldig wachtwoord' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY ontbreekt' });
      return;
    }

    const step = (req.body || {}).step;
    if (step) {
      const b = req.body;
      const ctx = `Bestemming: ${bestemming}\nWanneer: ${wanneer}\nGaat de hond (Brooklyn) mee: ${brooklyn === 'ja' ? 'ja' : 'nee'}\nVervoer: ${vervoer}\nPeriode/duur: ${periode}\nVertrekpunt: Dordrecht, Nederland`;
      if (step === 'outline') {
        const outline = await askJson(apiKey, OUTLINE_PROMPT, ctx, 4000);
        if (!Array.isArray(outline.phases) || !outline.phases.length) throw new Error('AI gaf geen fases terug');
        res.status(200).json(outline);
        return;
      }
      if (step === 'phase') {
        const o = b.outline || {};
        const ph = (o.phases || [])[b.phaseIndex];
        if (!ph) { res.status(400).json({ error: 'onbekende fase' }); return; }
        const prev = b.prevDay ? `\nVorige dag (aansluiten): ${JSON.stringify({ id: b.prevDay.id, title: b.prevDay.title, lat: b.prevDay.lat, lon: b.prevDay.lon })}` : '\nDit is het begin van de reis.';
        const user = `${ctx}\n\nGrof plan van de hele reis:\n${JSON.stringify({ totalDays: o.totalDays, phases: o.phases }, null, 1)}\n\nWerk nu fase ${b.phaseIndex + 1} uit: ${ph.label}, dag ${ph.startDay} t/m ${ph.endDay}. ${ph.summary || ''}${prev}`;
        const out = await askJson(apiKey, PHASE_PROMPT, user, 8000);
        res.status(200).json({ days: cleanDays(out.days, ph.startDay, ph.endDay) });
        return;
      }
      if (step === 'save') {
        const t = b.trip;
        if (!t || !Array.isArray(t.phases) || !t.phases.length) { res.status(400).json({ error: 'ongeldige reis' }); return; }
        const trips = await readGistFile('trips.json', []);
        const trip = buildTrip(t, bestemming, wanneer, periode, trips);
        trips.push(trip);
        await writeGistFile('trips.json', trips);
        res.status(200).json(trip);
        return;
      }
      res.status(400).json({ error: 'onbekende stap' });
      return;
    }

    const brooklynMee = brooklyn === 'ja';
    const userPrompt = `Bestemming: ${bestemming}\nWanneer: ${wanneer}\nGaat de hond (Brooklyn) mee: ${brooklynMee ? 'ja' : 'nee'}\nVervoer: ${vervoer}\nPeriode/duur: ${periode}\nVertrekpunt: Dordrecht, Nederland`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID || 'wrkspc_01Q2r3TTRGRiovzfU84LEm1V', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 16000,
        system: SCHEMA_INSTRUCTIONS,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      res.status(500).json({ error: 'AI-fout ' + aiRes.status + ': ' + errText.slice(0, 300) });
      return;
    }
    const aiData = await aiRes.json();
    let parsed;
    let raw = '';
    try {
      const block = aiData.content && aiData.content.find(b => b.type === 'text');
      raw = block ? block.text : '';
      if (!raw) throw new Error('leeg antwoord van AI');
      const jsonStr = extractJson(raw);
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        parsed = JSON.parse(sanitizeJson(jsonStr)); // fallback: herstel losse newlines/tabs en trailing commas
      }
    } catch (e) {
      const truncated = aiData.stop_reason === 'max_tokens';
      const hint = truncated
        ? ' — antwoord werd afgekapt (te lange reis voor 1 keer genereren, probeer een kortere periode)'
        : '';
      console.error('generate-trip JSON-parsefout:', e.message, '| stop_reason:', aiData.stop_reason, '| raw (laatste 400 tekens):', raw.slice(-400));
      res.status(500).json({ error: 'AI gaf ongeldige JSON terug: ' + e.message + hint });
      return;
    }

    const themes = ['italy', 'england', 'ocean'];
    const trips = await readGistFile('trips.json', []);
    const theme = themes[trips.length % themes.length];

    const trip = {
      id: slugify(bestemming),
      theme,
      destination: parsed.destination || bestemming,
      headerLabel: parsed.headerLabel || `Camperreis · ${wanneer}`,
      meta: parsed.meta || periode,
      barText: parsed.barText || '',
      specs: parsed.specs || [],
      tabLabel: parsed.tabLabel || ('🧭 ' + (parsed.destination || bestemming)),
      countryCode: (parsed.countryCode || '').toLowerCase().trim() || null,
      phases: (parsed.phases || []).map(phase => ({
        ...phase,
        days: (phase.days || []).map(d => ({
          ...d,
          lat: typeof d.lat === 'number' ? d.lat : null,
          lon: typeof d.lon === 'number' ? d.lon : null,
        })),
      })),
      totals: parsed.totals || [],
      createdAt: new Date().toISOString(),
    };

    trips.push(trip);
    await writeGistFile('trips.json', trips);
    res.status(200).json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Onbekende serverfout' });
  }
};
