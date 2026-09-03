import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.ts";
import { corpusStats } from "./corpus.ts";
import { BadImageError, generateVariants } from "./claude.ts";
import { rateLimit, requirePassword } from "./gate.ts";
import type {
  GenerateRequest,
  GenerateResponse,
  HealthResponse,
} from "../shared/types.ts";

const app = express();

// Trust the single proxy in front of us so rate limiting sees real client IPs.
app.set("trust proxy", 1);
app.use(cors());
// Base64 photos are bulky; allow well over maxImageBytes for the encoding.
app.use(express.json({ limit: "24mb" }));

app.get("/api/health", (_req, res) => {
  const body: HealthResponse = {
    ok: true,
    model: config.model,
    apiKeyConfigured: config.apiKeyConfigured,
    authRequired: Boolean(config.appPassword),
    corpus: corpusStats(),
  };
  res.json(body);
});

app.post("/api/generate", requirePassword, rateLimit, async (req, res) => {
  const body = req.body as GenerateRequest;

  if (typeof body?.image !== "string" || !body.image) {
    res.status(400).json({ error: "An image is required." });
    return;
  }

  if (!config.apiKeyConfigured) {
    res.status(500).json({
      error: "No Anthropic credentials",
      detail:
        "Set ANTHROPIC_API_KEY in .env (copy .env.example) and restart the server.",
    });
    return;
  }

  const count = Math.min(
    Math.max(Number(body.count) || config.defaultVariantCount, 1),
    config.maxVariantCount,
  );

  try {
    const result: GenerateResponse = await generateVariants({
      image: body.image,
      prompt: typeof body.prompt === "string" ? body.prompt.slice(0, 400) : "",
      count,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof BadImageError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({
        error: "Rate limited by the Claude API.",
        detail: "Wait a few seconds and try again.",
      });
      return;
    }
    if (err instanceof Anthropic.AuthenticationError) {
      res.status(401).json({
        error: "Claude rejected the API key.",
        detail: "Check ANTHROPIC_API_KEY in .env.",
      });
      return;
    }
    if (err instanceof Anthropic.APIConnectionError) {
      res.status(502).json({
        error: "Could not reach the Claude API.",
        detail: err.message,
      });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      res
        .status(502)
        .json({ error: "The Claude API returned an error.", detail: err.message });
      return;
    }
    console.error("generate failed:", err);
    res.status(500).json({
      error: "Meme generation failed.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// In production the built SPA is served from the same origin as the API.
const distDir = path.resolve("dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(config.port, () => {
  const stats = corpusStats();
  console.log(`golfmemedigest api on http://localhost:${config.port}`);
  console.log(`  model:  ${config.model} (effort: ${config.effort})`);
  console.log(
    `  corpus: ${stats.total} memes${
      stats.total ? ` (${stats.mode} context)` : " — run `npm run ingest`"
    }`,
  );
  console.log(
    `  access: ${
      config.appPassword ? "password required" : "open"
    }, ${config.rateLimitPerHour || "no"} generations/ip/hour`,
  );
  if (!config.apiKeyConfigured) {
    console.warn("  warning: ANTHROPIC_API_KEY is not set, /api/generate will fail");
  }
  if (!config.appPassword && process.env.NODE_ENV === "production") {
    console.warn(
      "  warning: APP_PASSWORD is not set — anyone with the URL can spend your API credits",
    );
  }
});
