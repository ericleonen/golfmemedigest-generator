import type { FontKey, MemeSpec, TextBlock } from "@/shared/types";

/**
 * Canvas meme renderer. Claude decides the layout — bands, block positions,
 * fonts, colours — and this draws it. The same function produces the on-screen
 * previews and the downloaded file, so what you see is what you post.
 */

/**
 * next/font generates hashed family names and exposes them as CSS variables,
 * so the canvas reads the variable rather than hardcoding a family.
 */
const FONT_STACKS: Record<FontKey, { variable: string; fallback: string; weight: number }> = {
  impact: {
    variable: "--font-impact",
    fallback: `Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`,
    weight: 400,
  },
  condensed: {
    variable: "--font-condensed",
    fallback: `"Arial Narrow", Impact, sans-serif`,
    weight: 700,
  },
  sans: {
    variable: "--font-sans",
    fallback: `"Helvetica Neue", Arial, sans-serif`,
    weight: 700,
  },
  serif: {
    variable: "--font-serif",
    fallback: `Georgia, "Times New Roman", serif`,
    weight: 700,
  },
  hand: {
    variable: "--font-hand",
    fallback: `"Bradley Hand", "Comic Sans MS", cursive`,
    weight: 700,
  },
};

const LINE_HEIGHT = 1.12;

function fontString(key: FontKey, size: number): string {
  const stack = FONT_STACKS[key] ?? FONT_STACKS.impact;
  let family = stack.fallback;
  if (typeof document !== "undefined") {
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(stack.variable)
      .trim();
    if (resolved) family = `${resolved}, ${stack.fallback}`;
  }
  return `${stack.weight} ${size}px ${family}`;
}

/** Webfonts must be loaded before the first draw or the layout shifts after. */
export async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await Promise.all(
      (Object.keys(FONT_STACKS) as FontKey[]).map((key) =>
        document.fonts.load(fontString(key, 100)),
      ),
    );
    await document.fonts.ready;
  } catch {
    // Fall back to system fonts; the stacks above still render.
  }
}

export interface RenderSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Lays out one block at the size Claude asked for, shrinking only if a single
 * unbreakable word would still overflow. Claude's size is a design decision, so
 * it is honoured wherever it fits.
 */
function layout(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  canvasWidth: number,
): { lines: string[]; size: number } {
  const text = block.uppercase ? block.text.toUpperCase() : block.text;
  const maxWidth = block.width * canvasWidth;
  let size = Math.max(8, block.size * canvasWidth);

  for (let attempt = 0; attempt < 24; attempt++) {
    ctx.font = fontString(block.font, size);
    const lines = wrap(ctx, text, maxWidth);
    const widest = lines.reduce(
      (max, line) => Math.max(max, ctx.measureText(line).width),
      0,
    );
    if (widest <= maxWidth || size <= 10) return { lines, size };
    size *= 0.94;
  }

  ctx.font = fontString(block.font, size);
  return { lines: wrap(ctx, text, maxWidth), size };
}

/**
 * Everything needed to draw or hit-test one block, with its centre nudged so
 * the text stays inside the canvas. Claude places blocks by eye and the human
 * drags them around, so neither can be trusted to keep a two-line heading off
 * the top edge — this is the backstop that makes clipping impossible.
 */
function resolve(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  canvasWidth: number,
  canvasHeight: number,
) {
  const { lines, size } = layout(ctx, block, canvasWidth);
  const widest = lines.reduce(
    (max, line) => Math.max(max, ctx.measureText(line).width),
    0,
  );
  const height = lines.length * size * LINE_HEIGHT;
  // The outline is painted centred on the glyph edge, so half of it sits
  // outside the measured box — margin has to cover that or strokes kiss the
  // canvas edge even when the text itself is inside.
  const strokeAllowance =
    block.stroke === "none" ? 0 : Math.max(2, size * 0.16) / 2;
  const margin = canvasWidth * 0.022 + strokeAllowance;

  const halfWidth = widest / 2;
  const halfHeight = height / 2;

  // A block wider or taller than the canvas gets centred rather than jammed
  // against an edge; anything else is pushed just inside the margin.
  const centreX =
    widest + margin * 2 >= canvasWidth
      ? canvasWidth / 2
      : Math.min(
          Math.max(block.x * canvasWidth, halfWidth + margin),
          canvasWidth - halfWidth - margin,
        );
  const centreY =
    height + margin * 2 >= canvasHeight
      ? canvasHeight / 2
      : Math.min(
          Math.max(block.y * canvasHeight, halfHeight + margin),
          canvasHeight - halfHeight - margin,
        );

  return { lines, size, widest, height, centreX, centreY };
}

