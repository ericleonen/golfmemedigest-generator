import { useEffect, useRef } from "react";
import type { MemeVariant } from "@/shared/types";
import type { RenderSource } from "@/lib/render";
import { renderMeme } from "@/lib/render";

interface Props {
  source: RenderSource;
  variant: MemeVariant;
  maxWidth: number;
  /** Bumped after webfonts load so previews redraw with the real fonts. */
  fontsReady: boolean;
}

export function MemePreview({ source, variant, maxWidth, fontsReady }: Props) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const canvas = renderMeme(source, variant, { maxWidth });
    canvas.className = "meme-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      [variant.topText, variant.captionText, variant.bottomText]
        .filter(Boolean)
        .join(". ") || "meme preview",
    );
    node.replaceChildren(canvas);
  }, [source, variant, maxWidth, fontsReady]);

  return <div className="meme-preview" ref={holder} />;
}
