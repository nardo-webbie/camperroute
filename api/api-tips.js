// api/tips.js
// Env vars: ANTHROPIC_API_KEY · JSONBIN_BIN_ID · JSONBIN_API_KEY

const DAYS = [
  { id: 'dag-01',    title: 'Dordrecht → Schluchsee',         tags: 'Zwarte Woud, bos, herfst, Freiburg, Duitsland, A16' },
  { id: 'dag-02-03', title: 'Zwarte Woud — 2 nachten',        tags: 'Feldberg, Titisee, bospaden, wandeling, herfstkleuren, kasteel' },
  { id: 'dag-04',    title: 'Schluchsee → Karwendel',         tags: 'Tirol, Oostenrijk, Achensee, naturpark, Scharnitz, Inn' },
  { id: 'dag-05-06', title: 'Karwendel — 2 nachten',          tags: 'Gleirschklamm, Isar-bron, kloof, wildlife, herten, brullen, beek' },
  { id: 'dag-07',    title: 'Dolomieten — Pragser Wildsee',   tags: 'Braies, bergmeer, smaragdgroen, Toblach, Dobbiaco, Zuid-Tirol' },
  { id: 'dag-08',    title: 'Tre Cime di Lavaredo',           tags: 'rondwandeling, tolweg, rotsen, 9.5km, 550hm, Rifugio Auronzo' },
  { id: 'dag-09-10', title: 'Fanes-Sennes NP — 2 nachten',   tags: 'Alta Badia, plateau, 2100m, Corvara, Colfosco, bergvijver' },
  { id: 'dag-11',    title: 'Dolomieten → Gardameer',         tags: 'Riva del Garda, Etschtal, Trento, meer, Brenner, Cortina' },
  { id: 'dag-12-13', title: "Val d'Orcia — 2 nachten",        tags: 'Toscane, Crete Senesi, cipressen, Pienza, Montalcino, agriturismo, cappella' },
  { id: 'dag-14-15', title: 'Monte Amiata — 2 nachten',       tags: 'vulkaan, kastanjes, Saturnia, thermaalwater, paddenstoelen, cascatelle' },
  { id: 'dag-16-17', title: 'Maremma NP — 2 nachten',        tags: 'Uccellina, wilde paarden, kust, strand, kliffen, Alberese, maquis' },
  { id: 'dag-18-19', title: 'Cinque Terre — Alta Via',        tags: 'La Spezia, kustpad, Portovenere, Framura, Ligurië, dorpjes, trein' },
  { id: 'dag-20-21', title: 'Apennijnen NP',                  tags: 'Pietra di Bismantova, tafelberg, beuken, Castelnovo, Dante, wandeling' },
  { id: 'dag-22-23', title: 'Parco del Cilento',              tags: 'UNESCO, Gole del Calore, Castelcivita, grotten, rivier, onbekend' },
  { id: 'dag-24',    title: 'Cilento → Pompei-omgeving',      tags: 'Golf van Salerno, kustweg, Vesuvius in zicht, opgraving, Pompei' },
  { id: 'dag-25',    title: 'Vesuvius wandeling',             tags: 'vulkaankrater, 1281m, 600hm, uitzicht, Golf van Napels, Capri' },
  { id: 'dag-26',    title: 'Pompei → Amalfikust',            tags: 'Salerno, SS163, boot, ferry, Amalfi, Vietri sul Mare' },
  { id: 'dag-27',    title: 'Sentiero degli Dei',             tags: 'Pad der Goden, 7.5km, Bomerano, Nocelle, Positano, kustpad' },
  { id: 'dag-28-29', title: 'Terugreis — 2 rijdagen',         tags: 'Bologna, Lago Maggiore, A1 northbound, Fondotoce, snelweg' },
  { id: 'dag-30',    title: 'Lago Maggiore → Basel/Freiburg', tags: 'Gotthard, tunnel, Zwitserland, Luzern, vignette, Basel, A9' },
  { id: 'dag-31',    title: 'Freiburg → Dordrecht',           tags: 'A5, Karlsruhe, Nederland, thuis, laatste etappe, A67, Venlo' },
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

export default async function handler(req, res) {
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
        model: 'claude-sonnet-4-20250514',
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
}