/** The box a block occupies, in canvas pixels. Used for drawing and hit-testing. */
export function blockBounds(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; width: number; height: number } {
  const { widest, height, centreX, centreY } = resolve(ctx, block, canvasWidth, canvasHeight);
  return {
    x: centreX - widest / 2,
    y: centreY - height / 2,
    width: widest,
    height,
  };
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const { lines, size, height, centreX, centreY } = resolve(
    ctx,
    block,
    canvasWidth,
    canvasHeight,
  );
  const half = (block.width * canvasWidth) / 2;

  ctx.save();
  ctx.translate(centreX, centreY);
  if (block.rotation) ctx.rotate((block.rotation * Math.PI) / 180);

  ctx.font = fontString(block.font, size);
  ctx.textAlign = block.align;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  // Alignment is relative to the block's own box, so left/right anchor to the
  // edges of the width Claude gave it rather than to the canvas.
  const anchorX = block.align === "left" ? -half : block.align === "right" ? half : 0;

  lines.forEach((line, i) => {
    const y = -height / 2 + i * size * LINE_HEIGHT;
    if (block.stroke !== "none") {
      ctx.lineWidth = Math.max(2, size * 0.16);
      ctx.strokeStyle = block.stroke === "white" ? "#ffffff" : "#000000";
      ctx.strokeText(line, anchorX, y);
    }
    ctx.fillStyle = block.color;
    ctx.fillText(line, anchorX, y);
  });

  ctx.restore();
}

export interface RenderOptions {
  /** Longest edge of the output, in pixels. */
  maxWidth?: number;
  /** Draw a marquee around this block — used while editing. */
  highlightBlock?: number;
}

export function renderMeme(
  source: RenderSource,
  spec: MemeSpec,
  options: RenderOptions = {},
): HTMLCanvasElement {
  const maxWidth = options.maxWidth ?? 1400;
  const scale = Math.min(1, maxWidth / source.width);
  const width = Math.round(source.width * scale);
  const imageHeight = Math.round(source.height * scale);

  const padTop = Math.round(spec.padTop * imageHeight);
  const padBottom = Math.round(spec.padBottom * imageHeight);
  const height = imageHeight + padTop + padBottom;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");

  if (padTop > 0 || padBottom > 0) {
    ctx.fillStyle = spec.background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source.image, 0, padTop, width, imageHeight);

  spec.blocks.forEach((block) => drawBlock(ctx, block, width, height));

  if (options.highlightBlock != null) {
    const block = spec.blocks[options.highlightBlock];
    if (block) {
      const box = blockBounds(ctx, block, width, height);
      const inset = Math.max(4, width * 0.008);
      ctx.save();
      ctx.setLineDash([inset, inset]);
      ctx.lineWidth = Math.max(2, width * 0.004);
      ctx.strokeStyle = "#00e0ff";
      ctx.strokeRect(
        box.x - inset,
        box.y - inset,
        box.width + inset * 2,
        box.height + inset * 2,
      );
      ctx.restore();
    }
  }

  return canvas;
}

/** Which block is under a point, in 0-1 canvas coordinates. Topmost wins. */
export function blockAtPoint(
  source: RenderSource,
  spec: MemeSpec,
  point: { x: number; y: number },
): number | null {
  const canvas = document.createElement("canvas");
  const width = 1000;
  const imageHeight = Math.round((source.height / source.width) * width);
  const height =
    imageHeight + Math.round(spec.padTop * imageHeight) + Math.round(spec.padBottom * imageHeight);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const px = point.x * width;
  const py = point.y * height;
  const pad = width * 0.015;

  for (let i = spec.blocks.length - 1; i >= 0; i--) {
    const box = blockBounds(ctx, spec.blocks[i]!, width, height);
    if (
      px >= box.x - pad &&
      px <= box.x + box.width + pad &&
      py >= box.y - pad &&
      py <= box.y + box.height + pad
    ) {
      return i;
    }
  }
  return null;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the canvas."));
    }, type);
  });
}

export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<void> {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
