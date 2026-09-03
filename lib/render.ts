import type { MemeVariant } from "@/shared/types";

/**
 * Canvas meme renderer. The same function draws the on-screen previews and the
 * file that gets downloaded, so what you pick is exactly what you post.
 */

const IMPACT_FALLBACK = `Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;
const SANS_FALLBACK = `"Helvetica Neue", Arial, sans-serif`;

/**
 * next/font generates a hashed family name and exposes it as a CSS variable, so
 * the canvas has to read the variable rather than hardcode "Anton" / "Inter".
 */
function stack(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return family ? `${family}, ${fallback}` : fallback;
}

const impactStack = () => stack("--font-anton", IMPACT_FALLBACK);
const sansStack = () => stack("--font-inter", SANS_FALLBACK);

const LINE_HEIGHT = 1.06;
const CAPTION_LINE_HEIGHT = 1.3;

export interface RenderSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * Anton and Inter are webfonts, so the first draw has to wait for them or the
 * browser silently substitutes a fallback and the layout shifts afterwards.
 */
export async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await Promise.all([
      document.fonts.load(`400 100px ${impactStack()}`),
      document.fonts.load(`700 100px ${sansStack()}`),
    ]);
    await document.fonts.ready;
  } catch {
    // Fall back to whatever the system has; the stacks above still look fine.
  }
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
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

interface FitOptions {
  font: (size: number) => string;
  maxWidth: number;
  maxHeight: number;
  startSize: number;
  minSize: number;
  lineHeight: number;
}

/** Shrinks the font until the wrapped text fits the box it has been given. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: FitOptions,
): { lines: string[]; size: number } {
  let lines: string[] = [];
  let size = opts.startSize;
  for (; size >= opts.minSize; size -= Math.max(1, Math.round(size * 0.04))) {
    ctx.font = opts.font(size);
    lines = wrap(ctx, text, opts.maxWidth);
    const widest = lines.reduce(
      (max, line) => Math.max(max, ctx.measureText(line).width),
      0,
    );
    const height = lines.length * size * opts.lineHeight;
    if (widest <= opts.maxWidth && height <= opts.maxHeight) {
      return { lines, size };
    }
  }
  size = opts.minSize;
  ctx.font = opts.font(size);
  return { lines: wrap(ctx, text, opts.maxWidth), size };
}

function drawImpactLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  size: number,
  centerX: number,
  top: number,
): void {
  ctx.font = `400 ${size}px ${impactStack()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(2, size * 0.15);
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#ffffff";

  lines.forEach((line, i) => {
    const y = top + i * size * LINE_HEIGHT;
    ctx.strokeText(line, centerX, y);
    ctx.fillText(line, centerX, y);
  });
}

/** Darkens the area behind bottom text so white-on-white stays readable. */
function drawScrim(
  ctx: CanvasRenderingContext2D,
  width: number,
  fromY: number,
  toY: number,
): void {
  const gradient = ctx.createLinearGradient(0, fromY, 0, toY);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, fromY, width, toY - fromY);
}

export interface RenderOptions {
  /** Longest edge of the output, in pixels. */
  maxWidth?: number;
}

export function renderMeme(
  source: RenderSource,
  variant: MemeVariant,
  options: RenderOptions = {},
): HTMLCanvasElement {
  const maxWidth = options.maxWidth ?? 1400;
  const scale = Math.min(1, maxWidth / source.width);
  const width = Math.round(source.width * scale);
  const imageHeight = Math.round(source.height * scale);

  const canvas = document.createElement("canvas");
  const measureCtx = canvas.getContext("2d");
  if (!measureCtx) throw new Error("Canvas 2D is unavailable in this browser.");

  const margin = Math.round(width * 0.035);
  const textWidth = width - margin * 2;

  if (variant.layout === "caption-bar") {
    const captionSize = Math.round(width * 0.058);
    measureCtx.font = `700 ${captionSize}px ${sansStack()}`;
    const lines = wrap(measureCtx, variant.captionText || " ", textWidth);
    const barHeight = Math.round(
      lines.length * captionSize * CAPTION_LINE_HEIGHT + margin * 2,
    );

    canvas.width = width;
    canvas.height = imageHeight + barHeight;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, barHeight);
    ctx.fillStyle = "#111111";
    ctx.font = `700 ${captionSize}px ${sansStack()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      ctx.fillText(
        line,
        width / 2,
        margin + i * captionSize * CAPTION_LINE_HEIGHT,
      );
    });

    ctx.drawImage(source.image, 0, barHeight, width, imageHeight);
    return canvas;
  }

  canvas.width = width;
  canvas.height = imageHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source.image, 0, 0, width, imageHeight);

  const impactFont = (size: number) => `400 ${size}px ${impactStack()}`;
  const startSize = Math.round(width * 0.115);
  const minSize = Math.round(width * 0.042);

  if (variant.layout === "top-bottom" && variant.topText.trim()) {
    const top = fit(ctx, variant.topText.toUpperCase(), {
      font: impactFont,
      maxWidth: textWidth,
      maxHeight: imageHeight * 0.34,
      startSize,
      minSize,
      lineHeight: LINE_HEIGHT,
    });
    drawImpactLines(ctx, top.lines, top.size, width / 2, margin);
  }

  const bottomText = variant.bottomText.trim();
  if (bottomText) {
    const bottom = fit(ctx, bottomText.toUpperCase(), {
      font: impactFont,
      maxWidth: textWidth,
      maxHeight: imageHeight * (variant.layout === "lower-third" ? 0.4 : 0.34),
      startSize,
      minSize,
      lineHeight: LINE_HEIGHT,
    });
    const blockHeight = bottom.lines.length * bottom.size * LINE_HEIGHT;
    const top = imageHeight - margin - blockHeight;

    if (variant.layout === "lower-third") {
      drawScrim(ctx, width, Math.max(0, top - margin * 2), imageHeight);
    }
    drawImpactLines(ctx, bottom.lines, bottom.size, width / 2, top);
  }

  return canvas;
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
