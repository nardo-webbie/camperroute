// Xweather (AerisWeather) dagverwachting voor een plaats. Env: XWEATHER_CLIENT_ID, XWEATHER_CLIENT_SECRET
module.exports = async (req, res) => {
  try {
    const clean = v => String(v || '').trim().replace(/^['"]|['"]$/g, '').trim();
    const id = clean(process.env.XWEATHER_CLIENT_ID), secret = clean(process.env.XWEATHER_CLIENT_SECRET);
    if (!id || !secret) { res.status(200).json({ ok: false, reason: 'no-key' }); return; }
    const q = String((req.query && req.query.q) || '').trim().slice(0, 100);
    if (q.length < 2 || !/^[\p{L}\p{N} .,'()\-\/]+$/u.test(q)) { res.status(400).json({ ok: false, reason: 'q' }); return; }
    const fields = 'periods.dateTimeISO,periods.maxTempC,periods.minTempC,periods.pop,periods.precipMM,periods.windSpeedKPH,periods.weatherPrimary,periods.icon';
    const base = 'https://data.api.xweather.com/forecasts/' + encodeURIComponent(q) +
      '?format=json&filter=day&limit=7&client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(secret);
    let r = await fetch(base + '&fields=' + fields);
    let j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) { // tweede poging zonder fields-filter
      r = await fetch(base);
      j = await r.json().catch(() => ({}));
    }
    if (!r.ok || !j.success) {
      const e = j.error || {};
      console.error('weather fout', r.status, JSON.stringify(e).slice(0, 300));
      res.status(200).json({ ok: false, reason: (e.code || 'http-' + r.status) + ' [id ' + id.length + ' tekens, secret ' + secret.length + ' tekens]' + (e.description ? ': ' + String(e.description).slice(0, 120) : '') });
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
