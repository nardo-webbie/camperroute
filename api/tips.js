const GIST_API = 'https://api.github.com/gists/';

const ITALY_DAYS = [
  { id: 'dag-01',    title: 'Dordrecht → Innsbruck',          location: 'Duitsland, België, A16, A3, München, Tirol, lange rijdag' },
  { id: 'dag-02',    title: 'Innsbruck → Pragser Wildsee',    location: 'Brenner, Brixen, Toblach, Dobbiaco, bergmeer, Dolomieten' },
  { id: 'dag-03',    title: 'Tre Cime di Lavaredo',           location: 'rondwandeling, tolweg, Rifugio Auronzo' },
  { id: 'dag-04-05', title: 'Fanes-Sennes NP — 2 nachten',    location: 'Alta Badia, plateau, Corvara, Colfosco, bergvijver' },
  { id: 'dag-06',    title: "Dolomieten → Val d'Orcia",       location: 'A22, Trento, Verona, A1, Toscane, Valdichiana' },
  { id: 'dag-07-08', title: "Val d'Orcia — 2 nachten",        location: 'Crete Senesi, cipressen, Pienza, Montalcino' },
  { id: 'dag-09-10', title: 'Monte Amiata — 2 nachten',       location: 'vulkaan, kastanjes, Saturnia, thermaalwater' },
  { id: 'dag-11-12', title: 'Maremma NP — 2 nachten',         location: 'Uccellina, wilde paarden, kust, Alberese' },
  { id: 'dag-13',    title: 'Maremma → Cilento',              location: 'A1 southbound, Campania, kustweg' },
  { id: 'dag-14-15', title: 'Parco del Cilento — 2 nachten',  location: 'UNESCO, Gole del Calore, Castelcivita, Palinuro' },
  { id: 'dag-16',    title: 'Cilento → Pompei-omgeving',      location: 'Golf van Salerno, Vesuvius, Pompei' },
  { id: 'dag-17',    title: 'Vesuvius wandeling',             location: 'vulkaankrater, Golf van Napels, Capri' },
  { id: 'dag-18',    title: 'Pompei → Amalfikust',            location: 'Salerno, boot, Amalfi, Vietri' },
  { id: 'dag-19',    title: 'Sentiero degli Dei',             location: 'Pad der Goden, Bomerano, Nocelle, Positano' },
  { id: 'dag-20',    title: 'Salerno → Gargano NP',           location: 'Apennijnen, Adriatische kust, Puglia, Mattinata' },
  { id: 'dag-21-22', title: 'Gargano NP — 2 nachten',         location: 'Foresta Umbra, Vieste kliffen, Peschici' },
  { id: 'dag-23',    title: 'Gargano → Alta Murgia NP',       location: 'karstplateau, Altamura, Gravina in Puglia' },
  { id: 'dag-24',    title: 'Alta Murgia & Gravine',          location: 'ravijnen, Matera, Sassi, wilde paarden' },
  { id: 'dag-25-26', title: 'Salento — 2 nachten',            location: 'Porto Selvaggio, Otranto, Torre dell Orso' },
  { id: 'dag-27',    title: "Valle d'Itria",                  location: 'trulli, Alberobello, Cisternino, Locorotondo' },
  { id: 'dag-28',    title: "Valle d'Itria → Rome omgeving",  location: 'A14, Taranto, A16, A1 northbound' },
  { id: 'dag-29',    title: 'Rome → Bologna',                 location: 'A1 northbound, Orvieto, Firenze, Bologna' },
  { id: 'dag-30',    title: 'Bologna → Basel/Freiburg',       location: 'Milaan, Gotthard tunnel, Zwitserland, Luzern' },
  { id: 'dag-31',    title: 'Freiburg → Dordrecht',           location: 'A5, Karlsruhe, A67, Nederland, thuis' },
];

