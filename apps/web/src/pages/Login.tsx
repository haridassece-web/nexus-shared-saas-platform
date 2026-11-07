import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/`,
              },
            });
      if (result.error) throw result.error;
      if (mode === "register" && !result.data.session) {
        setError("Registration received. Check your email to confirm, then sign in.");
      }
    } catch (e: any) {
      if (e?.message === "Failed to fetch") {
        setError(
          "Network error: Unable to connect to Supabase. Please check your internet connection or disable ad-blockers/shields for this site."
        );
      } else {
        setError(e.message || "An unexpected error occurred");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand dark">
          NEXUS <span>CREATIVE</span>
          <small>SHARED BUSINESS PLATFORM</small>
        </div>
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="muted">One secure workspace for your business operations.</p>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary full" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setError("");
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login"
            ? "New customer? Register"
            : "Already registered? Sign in"}
        </button>

        <div style={{ marginTop: "18px", borderTop: "1px solid #e2e8f0", paddingTop: "14px", textAlign: "center" }}>
          <p className="muted" style={{ fontSize: "12px", margin: "0 0 8px 0" }}>
            Want to test all 60+ business POS engines on localhost?
          </p>
          <button
            type="button"
            className="secondary full"
            style={{
              margin: 0,
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
              fontWeight: 700,
              padding: "10px",
            }}
            onClick={() => {
              localStorage.setItem("nexus_guest_demo", "true");
              window.location.href = "/demo";
            }}
          >
            🎭 Instant Live Demo (All 60+ Businesses)
          </button>
        </div>
      </form>
    </main>
  );
}
