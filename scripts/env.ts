/**
 * Loads .env.local (Next's convention) then .env, before anything else reads
 * process.env. Scripts import this first — ES modules evaluate dependencies in
 * declaration order, so anything reading env must be imported below it.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });
