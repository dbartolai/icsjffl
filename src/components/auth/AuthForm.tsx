"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";
import { buildAuthRedirectUrl } from "@/lib/auth/invites";
import styles from "./AuthForm.module.css";

type Mode = "sign-in" | "sign-up";

export function AuthForm({
  nextPath,
  commissionerDenied = false,
}: {
  nextPath: string;
  commissionerDenied?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  useEffect(() => {
    const client = getAuthClient();
    if (!client) return;

    void client.auth.getUser().then(({ data }) => {
      setSignedInEmail(data.user?.email ?? null);
    });
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const client = getAuthClient();
    if (!client) {
      setMessage("Supabase is not configured for this deployment.");
      setBusy(false);
      return;
    }

    if (mode === "sign-in") {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }

      window.location.assign(nextPath);
      return;
    }

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: buildAuthRedirectUrl(nextPath, window.location.origin),
      },
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      window.location.assign(nextPath);
      return;
    }

    setMessage("Check your email to confirm the account, then sign in here.");
    setBusy(false);
  }

  async function signOut() {
    const client = getAuthClient();
    if (!client) return;
    await client.auth.signOut();
    setSignedInEmail(null);
    setMessage("Signed out.");
  }

  if (signedInEmail) {
    return (
      <div className={styles.signedIn}>
        <p>Signed in as</p>
        <strong>{signedInEmail}</strong>
        {commissionerDenied ? (
          <p className={styles.message}>This account is not a league commissioner.</p>
        ) : null}
        <div className={styles.actions}>
          <Link className={styles.primaryButton} href={commissionerDenied ? "/" : nextPath}>
            {commissionerDenied ? "Return to the league" : "Continue"}
          </Link>
          <button className={styles.secondaryButton} onClick={signOut} type="button">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.modeSwitch} aria-label="Account action">
        <button
          aria-pressed={mode === "sign-in"}
          onClick={() => setMode("sign-in")}
          type="button"
        >
          Sign in
        </button>
        <button
          aria-pressed={mode === "sign-up"}
          onClick={() => setMode("sign-up")}
          type="button"
        >
          Create account
        </button>
      </div>

      <label>
        Email
        <input
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>

      <label>
        Password
        <input
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      {message ? (
        <p className={styles.message} role="status">
          {message}
        </p>
      ) : null}

      <button className={styles.primaryButton} disabled={busy} type="submit">
        {busy
          ? "Working…"
          : mode === "sign-in"
            ? "Sign in"
            : "Create account"}
      </button>
    </form>
  );
}
