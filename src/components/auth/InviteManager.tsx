"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";
import { createInviteToken, hashInviteToken } from "@/lib/auth/invites";
import styles from "./InviteManager.module.css";

type Invite = {
  id: string;
  league_id: string;
  team_id: string;
  team_label: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export function InviteManager() {
  const [leagues, setLeagues] = useState<string[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [teamLabel, setTeamLabel] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [message, setMessage] = useState("Checking commissioner access…");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadInvites() {
    const client = getAuthClient();
    if (!client) return;
    const { data } = await client
      .from("team_invites")
      .select("id,league_id,team_id,team_label,created_at,expires_at,accepted_at")
      .order("created_at", { ascending: false });
    setInvites((data ?? []) as Invite[]);
  }

  useEffect(() => {
    async function load() {
      const client = getAuthClient();
      if (!client) {
        setMessage("Supabase is not configured for this deployment.");
        return;
      }

      const { data: userData } = await client.auth.getUser();
      if (!userData.user) {
        setSignedIn(false);
        setMessage("Sign in with a commissioner account to continue.");
        return;
      }

      setSignedIn(true);
      const [membershipResult, inviteResult] = await Promise.all([
        client
          .from("league_memberships")
          .select("league_id")
          .eq("role", "commissioner"),
        client
          .from("team_invites")
          .select(
            "id,league_id,team_id,team_label,created_at,expires_at,accepted_at",
          )
          .order("created_at", { ascending: false }),
      ]);

      if (membershipResult.error) {
        setMessage(membershipResult.error.message);
        return;
      }

      const allowedLeagues = (membershipResult.data ?? []).map(
        (row) => row.league_id as string,
      );
      setLeagues(allowedLeagues);
      setLeagueId(allowedLeagues[0] ?? "");
      setInvites((inviteResult.data ?? []) as Invite[]);
      setMessage(
        allowedLeagues.length
          ? ""
          : "This account is not a commissioner for any league.",
      );
    }

    void load();
  }, []);

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getAuthClient();
    if (!client) return;

    setBusy(true);
    setInviteLink("");
    setMessage("");

    const token = createInviteToken();
    const tokenHash = await hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { error } = await client.rpc("create_team_invite", {
      target_league_id: leagueId,
      target_team_id: teamId,
      target_team_label: teamLabel,
      target_token_hash: tokenHash,
      target_expires_at: expiresAt.toISOString(),
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    const link = `${window.location.origin}/invite?token=${token}`;
    setInviteLink(link);
    setTeamId("");
    setTeamLabel("");
    setBusy(false);
    await loadInvites();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setMessage("Invite link copied.");
  }

  if (signedIn === false) {
    return (
      <div className={styles.notice}>
        <p>{message}</p>
        <Link
          className={styles.primaryButton}
          href="/login?next=%2Fcommissioner%2Finvites"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!leagues.length) {
    return <p className={styles.notice}>{message}</p>;
  }

  return (
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={createInvite}>
        <label>
          League
          <select value={leagueId} onChange={(event) => setLeagueId(event.target.value)}>
            {leagues.map((league) => (
              <option key={league} value={league}>
                {league}
              </option>
            ))}
          </select>
        </label>
        <label>
          ESPN team slot ID
          <input
            onChange={(event) => setTeamId(event.target.value)}
            placeholder="For example: 7"
            required
            value={teamId}
          />
        </label>
        <label>
          Team name <span>optional</span>
          <input
            onChange={(event) => setTeamLabel(event.target.value)}
            placeholder="The Sunday Scaries"
            value={teamLabel}
          />
        </label>
        <p className={styles.help}>Links expire in seven days and work once.</p>
        <button className={styles.primaryButton} disabled={busy} type="submit">
          {busy ? "Creating…" : "Create invite link"}
        </button>
      </form>

      <div className={styles.output}>
        <h2>Copyable link</h2>
        {inviteLink ? (
          <>
            <input aria-label="New invite link" readOnly value={inviteLink} />
            <button className={styles.secondaryButton} onClick={copyLink} type="button">
              Copy link
            </button>
          </>
        ) : (
          <p>The raw token appears only once, right after you create it.</p>
        )}
        {message ? <p className={styles.message}>{message}</p> : null}
      </div>

      <section className={styles.history}>
        <h2>Recent invites</h2>
        {invites.length ? (
          <div className={styles.inviteList}>
            {invites.map((invite) => {
              const status = invite.accepted_at
                ? "Accepted"
                : new Date(invite.expires_at) <= new Date()
                  ? "Expired"
                  : "Open";
              return (
                <article key={invite.id}>
                  <div>
                    <strong>{invite.team_label ?? `Team ${invite.team_id}`}</strong>
                    <span>
                      League {invite.league_id} · slot {invite.team_id}
                    </span>
                  </div>
                  <small data-status={status.toLowerCase()}>{status}</small>
                </article>
              );
            })}
          </div>
        ) : (
          <p className={styles.help}>No invites yet.</p>
        )}
      </section>
    </div>
  );
}
