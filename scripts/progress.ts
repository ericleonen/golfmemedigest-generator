/**
 * A terminal progress bar that degrades to plain lines when stdout is not a
 * TTY (piped to a file, running in CI), where carriage returns would otherwise
 * produce one unreadable mega-line.
 */

const BAR_WIDTH = 28;
const CLEAR_LINE = "\r[2K";

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function humanDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`;
}

export class Progress {
  private done = 0;
  private bytes = 0;
  private readonly startedAt = Date.now();
  private readonly tty = Boolean(process.stdout.isTTY);
  private lastPlainLog = 0;

  constructor(private readonly total: number) {}

  /** Records one finished item and repaints. `label` shows what just landed. */
  tick(bytes: number, label: string): void {
    this.done++;
    this.bytes += bytes;
    this.render(label);
  }

  private render(label: string): void {
    const fraction = this.total === 0 ? 1 : this.done / this.total;
    const elapsed = Date.now() - this.startedAt;
    const rate = this.done / Math.max(elapsed / 1000, 0.001);
    const remaining = rate > 0 ? ((this.total - this.done) / rate) * 1000 : 0;

    if (!this.tty) {
      // One line every 25 items (and always the last) keeps piped logs readable.
      if (this.done - this.lastPlainLog >= 25 || this.done === this.total) {
        this.lastPlainLog = this.done;
        console.log(
          `  ${this.done}/${this.total} · ${humanBytes(this.bytes)} · ${rate.toFixed(1)}/s`,
        );
      }
      return;
    }

    const filled = Math.round(fraction * BAR_WIDTH);
    const bar = "█".repeat(filled) + "·".repeat(BAR_WIDTH - filled);
    const percent = `${Math.round(fraction * 100)}%`.padStart(4);
    const counter = `${this.done}/${this.total}`;

    const head = `  ${bar} ${percent}  ${counter}  ${humanBytes(this.bytes)}  ${rate.toFixed(
      1,
    )}/s  ETA ${humanDuration(remaining)}  `;

    // Trim the label so the line never wraps — a wrapped line breaks the redraw.
    // Below a few characters there is nothing useful to show, and a lone "…"
    // just looks like a glitch, so drop the label entirely.
    const room = Math.max(0, (process.stdout.columns ?? 100) - head.length - 1);
    const tail =
      room < 6 ? "" : label.length > room ? `${label.slice(0, room - 1)}…` : label;

    process.stdout.write(`${CLEAR_LINE}${head}${tail}`);
  }

  finish(): void {
    if (this.tty) process.stdout.write(CLEAR_LINE);
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  get totalBytes(): number {
    return this.bytes;
  }
}
