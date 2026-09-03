import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod";
import { config } from "./config";
import { pickReferences } from "./reference";
import { FONT_KEYS, type GenerateResponse, type MemeSpec } from "@/shared/types";

const client = new Anthropic();

const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

const HEX = /^#[0-9a-fA-F]{6}$/;

const TextBlockSchema = z.object({
  text: z.string().describe("The words. Keep meme text short enough to read in two seconds."),
  font: z
    .enum(FONT_KEYS as [string, ...string[]])
    .describe(
      "impact = heavy condensed caps, the classic meme look. condensed = tall narrow bold sans. sans = clean neutral, screenshot energy. serif = elegant high-contrast, deadpan and editorial. hand = loose handwriting, an annotation scrawled on.",
    ),
  uppercase: z.boolean().describe("Render in ALL CAPS. True for impact, usually false for serif and hand."),
  color: z.string().describe('Hex fill, e.g. "#ffffff" or "#111111".'),
  stroke: z
    .enum(["black", "white", "none"])
    .describe(
      "Outline behind the fill, so text stays readable over a busy photo. Use none when the text sits on a flat band.",
    ),
  align: z.enum(["left", "center", "right"]),
  x: z.number().describe("Horizontal centre of this block, 0 = left edge, 1 = right edge."),
  y: z.number().describe("Vertical centre of this block, 0 = top of the whole canvas, 1 = bottom."),
  width: z.number().describe("Longest line allowed, as a fraction of canvas width. 0.9 is nearly edge to edge."),
  size: z.number().describe("Font size as a fraction of canvas width. 0.11 is a big meme line, 0.04 is a small aside."),
  rotation: z.number().describe("Tilt in degrees, -20 to 20. Use 0 unless the tilt is the joke."),
});

const VariantSchema = z.object({
  padTop: z
    .number()
    .describe("Solid band added ABOVE the photo, as a fraction of photo height. 0 for text over the photo, ~0.2 for a caption bar."),
  padBottom: z
    .number()
    .describe("Solid band added BELOW the photo, as a fraction of photo height. 0 for none."),
  background: z.string().describe('Hex fill for those bands, e.g. "#ffffff" or "#000000".'),
  blocks: z.array(TextBlockSchema).describe("Every run of text on this meme. One, two, or several."),
  angle: z.string().describe("Under 12 words naming the joke's angle, so a human can choose at a glance."),
  instagramCaption: z.string().describe("Caption to post with it. One or two lines, no hashtags here."),
  hashtags: z.array(z.string()).describe("4 to 8 hashtags, lowercase, without the leading # character."),
});

const ResultSchema = VariantSchema;

const INSTRUCTIONS = `You are the staff meme writer and designer for @golfmemedigest, a golf meme account on Instagram.

A human sends you one photo and, sometimes, a few words steering the joke. You write ONE meme for it — the joke AND the layout.

HOW TO WRITE
- Look at the photo first. Name to yourself what is actually in it: the lie, the stance, the face, the cart, the clubhouse, the scoreboard, the weather. Every line must only make sense with THIS photo. A caption that would work over any golf photo is a failed caption.
- Write from inside the game. Shanks, three-putts, the range swing versus the course swing, provisional balls, slow play, cart girl timing, the guy who buys a new driver every spring, "I'm due", scoring in the 90s and calling it 85, playing the tips, the first tee in front of strangers, winter rules, a lost sleeve of Pro V1s.
- Punch at the golfer, not at people. Self-own beats put-down. No slurs, no politics, no body-shaming, nothing about a named private individual, nothing sexual.
- Short. Cut every word not doing work. No emoji in the on-image text.

HOW TO LAY IT OUT
You control the whole canvas. The canvas is the photo, optionally with a solid band added above it (padTop) and/or below it (padBottom). Every text block is placed by its centre, in fractions of the FULL canvas: x from 0 (left) to 1 (right), y from 0 (top) to 1 (bottom).

Choose a treatment that fits this photo and this joke. Some that work:
- Impact caps top and bottom over the photo: padTop 0, padBottom 0, two blocks at y around 0.08 and 0.92, font impact, white with black stroke, size around 0.1.
- Caption bar: padTop about 0.18, background "#ffffff", one sans block at y about 0.09 in near-black with stroke none. Reads like a tweet above an untouched photo.
- One line across the bottom: a single impact or condensed block at y about 0.9.
- A label pinned to something in the frame: a small block placed right on the object it names, maybe tilted a few degrees. Use the actual position of the thing in the photo.
- Setup on a band above, punchline over the photo. Or a handwritten aside in a corner. Or a serif line, small and centred, played completely straight.

Rules that keep it readable:
- Text over photo needs a stroke. Text on a solid band should have stroke "none".
- Keep blocks inside the canvas: y minus half the text height must stay above 0, and below 1 at the bottom. Leave a margin of about 0.04.
- Do not let blocks overlap each other, and do not cover the face or the subject of the joke.
- If you add a band, put text in it. Do not add a band and then place everything over the photo.
- Pick the treatment this photo and this joke want. Do not default to Impact caps every time.

STYLE REFERENCE
The images before the new photo are recent posts from this account, drawn at random for this request. They are a tiny sample, not the whole account — a different writer working on the same photo right now is looking at different ones. Read yours for the voice, the joke construction, and the visual habits: where text sits, how big it is, which typeface, whether there is a band. Let the posts you were given pull you toward the kind of joke and the kind of layout they represent. Match the house style; do not copy a past caption word for word.`;

