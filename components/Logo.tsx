/**
 * The account mark. By default this is a CSS reconstruction — a black disc with
 * the stacked serif wordmark — so the app looks right with nothing to install.
 *
 * To use the real artwork: drop the file in as public/logo.png and set
 * NEXT_PUBLIC_LOGO=/logo.png (any path under public/ works, .svg included).
 */
const LOGO_SRC = process.env.NEXT_PUBLIC_LOGO;

export function Logo({ size = 44 }: { size?: number }) {
  if (LOGO_SRC) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={LOGO_SRC}
        alt="Golf Meme Digest"
        width={size}
        height={size}
        className="logo"
      />
    );
  }

  return (
    <span
      className="logo logo--mark"
      style={{ width: size, height: size, fontSize: size * 0.235 }}
      role="img"
      aria-label="Golf Meme Digest"
    >
      <span>Golf</span>
      <span>Meme</span>
      <span className="logo__grey">Digest</span>
    </span>
  );
}
