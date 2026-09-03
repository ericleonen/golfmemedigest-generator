"use client";

import { useEffect, useMemo, useState } from "react";
import type { HealthResponse, MemeSpec, TextBlock } from "@/shared/types";
import { BlockControls } from "@/components/BlockControls";
import { Dropzone } from "@/components/Dropzone";
import { Logo } from "@/components/Logo";
import { MemeCanvas } from "@/components/MemeCanvas";
import {
  UnauthorizedError,
  fetchHealth,
  generateMemes,
  getPassword,
  setPassword,
} from "@/lib/api";
import type { LoadedImage } from "@/lib/image";
import { downloadCanvas, ensureFonts, renderMeme } from "@/lib/render";

export default function Page() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [variants, setVariants] = useState<MemeSpec[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [password, setPasswordState] = useState(getPassword);
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    void ensureFonts().then(() => setFontsReady(true));
    void fetchHealth()
      .then((result) => {
        setHealth(result);
        if (result.authRequired && !getPassword()) setNeedsPassword(true);
      })
      .catch(() => setHealth(null));
  }, []);

  const source = useMemo(
    () => (image ? { image: image.element, width: image.width, height: image.height } : null),
    [image],
  );

  const selected = variants.find((variant) => variant.id === selectedId) ?? null;
  const block = selected && selectedBlock != null ? selected.blocks[selectedBlock] : null;

  const generate = async () => {
    if (!image || loading) return;
    setLoading(true);
    setError(null);
    setVariants([]);
    setSelectedId(null);
    setSelectedBlock(null);
    try {
      const result = await generateMemes({
        image: image.apiDataUrl,
        prompt: prompt.trim() || undefined,
      });
      setVariants(result.variants);
      setSelectedId(result.variants[0]?.id ?? null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setNeedsPassword(true);
        setPassword("");
        setPasswordState("");
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const updateBlock = (patch: Partial<TextBlock>) => {
    if (!selectedId || selectedBlock == null) return;
    setVariants((current) =>
      current.map((variant) =>
        variant.id === selectedId
          ? {
              ...variant,
              blocks: variant.blocks.map((item, i) =>
                i === selectedBlock ? { ...item, ...patch } : item,
              ),
            }
          : variant,
      ),
    );
  };

  const download = async () => {
    if (!source || !selected || !image) return;
    setDownloading(true);
    try {
      // Re-render at full resolution rather than upscaling the preview.
      const canvas = renderMeme(source, selected, { maxWidth: image.width });
      await downloadCanvas(canvas, `${image.name}-golfmemedigest.png`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  };

  const copyCaption = async () => {
    if (!selected) return;
    const text = [selected.instagramCaption, selected.hashtags.map((t) => `#${t}`).join(" ")]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Your browser blocked clipboard access.");
    }
  };

  return (
    <main className="app">
      <header className="topbar">
        <Logo />
        <div>
          <p className="topbar__name">golfmemedigest</p>
          <p className="topbar__sub">meme generator</p>
        </div>
      </header>

      <section className="composer">
        <Dropzone image={image} onImage={setImage} onError={setError} />

        <input
          type="text"
          className="steer"
          placeholder="Add a steer — optional"
          value={prompt}
          maxLength={200}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void generate();
          }}
        />

        {(needsPassword || (health?.authRequired && password)) && (
          <input
            type="password"
            className="steer"
            placeholder="Access password"
            value={password}
            onChange={(event) => {
              setPasswordState(event.target.value);
              setPassword(event.target.value);
              if (event.target.value) setNeedsPassword(false);
            }}
          />
        )}

        <button
          type="button"
          className="primary"
          disabled={!image || loading}
          onClick={() => void generate()}
        >
          {loading ? "Writing…" : "Generate"}
        </button>

        {health && !health.apiKeyConfigured && (
          <p className="note">
            No API key on the server. Set <code>ANTHROPIC_API_KEY</code> and redeploy.
          </p>
        )}
        {health && health.apiKeyConfigured && health.referenceImages === 0 && (
          <p className="note">
            No style reference yet — add past memes to <code>reference/</code> and redeploy.
          </p>
        )}
        {error && <p className="note note--bad">{error}</p>}
      </section>

      {loading && <p className="status">Reading the photo. This takes a few seconds.</p>}

      {source && variants.length > 0 && (
        <section className="feed">
          {variants.map((variant) => {
            const isSelected = variant.id === selectedId;
            return (
              <article key={variant.id} className={`post${isSelected ? " post--open" : ""}`}>
                {isSelected ? (
                  <MemeCanvas
                    source={source}
                    spec={variant}
                    maxWidth={720}
                    fontsReady={fontsReady}
                    selectedBlock={selectedBlock}
                    onSelectBlock={setSelectedBlock}
                    onMoveBlock={(index, position) => {
                      setSelectedBlock(index);
                      setVariants((current) =>
                        current.map((item) =>
                          item.id === variant.id
                            ? {
                                ...item,
                                blocks: item.blocks.map((b, i) =>
                                  i === index ? { ...b, ...position } : b,
                                ),
                              }
                            : item,
                        ),
                      );
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="post__pick"
                    onClick={() => {
                      setSelectedId(variant.id);
                      setSelectedBlock(null);
                    }}
                  >
                    <MemeCanvas
                      source={source}
                      spec={variant}
                      maxWidth={720}
                      fontsReady={fontsReady}
                    />
                  </button>
                )}

                <p className="post__angle">{variant.angle}</p>

                {isSelected && (
                  <div className="post__edit">
                    {block ? (
                      <BlockControls
                        block={block}
                        index={selectedBlock!}
                        total={variant.blocks.length}
                        onChange={updateBlock}
                      />
                    ) : (
                      <p className="hint">Tap any text on the image to edit it.</p>
                    )}

                    <label className="field">
                      <span>Caption</span>
                      <textarea
                        rows={2}
                        value={variant.instagramCaption}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((item) =>
                              item.id === variant.id
                                ? { ...item, instagramCaption: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>

                    <div className="actions">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void download()}
                        disabled={downloading}
                      >
                        {downloading ? "Saving…" : "Download"}
                      </button>
                      <button type="button" className="ghost" onClick={() => void copyCaption()}>
                        {copied ? "Copied" : "Copy caption"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