function contentBlocks(
  references: ReturnType<typeof pickReferences>,
  photo: { mediaType: SupportedMediaType; data: string },
  task: string,
): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];

  if (references.length > 0) {
    blocks.push({
      type: "text",
      text: `Here ${references.length === 1 ? "is" : "are"} ${references.length} recent post${
        references.length === 1 ? "" : "s"
      } from @golfmemedigest, for style:`,
    });
    for (const reference of references) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: reference.mediaType, data: reference.data },
      });
    }
  }

  blocks.push({ type: "text", text: "Here is the new photo to make memes from:" });
  blocks.push({
    type: "image",
    source: { type: "base64", media_type: photo.mediaType, data: photo.data },
  });
  blocks.push({ type: "text", text: task });

  return blocks;
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
      `Image is ${(bytes / 1024 / 1024).toFixed(1)} MB, over the ${(
        config.maxImageBytes /
        1024 /
        1024
      ).toFixed(0)} MB limit.`,
    );
  }
  return { mediaType: mediaType as SupportedMediaType, data };
}

const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;

const hex = (value: string, fallback: string) =>
  HEX.test(value) ? value.toLowerCase() : fallback;

/**
 * Claude picks the layout, but nothing it returns is allowed to produce an
 * unrenderable canvas — a negative size, a block off the edge, a colour that is
 * not a colour. Clamp rather than reject: a slightly-off number is still a
 * usable meme the human can nudge.
 */
function normalise(
  variant: z.infer<typeof VariantSchema>,
  id: string,
  references: string[],
): MemeSpec {
  const blocks = (variant.blocks ?? [])
    .filter((block) => block.text?.trim())
    .slice(0, 8)
    .map((block) => ({
      text: block.text.trim(),
      font: (FONT_KEYS as string[]).includes(block.font)
        ? (block.font as MemeSpec["blocks"][number]["font"])
        : "impact",
      uppercase: Boolean(block.uppercase),
      color: hex(block.color ?? "", "#ffffff"),
      stroke: (["black", "white", "none"] as const).includes(block.stroke)
        ? block.stroke
        : "black",
      align: (["left", "center", "right"] as const).includes(block.align)
        ? block.align
        : "center",
      x: clamp(block.x, 0.02, 0.98, 0.5),
      y: clamp(block.y, 0.02, 0.98, 0.5),
      width: clamp(block.width, 0.15, 1, 0.9),
      size: clamp(block.size, 0.02, 0.3, 0.09),
      rotation: clamp(block.rotation, -20, 20, 0),
    }));

  return {
    id,
    padTop: clamp(variant.padTop, 0, 0.6, 0),
    padBottom: clamp(variant.padBottom, 0, 0.6, 0),
    background: hex(variant.background ?? "", "#ffffff"),
    blocks,
    angle: variant.angle ?? "",
    instagramCaption: variant.instagramCaption ?? "",
    hashtags: (variant.hashtags ?? []).map((tag) => tag.replace(/^#/, "")),
    references,
  };
}

/** One API call: its own random reference draw, one meme back. */
async function generateOne(
  photo: { mediaType: SupportedMediaType; data: string },
  task: string,
  index: number,
): Promise<{ variant: MemeSpec; inputTokens: number; outputTokens: number }> {
  const references = pickReferences();

  const response = await client.beta.messages.parse({
    model: config.model,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    // If a safety classifier declines the request, the server retries on a
    // comparable model instead of handing back an unusable turn.
    fallbacks: "default",
    system: INSTRUCTIONS,
    output_config: {
      effort: config.effort,
      format: betaZodOutputFormat(ResultSchema),
    },
    messages: [
      { role: "user", content: contentBlocks(references, photo, task) },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(
      `Claude returned no parsable output (stop reason: ${response.stop_reason}).`,
    );
  }

  return {
    variant: normalise(
      parsed,
      `${response.id}-${index}`,
      references.map((reference) => reference.name),
    ),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Fans out one request per variant, in parallel.
 *
 * Each call draws its own 2-3 reference memes, which is what makes the variants
 * genuinely diverge — they are not four rewrites of one idea, they are four
 * independent attempts primed by different past posts. It also keeps each
 * response short, which matters against a serverless wall-clock limit.
 *
 * A failed call loses its variant rather than the run; only an entirely failed
 * fan-out throws.
 */
export async function generateVariants(opts: {
  image: string;
  prompt?: string;
  count: number;
}): Promise<GenerateResponse> {
  const photo = parseDataUrl(opts.image);

  const steer = opts.prompt?.trim();
  const task = [
    `Write and lay out ONE meme for that photo.`,
    steer
      ? `The human steered it with: "${steer}". Take that as the direction.`
      : `The human gave no steer, so find the joke in the photo yourself.`,
    `Several other writers are working on the same photo in parallel, so commit to the angle the reference posts above suggest to you rather than reaching for the most obvious line.`,
  ].join("\n\n");

  const settled = await Promise.allSettled(
    Array.from({ length: opts.count }, (_, i) => generateOne(photo, task, i)),
  );

  const variants: MemeSpec[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let firstError: unknown = null;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      inputTokens += result.value.inputTokens;
      outputTokens += result.value.outputTokens;
      if (result.value.variant.blocks.length > 0) variants.push(result.value.variant);
    } else if (!firstError) {
      firstError = result.reason;
    }
  }

  if (variants.length === 0) {
    if (firstError) throw firstError;
    throw new Error("Claude returned no usable variants. Try again.");
  }

  const costUsd =
    (inputTokens / 1_000_000) * config.inputPricePerMTok +
    (outputTokens / 1_000_000) * config.outputPricePerMTok;

  return {
    variants,
    usage: {
      inputTokens,
      outputTokens,
      costUsd,
      requests: settled.length,
    },
  };
}
