"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";
import { hashInviteToken } from "@/lib/auth/invites";
import styles from "./InviteAcceptance.module.css";

type InvitePreview = {
  league_id: string;
  team_id: string;
  team_label: string | null;
  expires_at: string;
  status: "active" | "expired" | "used" | "unavailable";
};

type AcceptedTeam = Pick<InvitePreview, "league_id" | "team_id" | "team_label">;

export function InviteAcceptance({ token }: { token: string }) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [accepted, setAccepted] = useState<AcceptedTeam | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [message, setMessage] = useState("Checking your invite…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const client = getAuthClient();
      if (!client) {
        if (active) setMessage("Supabase is not configured for this deployment.");
        return;
      }

      const { data: userData } = await client.auth.getUser();
      if (!active) return;

      if (!userData.user) {
        setSignedIn(false);
        setMessage("Sign in before accepting this invite.");
        return;
      }

      setSignedIn(true);
      const tokenHash = await hashInviteToken(token);
      const { data, error } = await client.rpc("inspect_team_invite", {
        invite_token_hash: tokenHash,
      });

      if (!active) return;
      if (error) {
        setMessage(error.message);
        return;
      }

      const invite = (data?.[0] ?? null) as InvitePreview | null;
      setPreview(invite);
      setMessage(invite ? "" : "This invite link is invalid.");
    }

    void load();
    return () => {
      active = false;
    };
  }, [token]);

  async function acceptInvite() {
    const client = getAuthClient();
    if (!client) return;

    setBusy(true);
    setMessage("");
    const tokenHash = await hashInviteToken(token);
    const { data, error } = await client.rpc("accept_team_invite", {
      invite_token_hash: tokenHash,
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    setAccepted((data?.[0] ?? null) as AcceptedTeam | null);
    setBusy(false);
  }

  if (!token) {
    return <p className={styles.notice}>This invite link is missing its token.</p>;
  }

  if (signedIn === false) {
    const nextPath = `/invite?token=${encodeURIComponent(token)}`;
    return (
      <div className={styles.centered}>
        <p className={styles.notice}>{message}</p>
        <Link
          className={styles.primaryButton}
          href={`/login?next=${encodeURIComponent(nextPath)}`}
        >
          Sign in to continue
        </Link>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className={styles.success}>
        <span>TEAM CLAIMED</span>
        <h2>{accepted.team_label ?? `Team ${accepted.team_id}`}</h2>
        <p>
          Your account is now the manager for ESPN slot {accepted.team_id} in
          league {accepted.league_id}.
        </p>
        <Link className={styles.primaryButton} href="/">
          Return to the league
        </Link>
      </div>
    );
  }

  if (!preview) {
    return <p className={styles.notice}>{message}</p>;
  }

  if (preview.status !== "active") {
    const labels = {
      expired: "This invite has expired.",
      used: "This invite has already been used.",
      unavailable: "This team has already been claimed.",
    };
    return <p className={styles.notice}>{labels[preview.status]}</p>;
  }

  return (
    <div className={styles.invite}>
      <div>
        <span>LEAGUE</span>
        <strong>{preview.league_id}</strong>
      </div>
      <div>
        <span>ESPN TEAM SLOT</span>
        <strong>{preview.team_label ?? preview.team_id}</strong>
        {preview.team_label ? <small>Slot {preview.team_id}</small> : null}
      </div>
      <p>
        This link expires {new Date(preview.expires_at).toLocaleString()} and
        can be used once.
      </p>
      {message ? <p className={styles.error}>{message}</p> : null}
      <button
        className={styles.primaryButton}
        disabled={busy}
        onClick={acceptInvite}
        type="button"
      >
        {busy ? "Claiming team…" : "Accept team invite"}
      </button>
    </div>
  );
}
