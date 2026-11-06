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

// Begint de invoer met "camping ...", dan is dat de camping (tot de eerste komma/punt/regeleinde/streep).
function namedCamping(input) {
  const m = String(input || '').trim().match(/^camping\b[^,.;\n(]*?(?=\s+[-–—]\s|\s*[,.;\n(]|$)/i);
  const name = m ? m[0].trim() : '';
  const words = name.split(/\s+/);
  return words.length >= 2 && !/^(met|in|bij|aan|voor|op|nabij|rond|vlakbij|zonder|en|of|of)$/i.test(words[1]) ? name : '';
}

function slugify(s) {
  return 'weekend-' + String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}

const CAMPZ_ADDENDUM = `

Je hebt toegang tot de Campz-tools (echte campings en camperplaatsen). Gebruik die om de camping te kiezen:
- Bepaal eerst zelf de coördinaten van de bestemming/plaats. Zoek met find_places_near (radiusKm ~10, placeTypes ["campsite","motorhome_area"], bij voorkeur activities ["supermarket"], sortBy "rating" met minReviews 1) en kies een echt bestaande plek uit de resultaten. Is een camping genoemd in de zoekterm, zoek dan rond die plaats naar precies die camping.
- Titels zijn soms straatadressen: gebruik get_place_details voor de echte naam als dat nodig is.
- Zet de naam in "camping" en de Campz-pagina in "campzUrl" (veld toevoegen aan het JSON-object). Staat de genoemde camping niet in Campz, gebruik dan de genoemde naam en laat "campzUrl" leeg.
- Heeft de plek de activiteit "supermarket", dan ligt er een supermarkt binnen 2 km: gebruik dat voor "supermarkt"/"fietsAfstand" (alleen schatten als de afstand niet bekend is).
- Antwoord, na het zoeken, nog steeds UITSLUITEND met het ene JSON-object.`;

const SYSTEM_PROMPT = `Je bent een reisassistent die korte weekendjes-weg met de camper voorstelt, vertrekpunt Dordrecht, Nederland (51.81, 4.67). Je antwoordt UITSLUITEND met één geldig JSON-object, zonder markdown-codeblokken, zonder inleidende of afsluitende tekst, exact in deze vorm:
{"title":"<korte naam, bv. 'Ardennen · Bouillon' of 'Veluwe · Kootwijk'>","region":"<land/provincie, bv. 'België' of 'Gelderland, NL'>","camping":"<naam van een echt bestaande camping of camperplaats in de buurt>","plaats":"<plaatsnaam>","wandelNaam":"<naam van een echt bestaande wandelroute>","wandelKm":"<afstand tussen 8 en 15 km, bv. '11 km'>","wandelStart":"<startpunt/adres van de wandeling>","rijtijd":"<indicatie rijtijd met de camper vanaf Dordrecht, bv. '~2u15 rijden'>","supermarkt":"<naam + plaats van de dichtstbijzijnde supermarkt bij de camping, bv. 'Albert Heijn, Garderen'>","fietsAfstand":"<geschatte fietsafstand camping → supermarkt, bv. '~3 km (±12 min)'>","extra":"<2-3 zinnen extra praktische info: bijzonderheden, combinatietips, drukte, honden, parkeren, seizoen e.d.>"}

Regels:
- Kies een bestemming die past bij de zoekterm/wens van de gebruiker, geschikt voor een kort weekendje (max ~3,5 uur rijden vanaf Dordrecht, tenzij expliciet anders gevraagd).
- De wandeling moet een reële, bestaande route zijn van ongeveer 8 tot 15 km (bij voorkeur circulair).
- Gebruik realistische, bestaande plaatsnamen en camping-/wandelroutenamen — geen verzonnen namen.
- Begint de zoekterm/wens van de gebruiker met het woord "camping" (bv. "Camping De Rimboe, Garderen, rustig"), dan is de daar genoemde camping de bestemming: gebruik EXACT die camping (naam zoals genoemd) als "camping", kies de plaats, wandeling en rijtijd rondom die camping.
- Noem bij "supermarkt" een echt bestaande supermarkt en geef bij "fietsAfstand" een realistische schatting (afstand in km en fietstijd); het is een indicatie, geen routeplanner-uitkomst.
- Schrijf alles in het Nederlands.`;

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      if (req.query && req.query.extra) {
        // aanvullingen voor de vaste kaarten uit index.html (gevuld door scripts/fill-supermarkt.js)
        res.status(200).json(await readGistFile('weekends-extra.json', {}));
        return;
      }
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

    // Campz (live campings/camperplaatsen-database) via de MCP-connector van de Anthropic API.
    // Faalt dit (geen toegang, token ontbreekt, API-wijziging), dan vallen we terug op de oude methode.
    const campzUrl = process.env.CAMPZ_MCP_URL || 'https://mcp.campz.app';
    const useCampz = process.env.CAMPZ_ENABLED !== 'off';

    async function callAI(withCampz) {
      const headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
      const body = {
        model: 'claude-sonnet-5',
        max_tokens: withCampz ? 4000 : 1500,
        system: withCampz ? SYSTEM_PROMPT + CAMPZ_ADDENDUM : SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      };
      if (withCampz) {
        headers['anthropic-beta'] = 'mcp-client-2025-04-04';
        const server = { type: 'url', url: campzUrl, name: 'campz' };
        if (process.env.CAMPZ_TOKEN) server.authorization_token = process.env.CAMPZ_TOKEN;
        body.mcp_servers = [server];
      }
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error('AI-fout ' + aiRes.status + ': ' + errText.slice(0, 300));
      }
      const aiData = await aiRes.json();
      // laatste tekstblok = het antwoord (eerdere blokken kunnen tussentekst bij tool-aanroepen zijn)
      const texts = (aiData.content || []).filter(b => b.type === 'text');
      const raw = texts.length ? texts[texts.length - 1].text : '';
      if (!raw) throw new Error('leeg antwoord van AI');
      const jsonStr = extractJson(raw);
      let parsed;
      try { parsed = JSON.parse(jsonStr); } catch (e) { parsed = JSON.parse(sanitizeJson(jsonStr)); }
      const usedCampz = (aiData.content || []).some(b => b.type === 'mcp_tool_result' && !b.is_error);
      return { parsed, usedCampz };
    }

    let parsed, usedCampz = false;
    try {
      if (useCampz) {
        try {
          ({ parsed, usedCampz } = await callAI(true));
        } catch (e) {
          console.error('generate-weekend: Campz mislukt, val terug op zonder Campz:', e.message);
        }
      }
      if (!parsed) ({ parsed } = await callAI(false));
    } catch (e) {
      console.error('generate-weekend fout:', e.message);
      res.status(500).json({ error: e.message });
      return;
    }
    if (!usedCampz) parsed.campzUrl = '';

    const campingFromInput = namedCamping(input);
    const normalize = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const dest = {
      id: slugify(parsed.title || input),
      title: parsed.title || input.trim(),
      region: parsed.region || '',
      camping: campingFromInput && !normalize(parsed.camping).includes(normalize(campingFromInput).split(' ').slice(0, 2).join(' ')) ? campingFromInput : (parsed.camping || campingFromInput || ''),
      plaats: parsed.plaats || '',
      wandelNaam: parsed.wandelNaam || '',
      wandelKm: parsed.wandelKm || '',
      wandelStart: parsed.wandelStart || '',
      rijtijd: parsed.rijtijd || '',
      campzUrl: /^https:\/\//.test(parsed.campzUrl || '') ? parsed.campzUrl : '',
      supermarkt: parsed.supermarkt || '',
      fietsAfstand: parsed.fietsAfstand || '',
      extra: parsed.extra || '',
      input: input.trim(),
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
