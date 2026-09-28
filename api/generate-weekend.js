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
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = false; }
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
  return 'weekend-' + String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}

const SYSTEM_PROMPT = `Je bent een reisassistent die korte weekendjes-weg met de camper voorstelt, vertrekpunt Dordrecht, Nederland (51.81, 4.67). Je antwoordt UITSLUITEND met één geldig JSON-object, zonder markdown-codeblokken, zonder inleidende of afsluitende tekst, exact in deze vorm:
{"title":"<korte naam, bv. 'Ardennen · Bouillon' of 'Veluwe · Kootwijk'>","region":"<land/provincie, bv. 'België' of 'Gelderland, NL'>","camping":"<naam van een echt bestaande camping of camperplaats in de buurt>","plaats":"<plaatsnaam>","wandelNaam":"<naam van een echt bestaande wandelroute>","wandelKm":"<afstand tussen 8 en 15 km, bv. '11 km'>","wandelStart":"<startpunt/adres van de wandeling>","rijtijd":"<indicatie rijtijd met de camper vanaf Dordrecht, bv. '~2u15 rijden'>"}

Regels:
- Kies een bestemming die past bij de zoekterm/wens van de gebruiker, geschikt voor een kort weekendje (max ~3,5 uur rijden vanaf Dordrecht, tenzij expliciet anders gevraagd).
- De wandeling moet een reële, bestaande route zijn van ongeveer 8 tot 15 km (bij voorkeur circulair).
- Gebruik realistische, bestaande plaatsnamen en camping-/wandelroutenamen — geen verzonnen namen.
- Schrijf alles in het Nederlands.`;

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const dests = await readGistFile('weekends.json', []);
      res.status(200).json(dests);
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query && req.query.id;
      const dests = await readGistFile('weekends.json', []);
      const filtered = dests.filter(d => d.id !== id);
      await writeGistFile('weekends.json', filtered);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const { input, password } = req.body || {};
    if (!input || !input.trim()) {
      res.status(400).json({ error: 'input is verplicht' });
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

    const userPrompt = `Zoekterm/wens: "${input.trim()}"`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('generate-weekend AI-fout:', aiRes.status, errText.slice(0, 300));
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
        parsed = JSON.parse(sanitizeJson(jsonStr));
      }
    } catch (e) {
      console.error('generate-weekend JSON-parsefout:', e.message, '| stop_reason:', aiData.stop_reason, '| raw:', raw.slice(0, 400));
      res.status(500).json({ error: 'AI gaf ongeldige JSON terug: ' + e.message });
      return;
    }

    const dest = {
      id: slugify(parsed.title || input),
      title: parsed.title || input.trim(),
      region: parsed.region || '',
      camping: parsed.camping || '',
      plaats: parsed.plaats || '',
      wandelNaam: parsed.wandelNaam || '',
      wandelKm: parsed.wandelKm || '',
      wandelStart: parsed.wandelStart || '',
      rijtijd: parsed.rijtijd || '',
      createdAt: new Date().toISOString(),
    };

    const dests = await readGistFile('weekends.json', []);
    dests.push(dest);
    await writeGistFile('weekends.json', dests);
    res.status(200).json(dest);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Onbekende serverfout' });
  }
};