const ENGLAND_DAYS = [
  { id: '1',  title: 'Dordrecht → Calais → Canterbury', location: 'P&O Ferries, Kent, Canterbury' },
  { id: '2',  title: 'Rustdag Canterbury',               location: 'kathedraal, Whitstable, Dover' },
  { id: '3',  title: 'Canterbury → Cotswolds',            location: 'Bourton-on-the-Water' },
  { id: '4',  title: 'Rustdag Cotswolds',                 location: 'Bibury, Stow-on-the-Wold' },
  { id: '5',  title: 'Cotswolds → Bath → New Forest',     location: 'Bath, Stonehenge, New Forest' },
  { id: '6',  title: 'Rustdag New Forest',                location: 'Lyndhurst, wilde pony\'s' },
  { id: '7',  title: 'New Forest → Jurassic Coast',       location: 'Lyme Regis, Charmouth, Dorset' },
  { id: '8',  title: 'Rustdag Jurassic Coast',            location: 'Lyme Regis, Durdle Door, Golden Cap' },
  { id: '9',  title: 'Jurassic Coast → Dartmoor',         location: 'Dartmoor, Devon' },
  { id: '10', title: 'Rustdag Dartmoor',                  location: 'Haytor, Hound Tor, Widecombe' },
  { id: '11', title: 'Dartmoor → Pembrokeshire Coast',    location: 'St Davids, Wales' },
  { id: '12', title: 'Rustdag Pembrokeshire Coast',       location: 'St Davids, St Non\'s, St Justinian\'s' },
  { id: '13', title: 'Pembrokeshire → Brecon Beacons → Peak District', location: 'Brecon Beacons, Edale' },
  { id: '14', title: 'Rustdag Peak District',             location: 'Edale, Mam Tor, Kinder Scout' },
  { id: '15', title: 'Peak District → Yorkshire Dales',   location: 'Malham' },
  { id: '16', title: 'Rustdag Yorkshire Dales',           location: 'Malham Cove, Gordale Scar, Malham Tarn' },
  { id: '17', title: 'Yorkshire Dales → Lake District',   location: 'Windermere' },
  { id: '18', title: 'Rustdag Lake District',             location: 'Ambleside, Loughrigg Fell, Windermere' },
  { id: '19', title: 'Lake District → York',              location: 'York' },
  { id: '20', title: 'York → Dover',                      location: 'Dover' },
  { id: '21', title: 'Dover → Calais → Dordrecht',        location: 'P&O Ferries terug naar huis' },
];

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

async function getDaysForTrip(tripId) {
  if (tripId === 'italy') return ITALY_DAYS;
  if (tripId === 'england') return ENGLAND_DAYS;
  const trips = await readGistFile('trips.json', []);
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return [];
  const days = [];
  (trip.phases || []).forEach(phase => {
    (phase.days || []).forEach(d => days.push({ id: d.id, title: d.title, location: d.sub || '' }));
  });
  return days;
}

module.exports = async (req, res) => {
  try {
    const tripId = (req.query && req.query.trip) || (req.body && req.body.tripId);

    if (req.method === 'GET') {
      const allTips = await readGistFile('tips.json', {});
      res.status(200).json((allTips && allTips[tripId]) || []);
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query && req.query.id;
      const allTips = await readGistFile('tips.json', {});
      allTips[tripId] = (allTips[tripId] || []).filter(t => t.id !== id);
      await writeGistFile('tips.json', allTips);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'POST') {
      const { input, password } = req.body || {};
      if (!tripId || !input || !input.trim()) {
        res.status(400).json({ error: 'tripId en input zijn verplicht' });
        return;
      }
      if (!password || password !== process.env.TIP_PASSWORD) {
        res.status(401).json({ error: 'Ongeldig wachtwoord' });
        return;
      }

      const days = await getDaysForTrip(tripId);
      const daysList = days.map(d => `  ${d.id}: "${d.title}" [${d.location}]`).join('\n');
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: 'ANTHROPIC_API_KEY ontbreekt' });
        return;
      }

      const prompt = `Je bent reisassistent voor een camperreis. Dit zijn de dagen van de route:\n\n${daysList}\n\nGebruikersinvoer: "${input.trim()}"\n\nTaken:\n1. Kies de meest passende dag-ID voor deze tip op basis van de genoemde locatie\n2. Schrijf een nuttige, aangevulde tip in het Nederlands (2-4 zinnen)\n3. Kies een passende emoji + korte titel (max 5 woorden)\n\nAntwoord UITSLUITEND als valide JSON, geen markdown: {"dayId":"<id>","tipTitle":"emoji Titel","tipContent":"tekst"}`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!aiRes.ok) { res.status(500).json({ error: 'AI-fout ' + aiRes.status }); return; }
      const aiData = await aiRes.json();
      let parsed;
      try {
        parsed = JSON.parse(aiData.content[0].text.replace(/```json|```/g, '').trim());
      } catch (e) {
        res.status(500).json({ error: 'AI gaf ongeldige JSON terug' });
        return;
      }

      const match = days.find(d => d.id === parsed.dayId);
      const tip = {
        id: 'tip-' + Date.now(),
        dayId: match ? parsed.dayId : (days[0] ? days[0].id : ''),
        dayTitle: match ? match.title : (days[0] ? days[0].title : ''),
        tipTitle: parsed.tipTitle || '💡 Tip',
        tipContent: parsed.tipContent || '',
        ts: new Date().toISOString(),
      };

      const allTips = await readGistFile('tips.json', {});
      allTips[tripId] = [...(allTips[tripId] || []), tip];
      await writeGistFile('tips.json', allTips);
      res.status(200).json(tip);
      return;
    }

    res.status(405).end();
  } catch (err) {
    res.status(500).json({ error: err.message || 'Onbekende serverfout' });
  }
};
