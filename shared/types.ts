/**
 * Types shared by the browser and the API routes.
 * Keep this file dependency-free so either side can import it.
 */

/**
 * The fonts Claude may choose from. Each maps to a webfont loaded in
 * app/layout.tsx; the renderer resolves the real family off a CSS variable.
 */
export const FONTS = {
  impact: "Heavy condensed caps — the classic meme look",
  condensed: "Tall narrow sans — bold, modern, headline-ish",
  sans: "Clean neutral sans — screenshot and tweet energy",
  serif: "Elegant high-contrast serif — deadpan, editorial",
  hand: "Loose handwriting — annotation, scrawled aside",
} as const;

export type FontKey = keyof typeof FONTS;
export const FONT_KEYS = Object.keys(FONTS) as FontKey[];

/** One run of text placed on the canvas. */
export interface TextBlock {
  text: string;
  font: FontKey;
  /** ALL CAPS or as written. */
  uppercase: boolean;
  /** Hex fill, e.g. "#ffffff". */
  color: string;
  /** Outline behind the fill. "none" when the text sits on a flat background. */
  stroke: "black" | "white" | "none";
  align: "left" | "center" | "right";
  /** Centre of the block, as a fraction of the full canvas (0-1). */
  x: number;
  y: number;
  /** Maximum line width, as a fraction of canvas width (0-1). */
  width: number;
  /** Font size, as a fraction of canvas width (0-1). */
  size: number;
  /** Tilt in degrees, -20 to 20. */
  rotation: number;
}

/**
 * A complete meme. The canvas is the photo, optionally with a solid band added
 * above and/or below it; blocks are positioned across that whole canvas. That
 * one mechanism covers Impact-over-photo, a white caption bar, a lower third,
 * a corner label, or anything else Claude invents.
 */
export interface MemeSpec {
  id: string;
  /** Band added above the photo, as a fraction of photo height (0-0.6). */
  padTop: number;
  /** Band added below the photo, as a fraction of photo height (0-0.6). */
  padBottom: number;
  /** Hex fill for those bands. */
  background: string;
  blocks: TextBlock[];
  /** Under 12 words on the joke's angle, to pick between variants at a glance. */
  angle: string;
  instagramCaption: string;
  hashtags: string[];
  /** The past memes this variant was styled on. */
  references: ReferenceRef[];
}

/** A reference meme, as far as the browser needs to know about it. */
export interface ReferenceRef {
  name: string;
  /** Where to load the thumbnail: a Blob URL, or the local-mode API route. */
  url: string;
}

export interface GenerateRequest {
  /** Data URL of the (downscaled) source photo. */
  image: string;
  /** Optional short steer, e.g. "make it about slow play". */
  prompt?: string;
  /** How many variants to ask for. */
  count?: number;
}

export interface GenerateResponse {
  variants: MemeSpec[];
  usage: Usage;
}

/** What a run cost. Totalled across the one request made per variant. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Estimated, from the per-million rates in lib/config.ts. */
  costUsd: number;
  /** How many API calls the run made — one per variant. */
  requests: number;
}

export interface HealthResponse {
  ok: boolean;
  model: string;
  apiKeyConfigured: boolean;
  authRequired: boolean;
  /** Past memes available in reference/ for the style sample. */
  referenceImages: number;
  /** How many of those are drawn per variant. */
  referenceSampleSize: number;
}

export interface ApiError {
  error: string;
  detail?: string;
}
