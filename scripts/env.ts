/**
 * Loads .env.local (Next's convention) then .env, before anything else reads
 * process.env. Imported first by scripts/ingest.ts — ES modules evaluate
 * dependencies in declaration order, so lib/config.ts sees a populated
 * environment only if this import stays above it.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });
