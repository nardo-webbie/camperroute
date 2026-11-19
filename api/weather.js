// Xweather (AerisWeather) dagverwachting voor een plaats. Env: XWEATHER_CLIENT_ID, XWEATHER_CLIENT_SECRET
module.exports = async (req, res) => {
  try {
    const id = process.env.XWEATHER_CLIENT_ID, secret = process.env.XWEATHER_CLIENT_SECRET;
    if (!id || !secret) { res.status(200).json({ ok: false, reason: 'no-key' }); return; }
    const q = String((req.query && req.query.q) || '').trim().slice(0, 100);
    if (q.length < 2 || !/^[\p{L}\p{N} .,'()\-\/]+$/u.test(q)) { res.status(400).json({ ok: false, reason: 'q' }); return; }
    const fields = 'periods.dateTimeISO,periods.maxTempC,periods.minTempC,periods.pop,periods.precipMM,periods.windSpeedKPH,periods.weatherPrimary,periods.icon';
    const url = 'https://data.api.xweather.com/forecasts/' + encodeURIComponent(q) +
      '?format=json&filter=day&limit=7&fields=' + fields +
      '&client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(secret);
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) {
      console.error('weather fout', r.status, JSON.stringify(j.error || j).slice(0, 200));
      res.status(200).json({ ok: false, reason: (j.error && j.error.code) || 'http-' + r.status });
      return;
    }
    const periods = ((j.response || [])[0] || {}).periods || [];
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=7200');
    res.status(200).json({
      ok: periods.length > 0,
      days: periods.map(p => ({
        date: p.dateTimeISO, max: p.maxTempC, min: p.minTempC, pop: p.pop,
        mm: p.precipMM, wind: p.windSpeedKPH, text: p.weatherPrimary, icon: p.icon,
      })),
    });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'error' });
  }
};
