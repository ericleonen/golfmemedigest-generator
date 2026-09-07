"use client";

import { useEffect, useMemo, useState } from "react";
import type { HealthResponse, MemeSpec, TextBlock } from "@/shared/types";
import { BlockControls } from "@/components/BlockControls";
import { Dropzone } from "@/components/Dropzone";
import { Logo } from "@/components/Logo";
import { MemeCanvas } from "@/components/MemeCanvas";
import type { Usage } from "@/shared/types";
import {
  UnauthorizedError,
  fetchHealth,
  generateMemes,
  logout,
  sendFeedback,
} from "@/lib/api";
import type { LoadedImage } from "@/lib/image";
import { downloadCanvas, ensureFonts, renderMeme } from "@/lib/render";

/** Sub-cent runs still deserve a real number rather than "$0.00". */
function formatUsd(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

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
  const [usage, setUsage] = useState<Usage | null>(null);
  const [spent, setSpent] = useState(0);
  // Variant id → the vote currently showing, so a second tap can undo it.
  const [votes, setVotes] = useState<Record<string, 1 | -1>>({});
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    void ensureFonts().then(() => setFontsReady(true));
    void fetchHealth()
      .then(setHealth)
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
      setVotes({});
      setUsage(result.usage);
      setSpent((total) => total + result.usage.costUsd);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        // The session expired or was revoked; middleware will send us to /login.
        window.location.href = "/login";
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sends the change in vote rather than the new state, so tapping like twice
   * takes the vote back off and flipping like to dislike moves it by two.
   */
  const vote = async (variant: MemeSpec, next: 1 | -1) => {
    const current = votes[variant.id];
    const applied = current === next ? undefined : next;
    const delta = (applied ?? 0) - (current ?? 0);
    if (delta === 0) return;

    setVotes((all) => {
      const copy = { ...all };
      if (applied) copy[variant.id] = applied;
      else delete copy[variant.id];
      return copy;
    });
    setVoteError(null);

    try {
      await sendFeedback({
        references: variant.references.map((reference) => reference.name),
        delta,
      });
    } catch (err) {
      // Put the button back the way it was; the vote did not land.
      setVotes((all) => {
        const copy = { ...all };
        if (current) copy[variant.id] = current;
        else delete copy[variant.id];
        return copy;
      });
      setVoteError(err instanceof Error ? err.message : String(err));
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
        <div className="topbar__text">
          <p className="topbar__name">golfmemedigest</p>
          <p className="topbar__sub">meme generator</p>
        </div>
        {health?.authRequired && (
          <button
            type="button"
            className="linkish"
            onClick={() => {
              void logout().then(() => {
                window.location.href = "/login";
              });
            }}
          >
            Sign out
          </button>
        )}
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
            {health.referenceError
              ? `Could not read the reference store: ${health.referenceError}`
              : health.blobConfigured
                ? "The Blob store is connected but empty — run npm run upload."
                : "No style reference yet. Upload past memes with npm run upload, or drop them in reference/."}
          </p>
        )}
        {error && <p className="note note--bad">{error}</p>}

        {voteError && <p className="note note--bad">{voteError}</p>}

        {usage && (
          <p className="spend">
            Last run: {usage.requests} request{usage.requests === 1 ? "" : "s"} ·{" "}
            {usage.inputTokens.toLocaleString()} in / {usage.outputTokens.toLocaleString()} out ·{" "}
            <strong>{formatUsd(usage.costUsd)}</strong>
            {spent > usage.costUsd && <> · {formatUsd(spent)} this session</>}
          </p>
        )}

        {health && health.referenceImages > 0 && (
          <p className="spend">
            {health.referenceImages.toLocaleString()} reference memes ·{" "}
            {health.referenceSampleSize} drawn per variant
            {health.blobConfigured && health.feedbackVotes > 0 && (
              <> · {health.feedbackVotes} vote{health.feedbackVotes === 1 ? "" : "s"} shaping the draw</>
            )}
          </p>
        )}
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

                <div className="post__bar">
                  <p className="post__angle">{variant.angle}</p>
                  {health?.blobConfigured && (
                    <div className="votes">
                      <button
                        type="button"
                        className={`vote${votes[variant.id] === 1 ? " vote--on" : ""}`}
                        title="More memes styled like this"
                        aria-pressed={votes[variant.id] === 1}
                        onClick={() => void vote(variant, 1)}
                      >
                        Like
                      </button>
                      <button
                        type="button"
                        className={`vote${votes[variant.id] === -1 ? " vote--on" : ""}`}
                        title="Fewer memes styled like this"
                        aria-pressed={votes[variant.id] === -1}
                        onClick={() => void vote(variant, -1)}
                      >
                        Dislike
                      </button>
                    </div>
                  )}
                </div>

                {variant.references.length > 0 && (
                  <div className="refs">
                    <span className="refs__label">Styled on</span>
                    {variant.references.map((reference) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={reference.name}
                        className="refs__thumb"
                        src={reference.url}
                        alt={reference.name}
                        title={reference.name}
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}

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
