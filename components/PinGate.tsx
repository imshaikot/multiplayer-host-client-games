"use client";

import { useEffect, useState, type FormEvent } from "react";

// Gate for the HOST entry points. The PIN itself never reaches the browser —
// it's verified by POST /api/host-pin against the server-side HOST_PIN env var.
// The client only persists the resulting "unlocked" flag for the browser
// session (closing the tab re-locks). This is still a soft gate: the unlocked
// flag is client-trusted and nothing stops a script from hitting the Socket.IO
// server directly. For real protection, put Cloudflare Access in front.
const SESSION_KEY = "host-gate-ok";

export default function PinGate({ children }: { children: React.ReactNode }) {
  // null = still deciding on first paint. Render nothing until we've checked,
  // so gated content never flashes before the overlay appears.
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Players arrive through a share link that carries ?code=… — they are
    // joining, not hosting, so they must never see this gate.
    const joining = new URLSearchParams(window.location.search).has("code");
    setUnlocked(joining || sessionStorage.getItem(SESSION_KEY) === "1");
  }, []);

  if (unlocked === null) return null;
  if (unlocked) return <>{children}</>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const pin = value.trim();
    if (!pin || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/host-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        sessionStorage.setItem(SESSION_KEY, "1");
        setUnlocked(true);
      } else {
        setError("ভুল পিন, আবার চেষ্টা করুন");
        setValue("");
      }
    } catch {
      setError("সংযোগে সমস্যা, আবার চেষ্টা করুন");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black p-6 bangla">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-2xl font-black text-center">হোস্ট পিন দিন</h1>
      <p className="mt-2 text-white/50 text-sm text-center max-w-xs">
        গেম হোস্ট করতে পিন লাগবে। জয়েন করতে লাগবে না।
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3 w-full max-w-xs">
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          placeholder="পিন"
          aria-label="হোস্ট পিন"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={submitting}
          className="bg-white/10 text-center text-2xl font-black tracking-[0.4em] py-4 rounded-xl uppercase outline-none focus:bg-white/20 disabled:opacity-50"
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={!value.trim() || submitting}
          className="bg-yellow-400 text-black font-bold py-4 rounded-xl text-xl disabled:opacity-40"
        >
          {submitting ? "যাচাই হচ্ছে…" : "ঢুকুন"}
        </button>
      </form>
    </main>
  );
}
