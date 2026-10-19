"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ names, passwordRequired }: { names: string[]; passwordRequired: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) {
      setError("Please select your name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      if (res.ok) {
        router.replace("/admin");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "That password is not correct.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <style>{LOGIN_CSS}</style>
      <form className="lcard" onSubmit={submit}>
        <div className="llogo">
          <span className="pill">OPPESM</span>
          <h2>Admin Dashboard</h2>
          <p>Office of the Provincial Public Employment Service Manager</p>
        </div>
        {error && <div className="lerr" style={{ display: "block" }}>{error}</div>}
        <select className="linput" value={name} onChange={(e) => setName(e.target.value)} autoFocus>
          <option value="">Select your name…</option>
          {names.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {passwordRequired && (
          <input
            className="linput"
            type="password"
            placeholder="Enter admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <button className="lbtn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign In"}
        </button>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--text2)" }}>
          <a href="/" style={{ borderBottom: "1px dashed var(--border)" }}>&larr; Back to submission form</a>
        </div>
      </form>
    </div>
  );
}

const LOGIN_CSS = `
.lcard { width: 360px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 36px; box-shadow: 0 32px 80px rgba(0,0,0,.6); }
.llogo { text-align: center; margin-bottom: 28px; }
.llogo .pill { display: inline-block; background: linear-gradient(135deg, var(--accent), var(--purple)); border-radius: 50px; padding: 5px 16px; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #fff; margin-bottom: 12px; }
.llogo h2 { font-size: 22px; font-weight: 700; }
.llogo p { font-size: 12px; color: var(--text2); margin-top: 4px; }
.linput { width: 100%; padding: 12px 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 14px; font-family: inherit; margin-bottom: 14px; transition: border-color .2s, box-shadow .2s; }
.linput:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,142,247,.15); }
.lbtn { width: 100%; padding: 13px; background: linear-gradient(135deg, var(--accent), var(--purple)); border: none; border-radius: var(--radius); color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; transition: opacity .2s; }
.lbtn:hover:not(:disabled) { opacity: .9; }
.lbtn:disabled { opacity: .5; cursor: not-allowed; }
.lerr { color: var(--danger); font-size: 12px; margin-bottom: 12px; text-align: center; }
`;
