"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MemeSpec, TextBlock } from "@/shared/types";
import type { RenderSource } from "@/lib/render";
import { blockAtPoint, renderMeme } from "@/lib/render";

interface Props {
  source: RenderSource;
  spec: MemeSpec;
  maxWidth: number;
  /** Redraw trigger for when webfonts finish loading. */
  fontsReady: boolean;
  /** Interactive mode: click to select a block, drag to move it. */
  selectedBlock?: number | null;
  onSelectBlock?: (index: number | null) => void;
  onMoveBlock?: (index: number, position: { x: number; y: number }) => void;
}

export function MemeCanvas({
  source,
  spec,
  maxWidth,
  fontsReady,
  selectedBlock = null,
  onSelectBlock,
  onMoveBlock,
}: Props) {
  const holder = useRef<HTMLDivElement>(null);
  // Offset between the pointer and the block's centre when a drag starts, so
  // the block does not jump to the cursor on the first move.
  const drag = useRef<{ index: number; dx: number; dy: number } | null>(null);
  const interactive = Boolean(onMoveBlock);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const canvas = renderMeme(source, spec, {
      maxWidth,
      ...(interactive && selectedBlock != null
        ? { highlightBlock: selectedBlock }
        : {}),
    });
    canvas.className = "meme-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      spec.blocks.map((block) => block.text).join(". ") || "meme preview",
    );
    node.replaceChildren(canvas);
  }, [source, spec, maxWidth, fontsReady, selectedBlock, interactive]);

  const pointFromEvent = useCallback((event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }, []);

  if (!interactive) {
    return <div className="meme-canvas-holder" ref={holder} />;
  }

  return (
    <div
      className="meme-canvas-holder meme-canvas-holder--interactive"
      ref={holder}
      onPointerDown={(event) => {
        const point = pointFromEvent(event);
        const index = blockAtPoint(source, spec, point);
        onSelectBlock?.(index);
        if (index == null) return;
        const block: TextBlock | undefined = spec.blocks[index];
        if (!block) return;
        drag.current = { index, dx: block.x - point.x, dy: block.y - point.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (!active) return;
        event.preventDefault();
        const point = pointFromEvent(event);
        onMoveBlock?.(active.index, {
          x: Math.min(Math.max(point.x + active.dx, 0.02), 0.98),
          y: Math.min(Math.max(point.y + active.dy, 0.02), 0.98),
        });
      }}
      onPointerUp={(event) => {
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}
