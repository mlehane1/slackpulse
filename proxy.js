// SlackPulse — Proxy + Static Server
// Run: npm install express cors node-fetch && node proxy.js
// Then open: http://localhost:3001

const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const PORT = 3001;

app.use(cors());

// Serve slackpulse.html at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "slackpulse.html"));
});

// Proxy Slack API calls
app.get("/api/:method", async (req, res) => {
  const { method } = req.params;
  const token = req.query.token;

  if (!token) return res.status(401).json({ ok: false, error: "missing_token" });

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== "token") params.set(k, v);
  }

  const slackUrl = `https://slack.com/api/${method}?${params.toString()}`;
  console.log(`→ ${method}`);

  try {
    const { default: fetch } = await import("node-fetch");
    const slackRes = await fetch(slackUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await slackRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ SlackPulse running → http://localhost:${PORT}`);
});
