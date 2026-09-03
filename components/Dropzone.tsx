"use client";

import { useCallback, useRef, useState } from "react";
import type { LoadedImage } from "@/lib/image";
import { loadImageFile } from "@/lib/image";

interface Props {
  image: LoadedImage | null;
  onImage: (image: LoadedImage) => void;
  onError: (message: string) => void;
}

export function Dropzone({ image, onImage, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        onImage(await loadImageFile(file));
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      }
    },
    [onImage, onError],
  );

  return (
    <div
      className={`dropzone${dragging ? " dropzone--active" : ""}${image ? " dropzone--filled" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void accept(event.dataTransfer.files[0]);
      }}
      onPaste={(event) => {
        const file = event.clipboardData.files[0];
        if (file) void accept(file);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(event) => {
          void accept(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.element.src} alt="" className="dropzone__preview" />
          <p className="dropzone__meta">
            {image.name} · {image.width}×{image.height} · tap to replace
          </p>
        </>
      ) : (
        <>
          <p className="dropzone__title">Add a photo</p>
          <p className="dropzone__hint">drop it here, tap to browse, or paste</p>
        </>
      )}
    </div>
  );
}
