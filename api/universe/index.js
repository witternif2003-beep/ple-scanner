const { Redis } = require("@upstash/redis");
const U = require("../cron/universe.json");
const B = 5;
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  let b=0, a=0, m=0;
  try { const r = Redis.fromEnv(); b = Number(await r.get('ple:batch_idx')||0); a = Number(await r.get('ple:api_calls')||0); m = Number(await r.get('ple:matches_today')||0); } catch(e) {}
  res.status(200).json({total: U.length, batch: b, totalBatches: Math.ceil(U.length/B), batchSize: B, apiCalls: a, matchesToday: m});
};
