"use client";

import { useEffect, useMemo, useState } from "react";
import type { CorpusUsage, HealthResponse, MemeVariant } from "@/shared/types";
import { Dropzone } from "@/components/Dropzone";
import { MemePreview } from "@/components/MemePreview";
import { VariantEditor } from "@/components/VariantEditor";
import {
  UnauthorizedError,
  fetchHealth,
  generateMemes,
  getPassword,
  setPassword,
} from "@/lib/api";
import type { LoadedImage } from "@/lib/image";
import { downloadCanvas, ensureFonts, renderMeme } from "@/lib/render";

const COUNT_CHOICES = [2, 4, 6];

export default function Page() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(4);
  const [variants, setVariants] = useState<MemeVariant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corpus, setCorpus] = useState<CorpusUsage | null>(null);
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
    () =>
      image
        ? { image: image.element, width: image.width, height: image.height }
        : null,
    [image],
  );

  const selected = variants.find((variant) => variant.id === selectedId) ?? null;

  const generate = async () => {
    if (!image || loading) return;
    setLoading(true);
    setError(null);
    setVariants([]);
    setSelectedId(null);
    try {
      const result = await generateMemes({
        image: image.apiDataUrl,
        prompt: prompt.trim() || undefined,
        count,
      });
      setVariants(result.variants);
      setSelectedId(result.variants[0]?.id ?? null);
      setCorpus(result.corpus);
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

  const updateSelected = (patch: Partial<MemeVariant>) => {
    if (!selectedId) return;
    setVariants((current) =>
      current.map((variant) =>
        variant.id === selectedId ? { ...variant, ...patch } : variant,
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

  const corpusNote = corpus ?? (health ? { ...health.corpus, used: 0 } : null);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1 className="header__title">@golfmemedigest</h1>
          <p className="header__subtitle">
            Photo in, meme out — written in the account's own voice.
          </p>
        </div>
        {corpusNote && (
          <p className="header__badge">
            {corpusNote.total > 0
              ? `Styled on ${corpusNote.total} past post${
                  corpusNote.total === 1 ? "" : "s"
                }${
                  corpus && corpus.mode === "sample"
                    ? ` · ${corpus.used} sampled this run`
                    : ""
                }`
              : "No back catalogue ingested yet — run npm run ingest"}
          </p>
        )}
      </header>

      <section className="controls">
        <Dropzone image={image} onImage={setImage} onError={setError} />

        <div className="controls__form">
          <label className="field">
            <span className="field__label">
              Steer the joke <span className="field__optional">optional</span>
            </span>
            <input
              type="text"
              placeholder="e.g. slow play, or: he thinks he's due"
              value={prompt}
              maxLength={200}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void generate();
              }}
            />
          </label>

          <div className="field">
            <span className="field__label">Variants</span>
            <div className="segmented">
              {COUNT_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={`segmented__item${
                    count === choice ? " segmented__item--active" : ""
                  }`}
                  onClick={() => setCount(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>

          {(needsPassword || (health?.authRequired && password)) && (
            <label className="field">
              <span className="field__label">Access password</span>
              <input
                type="password"
                value={password}
                placeholder="Set by whoever runs this instance"
                onChange={(event) => {
                  setPasswordState(event.target.value);
                  setPassword(event.target.value);
                  if (event.target.value) setNeedsPassword(false);
                }}
              />
            </label>
          )}

          <button
            type="button"
            className="button button--primary"
            disabled={!image || loading}
            onClick={() => void generate()}
          >
            {loading ? "Writing memes…" : "Generate memes"}
          </button>

          {health && !health.apiKeyConfigured && (
            <p className="notice notice--warn">
              The server has no Anthropic API key. Add <code>ANTHROPIC_API_KEY</code> to{" "}
              <code>.env</code> and restart it.
            </p>
          )}
          {error && <p className="notice notice--error">{error}</p>}
        </div>
      </section>

      {loading && (
        <p className="status">
          Reading the photo against the back catalogue. This takes a few seconds.
        </p>
      )}

      {source && variants.length > 0 && (
        <section className="results">
          <div className="grid">
            {variants.map((variant) => (
              <button
                type="button"
                key={variant.id}
                className={`card${
                  variant.id === selectedId ? " card--selected" : ""
                }`}
                onClick={() => setSelectedId(variant.id)}
              >
                <MemePreview
                  source={source}
                  variant={variant}
                  maxWidth={560}
                  fontsReady={fontsReady}
                />
                <p className="card__angle">{variant.angle}</p>
              </button>
            ))}
          </div>

          {selected && (
            <aside className="panel">
              <h2 className="panel__title">Tweak and download</h2>
              <MemePreview
                source={source}
                variant={selected}
                maxWidth={520}
                fontsReady={fontsReady}
              />
              <VariantEditor
                variant={selected}
                onChange={updateSelected}
                onDownload={() => void download()}
                downloading={downloading}
              />
            </aside>
          )}
        </section>
      )}
    </div>
  );
}
