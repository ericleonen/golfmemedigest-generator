import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod";
import { config } from "./config";
import { buildCorpusContext } from "./corpus";
import { MEME_LAYOUTS, type GenerateResponse } from "@/shared/types";

const client = new Anthropic();

const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

const VariantSchema = z.object({
  layout: z
    .enum(MEME_LAYOUTS as [string, ...string[]])
    .describe(
      "top-bottom = classic Impact caps over the photo. caption-bar = one sentence in a white bar above the photo, photo untouched. lower-third = a single Impact line across the bottom only.",
    ),
  topText: z
    .string()
    .describe(
      "Top Impact line. Required for top-bottom, empty string for every other layout. Keep under 60 characters.",
    ),
  bottomText: z
    .string()
    .describe(
      "Bottom Impact line, the punchline. Required for top-bottom and lower-third, empty string for caption-bar. Keep under 70 characters.",
    ),
  captionText: z
    .string()
    .describe(
      "The white-bar sentence. Required for caption-bar, empty string for every other layout. Keep under 140 characters.",
    ),
  instagramCaption: z
    .string()
    .describe("Caption to post with it. One or two lines, no hashtags here."),
  hashtags: z
    .array(z.string())
    .describe("4 to 8 hashtags, lowercase, without the leading # character."),
  angle: z
    .string()
    .describe(
      "Under 12 words naming the joke's angle, so the human can pick between variants at a glance.",
    ),
});

const ResultSchema = z.object({
  variants: z.array(VariantSchema),
});

const INSTRUCTIONS = `You are the staff meme writer for @golfmemedigest, a golf meme account on Instagram.

A human sends you one photo and, sometimes, a few words steering the joke. You write meme variants for that exact photo.

HOW TO WRITE
- Look at the photo first. Name to yourself what is actually in it: the lie, the stance, the face, the cart, the clubhouse, the scoreboard, the weather, whatever is there. Every line you write must only make sense with THIS photo. A caption that would work over any golf photo is a failed caption.
- Write from inside the game. Shanks, three-putts, the range swing versus the course swing, provisional balls, slow play, cart girl timing, the guy who buys a new driver every spring, "I'm due", scoring in the 90s and calling it 85, playing the tips, the first tee in front of strangers, winter rules, a lost sleeve of Pro V1s.
- Punch at the golfer, not at people. Self-own beats put-down. No slurs, no politics, no body-shaming, nothing about a named private individual, nothing sexual.
- Short. Meme text lives or dies on read-in-under-two-seconds. Cut every word that is not doing work. No emoji in the on-image text.
- Setup on top, turn on the bottom. Do not repeat the top line's words in the bottom line.
- On-image text is written in ALL CAPS by the renderer, so write it plainly and do not shout with punctuation.

VARIETY
- Every variant must be a genuinely different joke, not a rewording. Vary the angle: relatable pain, delusional confidence, the lie you tell your group, the pro-golf callout, the equipment cope, the pace-of-play grievance, the "nobody:" setup.
- Spread the layouts. Do not return the same layout for every variant unless the photo only works one way.

VOICE
- Below are a few memes this account has already posted, drawn at random and weighted toward the ones that performed best. They are a sample, not the whole account: read them for rhythm, length, bluntness and subject matter, and do not assume the account only posts what these few happen to cover. Do not copy a past caption word for word, and do not reuse a past joke unless the new photo genuinely earns it.`;

function buildSystem(corpusBlock: string) {
  // No cache_control here on purpose. The sample is redrawn every request, so
  // there is no stable prefix worth a breakpoint, and the instructions alone
  // fall under the API's minimum cacheable prefix.
  const text = corpusBlock
    ? `${INSTRUCTIONS}\n\n=== a few posts from @golfmemedigest ===\n\n${corpusBlock}\n\n=== end of examples ===`
    : `${INSTRUCTIONS}\n\n(No back catalogue has been ingested yet. Write in the voice described above.)`;

  return text;
}

export class BadImageError extends Error {}

/** Splits a data URL into the media type and base64 payload Claude expects. */
export function parseDataUrl(dataUrl: string): {
  mediaType: SupportedMediaType;
  data: string;
} {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) {
    throw new BadImageError(
      "Image must be a base64 data URL, e.g. data:image/jpeg;base64,...",
    );
  }
  const [, mediaType, data] = match as unknown as [string, string, string];
  if (!SUPPORTED_MEDIA_TYPES.includes(mediaType as SupportedMediaType)) {
    throw new BadImageError(
      `Unsupported image type "${mediaType}". Use JPEG, PNG, WebP or GIF.`,
    );
  }
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > config.maxImageBytes) {
    throw new BadImageError(
      `Image is ${(bytes / 1024 / 1024).toFixed(1)} MB, which is over the ${(
        config.maxImageBytes /
        1024 /
        1024
      ).toFixed(0)} MB limit.`,
    );
  }
  return { mediaType: mediaType as SupportedMediaType, data };
}

export async function generateVariants(opts: {
  image: string;
  prompt?: string;
  count: number;
  sampleSize?: number;
}): Promise<GenerateResponse> {
  const { mediaType, data } = parseDataUrl(opts.image);
  const { block, usage: corpusUsage } = buildCorpusContext(opts.sampleSize);

  const steer = opts.prompt?.trim();
  const task = [
    `Write ${opts.count} meme variants for the photo above.`,
    steer
      ? `The human steered it with: "${steer}". Treat that as the direction for every variant, and still make each one a different joke.`
      : `The human gave no steer, so find the joke in the photo yourself.`,
    `Fill topText/bottomText/captionText according to the layout you pick and leave the unused ones as empty strings.`,
  ].join("\n\n");

  const response = await client.beta.messages.parse({
    model: config.model,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    // If a safety classifier declines the request, the server retries on a
    // comparable model instead of handing back an unusable turn.
    fallbacks: "default",
    system: buildSystem(block),
    output_config: {
      effort: config.effort,
      format: betaZodOutputFormat(ResultSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data },
          },
          { type: "text", text: task },
        ],
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(
      `Claude returned no parsable output (stop reason: ${response.stop_reason}).`,
    );
  }

  const variants = parsed.variants.slice(0, opts.count).map((variant, i) => ({
    id: `${response.id}-${i}`,
    layout: variant.layout as (typeof MEME_LAYOUTS)[number],
    topText: variant.topText ?? "",
    bottomText: variant.bottomText ?? "",
    captionText: variant.captionText ?? "",
    instagramCaption: variant.instagramCaption ?? "",
    hashtags: (variant.hashtags ?? []).map((tag) => tag.replace(/^#/, "")),
    angle: variant.angle ?? "",
  }));

  if (variants.length === 0) {
    throw new Error("Claude returned zero variants. Try again.");
  }

  return {
    variants,
    corpus: corpusUsage,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
