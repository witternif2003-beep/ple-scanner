const { Redis } = require('@upstash/redis');
const U = require('./universe.json');
const B = 5;

async function fb(t) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 7000);
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=5m&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ac.signal }
    );
    clearTimeout(timer);
    if (!r.ok) return [];
    const d = await r.json();
    const c = d?.chart?.result?.[0];
    if (!c) return [];
    const ts = c.timestamp || [], q = c.indicators?.quote?.[0] || {};
    return ts.map((x, i) => ({
      close: q.close?.[i], high: q.high?.[i], low: q.low?.[i], volume: q.volume?.[i] || 0
    })).filter(b => b.close != null);
  } catch { return []; }
}

function ev(bars) {
  const F = Array.isArray(bars) ? bars.filter(b => b && b.close != null && b.high != null && b.low != null) : [];
  if (F.length < 45) return { match: false, confidence: 0, totalMove: 0, pullbackDepth: 0 };
  const n = F.length;
  const C = [], H = [], L = [], V = [];
  for (const b of F) { C.push(b.close); H.push(b.high); L.push(b.low); V.push(Number(b.volume) || 0); }
  const first = C[0], last = C[n - 1];
  const dayHigh = Math.max(...H), dayLow = Math.min(...L);
  const dayRange = (dayHigh - dayLow) / dayLow;
  const totalMove = (last - first) / first;
  const closePos = dayRange > 0 ? (last - dayLow) / (dayHigh - dayLow) : 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += C[i]; sxy += i * C[i]; sxx += i * i; }
  const denom = (n * sxx - sx * sx) || 1;
  const slope = (n * sxy - sx * sy) / denom;
  const avgC = sy / n;
  const slopeTotal = avgC ? (slope * (n - 1)) / avgC : 0;
  const cut = Math.max(12, Math.min(n - 10, Math.floor(n * 0.70)));
  let preIdx = -1, preHigh = -Infinity;
  for (let i = Math.floor(n * 0.08); i <= cut; i++) {
    if (H[i] > preHigh) { preHigh = H[i]; preIdx = i; }
  }
  if (preHigh <= 0 || preIdx < 3 || n - preIdx < 12)
    return { match: false, confidence: 0, totalMove, pullbackDepth: 0 };
  let extIdx = -1;
  for (let i = Math.max(cut + 1, preIdx + 3); i < n; i++) {
    if (H[i] > preHigh) { extIdx = i; break; }
  }
  if (extIdx < 0) return { match: false, confidence: 0, totalMove, pullbackDepth: 0 };
  let ledgeLow = Infinity;
  for (let i = preIdx + 1; i < extIdx; i++) { if (L[i] < ledgeLow) ledgeLow = L[i]; }
  const pullbackDepth = preHigh > 0 ? (preHigh - ledgeLow) / preHigh : 0;
  const priorMove = preHigh > 0 ? (preHigh - first) / first : 0;
  const avgVol = (from, to) => { let s = 0, c = 0; for (let j = Math.max(0, from); j < Math.min(n, to); j++) { if (V[j] > 0) { s += V[j]; c++; } } return c ? s / c : 0; };
  const volRatio = avgVol(preIdx - 6, preIdx + 1) > 0 ? avgVol(extIdx, extIdx + 6) / avgVol(preIdx - 6, preIdx + 1) : 1;
  let score = 0;
  score += 25 * Math.max(0, Math.min(1, slopeTotal / 0.015));
  score += 25 * Math.max(0, Math.min(1, (closePos - 0.40) / 0.60));
  let pbScore = pullbackDepth < 0.0005 ? 14 : pullbackDepth > 0.05 ? 0 : 25 * (1 - pullbackDepth / 0.05);
  score += pbScore;
  score += 15 * Math.max(0, Math.min(1, priorMove / 0.015));
  if (volRatio >= 1.15) score += 10; else if (volRatio >= 0.9) score += 5;
  const confidence = Math.round(Math.max(0, Math.min(100, score)));
  const match = extIdx > 0 && totalMove > 0 && closePos >= 0.55 && confidence >= 65;
  return { match, confidence, totalMove, pullbackDepth: Math.max(0, Math.min(1, pullbackDepth)) };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  try {
    const redis = Redis.fromEnv();
    let idx = Number(await redis.get('ple:batch_idx') || 0);
    const total = Math.ceil(U.length / B);
    const start = (idx % total) * B;
    const batch = U.slice(start, start + B);
    const matches = [];
    for (const t of batch) {
      try {
        const bars = await fb(t);
        const r = ev(bars);
        if (r.match) {
          const score = Math.min(100, Math.round(r.confidence * 0.6 + Math.abs(r.totalMove) * 1000));
          await redis.zadd('ple:queue', { score, member: t });
          await redis.hset(`ple:meta:${t}`, {
            ticker: t, score: String(score), confidence: String(r.confidence),
            total_move: String(r.totalMove), timestamp: String(Date.now())
          });
          await redis.expire('ple:queue', 7200);
          await redis.expire(`ple:meta:${t}`, 7200);
          matches.push(t);
        }
      } catch {}
    }
    await redis.incr('ple:api_calls');
    await redis.incrby('ple:matches_today', matches.length);
    await redis.set('ple:batch_idx', String(idx + 1));
    res.status(200).json({ batch: idx, scanned: batch.length, matches: matches.length, matchedTickers: matches, timestamp: Date.now() });
  } catch (e) {
    res.status(200).json({ batch: 0, scanned: 0, matches: 0, error: e.message });
  }
};
