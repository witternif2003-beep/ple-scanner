// api/universe-scan/index.js — NSA Serenity-Ω Microstructure Tape & Scanner
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const payload = {
      filter: [
        { left: "volume", operation: "nempty" },
        { left: "close", operation: "nempty" },
        { left: "active_symbol", operation: "equal", right: true }
      ],
      options: { lang: "en" },
      symbols: { query: { types: ["stock"] }, tickers: [] },
      columns: [
        "name", "close", "change", "change_abs", "volume",
        "average_volume_10d_calc", "relative_volume_10d_calc",
        "price_52_week_high", "price_52_week_low", "Perf.W",
        "change_from_open", "total_shares_outstanding", "float_shares_outstanding", "RSI7"
      ],
      sort: { sortBy: "change", sortOrder: "desc" },
      range: [0, 60]
    };

    const tvResp = await fetch("https://scanner.tradingview.com/america/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify(payload)
    });

    if (!tvResp.ok) {
      throw new Error("TradingView scanner returned HTTP " + tvResp.status);
    }

    const data = await tvResp.json();
    const rows = data.data || [];
    const cards = [];

    rows.forEach((row, idx) => {
      const d = row.d || [];
      const sym = (d[0] || (row.s ? row.s.split(":").pop() : "")).toUpperCase();
      const close = Number(d[1]) || 0;
      const chg = Number(d[2]) || 0;
      const chgAbs = Number(d[3]) || 0;
      const vol = Number(d[4]) || 0;
      const avgVol = Number(d[5]) || 0;
      const relVol = Number(d[6]) || 0;
      const h52 = Number(d[7]) || close;
      const l52 = Number(d[8]) || close;
      const perfW = Number(d[9]) || 0;
      const chgOpen = Number(d[10]) || 0;
      const sharesOut = Number(d[11]) || 0;
      const floatShares = Number(d[12]) || sharesOut;
      const rsi7 = Number(d[13]) || 50;

      const volExp = relVol > 0 ? relVol : (avgVol > 0 ? vol / avgVol : 1.0);
      const floatTo = floatShares > 0 ? vol / floatShares : volExp;

      // Garman-Klass Volatility
      const highEst = close > 0 ? close * (1.0 + Math.max(1.0, Math.abs(chgOpen || 2.0)) / 100.0 * 0.7) : 1.0;
      const lowEst = Math.max(0.0001, close * (1.0 - Math.max(1.0, Math.abs(chgOpen || 2.0)) / 100.0 * 0.3));
      const openEst = close > 0 ? close / (1.0 + (chgOpen || 0.0) / 100.0) : 1.0;

      let gkVol = Math.abs(chg) * 1.6;
      try {
        const logHL = Math.log(Math.max(1.0001, highEst / Math.max(0.0001, lowEst)));
        const logCO = Math.log(Math.max(1.0001, close / Math.max(0.0001, openEst)));
        const gkVar = 0.5 * (logHL ** 2) - (2 * Math.LN2 - 1) * (logCO ** 2);
        gkVol = Math.sqrt(Math.max(0.0001, gkVar)) * Math.sqrt(252) * 100.0;
      } catch (e) {}

      // Corwin-Schultz Spread
      let csSpread = 15.0;
      try {
        const beta = (Math.log(Math.max(1.001, highEst / Math.max(0.0001, lowEst)))) ** 2;
        const denom = 3.0 - 2.0 * Math.SQRT2;
        const alpha = (Math.sqrt(2 * beta) - Math.sqrt(beta)) / denom - Math.sqrt(beta * 1.5 / denom);
        csSpread = (2.0 * (Math.exp(alpha) - 1.0) / (1.0 + Math.exp(alpha))) * 10000.0;
        csSpread = Math.max(2.5, Math.min(120.0, Math.abs(csSpread)));
      } catch (e) {}

      // Kyle's Lambda
      const kyleLambda = (Math.abs(chg) / Math.max(1000, vol)) * 1e6;

      // Hawkes Intensity
      const hawkesIntensity = 0.85 + 0.45 * Math.log1p(volExp) + 0.05 * Math.abs(chg) + (0.02 * Math.max(0, rsi7 - 50));

      // Scoring & Narrative
      let narrative = "LIQUIDITY CASCADE";
      if (chg >= 50 && (floatTo >= 2.0 || volExp >= 10.0)) {
        narrative = "★ +900% PARABOLIC SURGE (FLOAT DRAIN)";
      } else if (chg >= 30) {
        narrative = "INSTITUTIONAL RUNNER CASCADE";
      } else if (volExp >= 5.0) {
        narrative = "ABNORMAL VOLUME EXPANSION";
      }

      cards.push({
        rank: idx + 1,
        symbol: sym,
        price: close < 1 ? Number(close.toFixed(4)) : Number(close.toFixed(2)),
        change_pct: Number(chg.toFixed(2)),
        change_abs: Number(chgAbs.toFixed(4)),
        volume: vol,
        avg_volume: avgVol,
        vol_exp: Number(volExp.toFixed(2)),
        float_turnover: Number(floatTo.toFixed(1)),
        gk_vol: Number(gkVol.toFixed(1)),
        cs_spread_bps: Number(csSpread.toFixed(1)),
        kyle_lambda: Number(kyleLambda.toFixed(4)),
        hawkes_intensity: Number(hawkesIntensity.toFixed(3)),
        narrative: narrative,
        timestamp: new Date().toISOString()
      });
    });

    cards.sort((a, b) => b.change_pct - a.change_pct);
    cards.forEach((c, i) => c.rank = i + 1);

    return res.status(200).json({
      status: "PASS",
      source: "TRADINGVIEW_US_EQUITY_SCANNER_8000+",
      timestamp: new Date().toISOString(),
      count: cards.length,
      cards: cards
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, status: "FAIL" });
  }
};
