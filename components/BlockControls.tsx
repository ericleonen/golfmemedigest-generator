"use client";

import { FONT_KEYS, type FontKey, type TextBlock } from "@/shared/types";

const FONT_LABELS: Record<FontKey, string> = {
  impact: "Impact",
  condensed: "Condensed",
  sans: "Sans",
  serif: "Serif",
  hand: "Hand",
};

interface Props {
  block: TextBlock;
  index: number;
  total: number;
  onChange: (patch: Partial<TextBlock>) => void;
}

/**
 * Everything a human should need after Claude has done the design: change a few
 * words, nudge the size, swap the face, flip the colour. Position is handled by
 * dragging the text on the canvas itself.
 */
export function BlockControls({ block, index, total, onChange }: Props) {
  return (
    <div className="block-controls">
      <p className="block-controls__label">
        Text {index + 1} of {total} · drag it on the image to move it
      </p>

      <textarea
        rows={2}
        value={block.text}
        onChange={(event) => onChange({ text: event.target.value })}
        aria-label="Text"
      />

      <label className="slider">
        <span>Size</span>
        <input
          type="range"
          min={2}
          max={30}
          step={0.5}
          value={block.size * 100}
          onChange={(event) => onChange({ size: Number(event.target.value) / 100 })}
        />
      </label>

      <div className="chips">
        {FONT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`chip${block.font === key ? " chip--on" : ""}`}
            onClick={() => onChange({ font: key })}
          >
            {FONT_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="chips">
        <button
          type="button"
          className={`chip${block.color === "#ffffff" ? " chip--on" : ""}`}
          onClick={() => onChange({ color: "#ffffff", stroke: "black" })}
        >
          White
        </button>
        <button
          type="button"
          className={`chip${block.color !== "#ffffff" ? " chip--on" : ""}`}
          onClick={() => onChange({ color: "#111111", stroke: "none" })}
        >
          Black
        </button>
        <button
          type="button"
          className={`chip${block.uppercase ? " chip--on" : ""}`}
          onClick={() => onChange({ uppercase: !block.uppercase })}
        >
          CAPS
        </button>
        <button
          type="button"
          className={`chip${block.stroke !== "none" ? " chip--on" : ""}`}
          onClick={() => onChange({ stroke: block.stroke === "none" ? "black" : "none" })}
        >
          Outline
        </button>
      </div>
    </div>
  );
}
