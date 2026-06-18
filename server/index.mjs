import express from "express";
import { AccessToken } from "livekit-server-sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

function livekitReady() {
  return Boolean(
    process.env.LIVEKIT_WS_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({
    appName: process.env.PUBLIC_APP_NAME || "Nearbound Open Space",
    defaultRoom: process.env.DEFAULT_ROOM || "nearbound-open-space",
    livekitConfigured: livekitReady()
  });
});

app.post("/api/livekit-token", async (req, res) => {
  if (!livekitReady()) {
    res.status(503).json({
      error: "LIVEKIT_NOT_CONFIGURED",
      message:
        "LIVEKIT_WS_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be defined on the server."
    });
    return;
  }

  const room =
    typeof req.body?.room === "string" && req.body.room.trim()
      ? req.body.room.trim().slice(0, 96)
      : process.env.DEFAULT_ROOM || "nearbound-open-space";
  const identity =
    typeof req.body?.identity === "string" && req.body.identity.trim()
      ? req.body.identity.trim().slice(0, 96)
      : `guest-${crypto.randomUUID()}`;
  const name =
    typeof req.body?.name === "string" && req.body.name.trim()
      ? req.body.name.trim().slice(0, 64)
      : identity;
  const color =
    typeof req.body?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.color)
      ? req.body.color
      : "#2fbf71";

  try {
    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity,
        name,
        metadata: JSON.stringify({ color })
      }
    );

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true
    });

    res.json({
      token: await token.toJwt(),
      url: process.env.LIVEKIT_WS_URL,
      room
    });
  } catch (error) {
    console.error("LiveKit token error", error);
    res.status(500).json({ error: "TOKEN_ERROR" });
  }
});

if (isProduction) {
  const dist = path.join(root, "dist");
  app.use(express.static(dist, { maxAge: "1h" }));
  app.use((_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Nearbound Open Space listening on:`);
  console.log(`  Local:   http://localhost:${port}`);
  console.log(`  Local:   http://127.0.0.1:${port}`);
  console.log(`  Network: http://<your-local-ip>:${port}`);
});
