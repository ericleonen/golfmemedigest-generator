import { useState } from "react";
import type { MemeVariant } from "@/shared/types";
import { MEME_LAYOUTS } from "@/shared/types";

interface Props {
  variant: MemeVariant;
  onChange: (patch: Partial<MemeVariant>) => void;
  onDownload: () => void;
  downloading: boolean;
}

const LAYOUT_LABELS: Record<string, string> = {
  "top-bottom": "Top + bottom",
  "caption-bar": "Caption bar",
  "lower-third": "Bottom only",
};

export function VariantEditor({ variant, onChange, onDownload, downloading }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const captionBlock = [
    variant.instagramCaption,
    variant.hashtags.map((tag) => `#${tag}`).join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied("clipboard blocked");
      setTimeout(() => setCopied(null), 1600);
    }
  };

  return (
    <div className="editor">
      <div className="editor__row">
        <label className="field">
          <span className="field__label">Layout</span>
          <select
            value={variant.layout}
            onChange={(event) =>
              onChange({ layout: event.target.value as MemeVariant["layout"] })
            }
          >
            {MEME_LAYOUTS.map((layout) => (
              <option key={layout} value={layout}>
                {LAYOUT_LABELS[layout]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {variant.layout === "caption-bar" ? (
        <label className="field">
          <span className="field__label">Caption bar text</span>
          <textarea
            rows={3}
            value={variant.captionText}
            onChange={(event) => onChange({ captionText: event.target.value })}
          />
        </label>
      ) : (
        <>
          {variant.layout === "top-bottom" && (
            <label className="field">
              <span className="field__label">Top text</span>
              <textarea
                rows={2}
                value={variant.topText}
                onChange={(event) => onChange({ topText: event.target.value })}
              />
            </label>
          )}
          <label className="field">
            <span className="field__label">Bottom text</span>
            <textarea
              rows={2}
              value={variant.bottomText}
              onChange={(event) => onChange({ bottomText: event.target.value })}
            />
          </label>
        </>
      )}

      <label className="field">
        <span className="field__label">Instagram caption</span>
        <textarea
          rows={3}
          value={variant.instagramCaption}
          onChange={(event) => onChange({ instagramCaption: event.target.value })}
        />
      </label>

      <label className="field">
        <span className="field__label">Hashtags</span>
        <input
          type="text"
          value={variant.hashtags.map((tag) => `#${tag}`).join(" ")}
          onChange={(event) =>
            onChange({
              hashtags: event.target.value
                .split(/[\s,]+/)
                .map((tag) => tag.replace(/^#/, "").trim())
                .filter(Boolean),
            })
          }
        />
      </label>

      <div className="editor__actions">
        <button type="button" className="button" onClick={onDownload} disabled={downloading}>
          {downloading ? "Exporting…" : "Download PNG"}
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => void copy("caption", captionBlock)}
        >
          Copy caption
        </button>
        {copied && <span className="editor__copied">{copied === "caption" ? "Copied" : copied}</span>}
      </div>
    </div>
  );
}
