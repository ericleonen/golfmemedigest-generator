"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        // The cookie is set; a refresh re-runs middleware, which now lets us in.
        router.replace("/");
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not sign in.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="gate__form" onSubmit={submit}>
      <input
        type="password"
        className="steer"
        placeholder="Password"
        value={password}
        autoFocus
        autoComplete="current-password"
        onChange={(event) => setPassword(event.target.value)}
      />
      <button type="submit" className="primary" disabled={busy || !password}>
        {busy ? "Checking…" : "Enter"}
      </button>
      {error && <p className="note note--bad">{error}</p>}
    </form>
  );
}
