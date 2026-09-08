const { Redis } = require("@upstash/redis");
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  try { const r = Redis.fromEnv(); const raw = await r.zrange('ple:queue', 0, -1, {withScores: true}); const q = []; for (let i=0; i<raw.length; i+=2) { try { const meta = await r.hgetall('ple:' + raw[i]); if (meta?.timestamp && (Date.now() - Number(meta.timestamp)) < 7200000) { q.push({ticker: raw[i], score: Number(raw[i+1]), confidence: Number(meta.confidence||0), total_move: Number(meta.total_move||0)}); } } catch {} } q.sort((a,b) => b.score - a.score); res.status(200).json(q); } catch { res.status(200).json([]); }
};
