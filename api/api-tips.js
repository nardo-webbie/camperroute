// api/tips.js
// Env vars: ANTHROPIC_API_KEY · JSONBIN_BIN_ID · JSONBIN_API_KEY

const DAYS = [
  { id: 'dag-01',    title: 'Dordrecht → Innsbruck',          tags: 'Duitsland, België, A16, A3, München, Tirol, lange rijdag' },
  { id: 'dag-02',    title: 'Innsbruck → Pragser Wildsee',    tags: 'Brenner, Brixen, Toblach, Dobbiaco, bergmeer, Dolomieten' },
  { id: 'dag-03',    title: 'Tre Cime di Lavaredo',           tags: 'rondwandeling, tolweg, 9.5km, 550hm, rotsen, Rifugio Auronzo' },
  { id: 'dag-04-05', title: 'Fanes-Sennes NP — 2 nachten',   tags: 'Alta Badia, plateau, 2100m, Corvara, Colfosco, bergvijver' },
  { id: 'dag-06',    title: 'Dolomieten → Val d\'Orcia',      tags: 'A22, Trento, Verona, A1, Toscane, Valdichiana, lange rijdag' },
  { id: 'dag-07-08', title: "Val d'Orcia — 2 nachten",        tags: 'Crete Senesi, cipressen, Pienza, Montalcino, agriturismo, cappella' },
  { id: 'dag-09-10', title: 'Monte Amiata — 2 nachten',       tags: 'vulkaan, kastanjes, Saturnia, thermaalwater, paddenstoelen, cascatelle' },
  { id: 'dag-11-12', title: 'Maremma NP — 2 nachten',         tags: 'Uccellina, wilde paarden, kust, strand, kliffen, Alberese' },
  { id: 'dag-13',    title: 'Maremma → Cilento',              tags: 'A1 southbound, Campania, kustweg, Vallo della Lucania' },
  { id: 'dag-14-15', title: 'Parco del Cilento — 2 nachten',  tags: 'UNESCO, Gole del Calore, Castelcivita, grotten, rivier, Palinuro' },
  { id: 'dag-16',    title: 'Cilento → Pompei-omgeving',      tags: 'Golf van Salerno, kustweg, Vesuvius in zicht, Pompei' },
  { id: 'dag-17',    title: 'Vesuvius wandeling',             tags: 'vulkaankrater, 1281m, 600hm, Golf van Napels, Capri, uitzicht' },
  { id: 'dag-18',    title: 'Pompei → Amalfikust',            tags: 'Salerno, SS163, boot, ferry, Amalfi, Vietri' },
  { id: 'dag-19',    title: 'Sentiero degli Dei',             tags: 'Pad der Goden, 7.5km, Bomerano, Nocelle, Positano, kustpad' },
  { id: 'dag-20',    title: 'Salerno → Gargano NP',           tags: 'A3, A16, Apennijnen, Adriatische kust, Puglia, Mattinata' },
  { id: 'dag-21-22', title: 'Gargano NP — 2 nachten',         tags: 'Foresta Umbra, Vieste kliffen, wild zwijn, roofvogels, Peschici' },
  { id: 'dag-23',    title: 'Gargano → Alta Murgia NP',       tags: 'karstplateau, Altamura, Gravina in Puglia, wilde paarden' },
  { id: 'dag-24',    title: 'Alta Murgia & Gravine',          tags: 'ravijnen, Matera, Sassi, wilde paarden, vale gieren, grottekerk' },
  { id: 'dag-25-26', title: 'Salento — 2 nachten',            tags: 'Porto Selvaggio, Otranto, Torre dell Orso, hak van de laars, zee' },
  { id: 'dag-27',    title: "Valle d'Itria",                  tags: 'trulli, Alberobello, Cisternino, Locorotondo, olijven, Primitivo' },
  { id: 'dag-28',    title: "Valle d'Itria → Rome omgeving",  tags: 'A14, Taranto, A16, A1 northbound, Orvieto' },
  { id: 'dag-29',    title: 'Rome → Bologna',                 tags: 'A1 northbound, Orvieto, Firenze, Bologna, snelweg' },
  { id: 'dag-30',    title: 'Bologna → Basel/Freiburg',       tags: 'Milaan, A9, Gotthard tunnel, Zwitserland, Luzern, vignette' },
  { id: 'dag-31',    title: 'Freiburg → Dordrecht',           tags: 'A5, Karlsruhe, A67, Nederland, thuis, Venlo, laatste etappe' },
];

const BIN   = () => `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN_ID}`;
const BKEY  = () => process.env.JSONBIN_API_KEY;
const AIKEY = () => process.env.ANTHROPIC_API_KEY;

async function getBin() {
  try {
    const r = await fetch(`${BIN()}/latest`, {
      headers: { 'X-Master-Key': BKEY(), 'X-Bin-Meta': 'false' },
    });
    return r.ok ? await r.json() : { tips: [] };
  } catch { return { tips: [] }; }
}

async function putBin(data) {
  await fetch(BIN(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': BKEY() },
    body: JSON.stringify(data),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — alle tips ophalen
  if (req.method === 'GET') {
    const rec = await getBin();
    return res.json(rec.tips || []);
  }

  // DELETE — tip verwijderen op id
  if (req.method === 'DELETE') {
    const { id } = req.query;
    const rec = await getBin();
    rec.tips = (rec.tips || []).filter(t => t.id !== id);
    await putBin(rec);
    return res.json({ ok: true });
  }

  // POST — AI verrijken + opslaan
  if (req.method === 'POST') {
    const { input } = req.body || {};
    if (!input?.trim()) return res.status(400).json({ error: 'Geen invoer' });

    const daysList = DAYS.map(d => `  ${d.id}: "${d.title}" [${d.tags}]`).join('\n');
    const prompt = `Je bent reisassistent voor een camperreis Dordrecht→Amalfikust in oktober, met hond en 6m camper.

Route-stops:
${daysList}

Gebruikersinvoer: "${input.trim()}"

Taken:
1. Kies de meest passende stop-ID voor deze tip of opmerking
2. Schrijf een nuttige, aangevulde tip in het Nederlands (2–4 zinnen, conversationeel en concreet)
3. Kies een passende emoji + korte titel (max 5 woorden)

Antwoord UITSLUITEND als valide JSON, geen markdown, geen uitleg:
{"dayId":"dag-XX","tipTitle":"🔤 Titel","tipContent":"Aangevulde tip in het Nederlands."}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': AIKEY(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) return res.status(500).json({ error: `AI-fout ${aiRes.status}` });

    const aiData = await aiRes.json();
    let parsed;
    try {
      parsed = JSON.parse(aiData.content[0].text.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(500).json({ error: 'AI gaf ongeldige JSON terug' });
    }

    const match = DAYS.find(d => d.id === parsed.dayId);
    const tip = {
      id:         `tip-${Date.now()}`,
      dayId:      match ? parsed.dayId : DAYS[0].id,
      dayTitle:   match?.title || DAYS[0].title,
      tipTitle:   parsed.tipTitle   || '💡 Tip',
      tipContent: parsed.tipContent || '',
      userInput:  input.trim(),
      ts:         new Date().toISOString(),
    };

    const rec = await getBin();
    rec.tips = [...(rec.tips || []), tip];
    await putBin(rec);
    return res.json(tip);
  }

  return res.status(405).end();
};
