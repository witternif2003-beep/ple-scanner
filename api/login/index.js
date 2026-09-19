// api/login/index.js — NSA Serenity-Ω Security Clearance Authentication
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch(e) {}
    }
    const op = (body?.operator_id || "").trim();
    const key = (body?.access_key || "").trim();

    if (!key) {
      return res.status(422).json({ detail: "Password required" });
    }

    if (key === "nsa-admin" || key === "admin") {
      return res.status(200).json({
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiJ9.SERENITY_OMEGA_SECURE_TOKEN",
        operator_id: op || "admin",
        expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString()
      });
    }

    return res.status(401).json({ detail: "Invalid credentials" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
