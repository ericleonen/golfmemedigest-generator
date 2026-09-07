"use client";

import type { ReferenceRef } from "@/shared/types";

interface Props {
  references: ReferenceRef[];
  /** Expanded shows them full size side by side; collapsed shows thumbnails. */
  expanded: boolean;
  onToggle?: () => void;
  /** Suppresses the toggle when the parent is already showing them expanded. */
  static?: boolean;
}

/**
 * The past memes behind one variant. Collapsed it is a row of thumbnails you
 * can tap; expanded it lays all of them out side by side at a size where the
 * text is actually readable — which is the point, since the whole reason to
 * show them is judging whether the style carried across.
 */
export function ReferenceStrip({ references, expanded, onToggle, static: fixed }: Props) {
  if (references.length === 0) return null;

  return (
    <div className={`refs${expanded ? " refs--open" : ""}`}>
      {!fixed && (
        <button type="button" className="refs__toggle" onClick={onToggle}>
          {expanded ? "Hide" : "Styled on"}
          <span className="refs__count">{references.length}</span>
        </button>
      )}

      <div className="refs__row">
        {references.map((reference) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={reference.name}
            className="refs__img"
            src={reference.url}
            alt={reference.name}
            title={reference.name}
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}
