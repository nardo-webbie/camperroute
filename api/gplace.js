// Google Places API (New): zoekt een plek op naam en geeft rating + aantal reviews terug.
// Vereist env GOOGLE_PLACES_API_KEY. Er wordt niets opgeslagen; alleen korte edge-cache.
module.exports = async (req, res) => {
  try {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) { res.status(200).json({ ok: false, reason: 'no-key' }); return; }
    const q = String((req.query && req.query.q) || '').trim().slice(0, 160);
    if (q.length < 3) { res.status(400).json({ ok: false, reason: 'q' }); return; }
    const gRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: q, languageCode: 'nl', pageSize: 1 }),
    });
    if (!gRes.ok) {
      console.error('gplace fout', gRes.status, (await gRes.text()).slice(0, 300));
      res.status(200).json({ ok: false, reason: 'google-' + gRes.status });
      return;
    }
    const p = ((await gRes.json()).places || [])[0];
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    if (!p || typeof p.rating !== 'number') { res.status(200).json({ ok: false, reason: 'none' }); return; }
    res.status(200).json({
      ok: true,
      name: (p.displayName && p.displayName.text) || '',
      rating: Math.round(p.rating * 10) / 10,
      count: p.userRatingCount || 0,
      url: p.googleMapsUri || '',
    });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'error' });
  }
};
