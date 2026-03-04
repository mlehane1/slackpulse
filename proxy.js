// SlackPulse — Proxy + OAuth + Static Server
// Setup:
//   1. npm install express cors node-fetch
//   2. Set environment variables:
//        SLACK_CLIENT_ID     — from api.slack.com/apps > Basic Information
//        SLACK_CLIENT_SECRET — from api.slack.com/apps > Basic Information
//        APP_URL             — your Railway URL e.g. https://slackpulse-production.up.railway.app
//   3. node proxy.js

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const app     = express();
const PORT    = process.env.PORT || 3001;

const CLIENT_ID     = process.env.SLACK_CLIENT_ID;
const CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const APP_URL       = process.env.APP_URL || `http://localhost:${PORT}`;
const REDIRECT_URI  = `${APP_URL}/auth/callback`;

const SCOPES = [
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "users:read"
].join(",");

app.use(cors());

// ── Step 1: Redirect user to Slack OAuth consent screen ──
app.get("/auth/login", (req, res) => {
  if (!CLIENT_ID) {
    return res.status(500).send("SLACK_CLIENT_ID environment variable not set.");
  }
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id",    CLIENT_ID);
  url.searchParams.set("user_scope",   SCOPES);   // user token scopes
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  res.redirect(url.toString());
});

// ── Step 2: Slack redirects back here with a code ──
app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect("/?error=" + encodeURIComponent(error || "no_code"));
  }

  try {
    const { default: fetch } = await import("node-fetch");

    // Exchange code for token
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri:  REDIRECT_URI,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("OAuth error:", data.error);
      return res.redirect("/?error=" + encodeURIComponent(data.error));
    }

    // User token is in data.authed_user.access_token
    const userToken = data.authed_user?.access_token;
    if (!userToken) {
      return res.redirect("/?error=no_user_token");
    }

    // Pass token to frontend via URL fragment (never logged server-side)
    res.redirect(`/?token=${encodeURIComponent(userToken)}`);

  } catch (err) {
    console.error("OAuth callback error:", err.message);
    res.redirect("/?error=" + encodeURIComponent(err.message));
  }
});

// ── Proxy Slack API calls ──
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

// ── Serve frontend ──
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "slackpulse.html"));
});

app.listen(PORT, () => {
  console.log(`✅ SlackPulse running → ${APP_URL}`);
  if (!CLIENT_ID) console.warn("⚠️  SLACK_CLIENT_ID not set — OAuth will not work");
});
