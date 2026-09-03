/**
 * Types shared by the browser app, the API server and the corpus ingest script.
 * Keep this file dependency-free so it can be imported from any of them.
 */

/** How a variant's text is laid out over (or around) the source photo. */
export type MemeLayout = "top-bottom" | "caption-bar" | "lower-third";

export const MEME_LAYOUTS: MemeLayout[] = [
  "top-bottom",
  "caption-bar",
  "lower-third",
];

/** One meme idea returned by Claude. */
export interface MemeVariant {
  /** Stable id assigned by the server, used as a React key and download name. */
  id: string;
  layout: MemeLayout;
  /** Impact-style top line. Empty unless layout is "top-bottom". */
  topText: string;
  /** Impact-style bottom line. Used by "top-bottom" and "lower-third". */
  bottomText: string;
  /** Sentence in the white bar above the photo. Used by "caption-bar". */
  captionText: string;
  /** Suggested Instagram caption for the post. */
  instagramCaption: string;
  /** Suggested hashtags, without the leading '#'. */
  hashtags: string[];
  /** One line on the joke's angle, shown to help pick between variants. */
  angle: string;
}

export interface GenerateRequest {
  /** Data URL of the (downscaled) source photo: data:image/png;base64,... */
  image: string;
  /** Optional short steer from the user, e.g. "make it about slow play". */
  prompt?: string;
  /** How many variants to ask for. */
  count?: number;
  /** How many past memes to draw as style context for this run. */
  sampleSize?: number;
}

export interface GenerateResponse {
  variants: MemeVariant[];
  /** What the model actually saw of the back catalogue for this request. */
  corpus: CorpusUsage;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

export interface CorpusUsage {
  /** Number of memes in data/corpus.json. */
  total: number;
  /** Number of memes sent as style context for this request. */
  used: number;
  /** Source filenames of the memes that were drawn, newest draw first. */
  sources: string[];
}

export interface HealthResponse {
  ok: boolean;
  model: string;
  apiKeyConfigured: boolean;
  /** True when APP_PASSWORD is set on the server and callers must supply it. */
  authRequired: boolean;
  corpus: {
    total: number;
    /** How many of those carry engagement numbers to weight the draw by. */
    withEngagement: number;
    generatedAt: string | null;
  };
  /** Default and permitted range for the style-sample size picker. */
  sample: { default: number; max: number };
}

export interface ApiError {
  error: string;
  detail?: string;
}

/** One past meme, as extracted from the account's back catalogue. */
export interface CorpusMeme {
  /** sha1 of the source image file, so re-runs of ingest are incremental. */
  id: string;
  /** Source file name, for traceability. */
  source: string;
  /** The text that appears on the meme, verbatim, newlines preserved. */
  memeText: string;
  /** Where that text sits on the image. */
  layout: MemeLayout | "other";
  /** What the photo/still actually shows. */
  imageDescription: string;
  /** The comedic device: relatable pain, self-own, pro-golf callout, etc. */
  device: string;
  /** Short tags: "slow play", "range vs course", "shanks", ... */
  topics: string[];
  /** The Instagram caption that was posted with it, if known. */
  instagramCaption?: string;
  /** How the post performed, if known. Drives the weighted draw. */
  engagement?: Engagement;
}

/** Post performance, as far as it is known. Any field may be missing. */
export interface Engagement {
  likes?: number;
  comments?: number;
  views?: number;
}

export interface Corpus {
  generatedAt: string;
  memes: CorpusMeme[];
}
