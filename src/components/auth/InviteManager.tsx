"use client";

import { useEffect, useState } from "react";
import type {
  CommissionerInvite,
  CommissionerLeague,
} from "@/lib/auth/types";
import { getAuthClient } from "@/lib/auth/client";
import {
  createInviteToken,
  getInviteExpiration,
  hashInviteToken,
} from "@/lib/auth/invites";
import styles from "./InviteManager.module.css";

type TeamRow = {
  league_id: string;
  season: number;
  team_id: string;
  team_name: string;
  manager_name: string | null;
};

export function InviteManager() {
  const [leagues, setLeagues] = useState<CommissionerLeague[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [invites, setInvites] = useState<CommissionerInvite[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [message, setMessage] = useState("Loading commissioner access…");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectedLeague = leagues.find((league) => league.id === leagueId);

  useEffect(() => {
    let active = true;

    async function load() {
      const client = getAuthClient();
      if (!client) {
        setMessage("Supabase is not configured for this deployment.");
        setLoaded(true);
        return;
      }

      const { data: commissionerRows, error: commissionerError } = await client
        .from("league_memberships")
        .select("league_id")
        .eq("role", "commissioner");
      if (!active) return;
      if (commissionerError || !commissionerRows?.length) {
        setMessage("Commissioner access could not be loaded.");
        setLoaded(true);
        return;
      }

      const leagueIds = commissionerRows.map((row) => row.league_id as string);
      const [teamResult, membershipResult, inviteResult] = await Promise.all([
        client
          .from("league_teams")
          .select("league_id,season,team_id,team_name,manager_name")
          .in("league_id", leagueIds)
          .order("season", { ascending: false })
          .order("team_name"),
        client
          .from("league_memberships")
          .select("league_id,team_id")
          .in("league_id", leagueIds)
          .eq("role", "member"),
        client
          .from("team_invites")
          .select("id,league_id,team_id,team_label,created_at,expires_at,accepted_at")
          .in("league_id", leagueIds)
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;

      const queryError = teamResult.error ?? membershipResult.error ?? inviteResult.error;
      if (queryError) {
        setMessage("Commissioner data could not be loaded.");
        setLoaded(true);
        return;
      }

      const claimedTeams = new Set(
        (membershipResult.data ?? [])
          .filter((row) => row.team_id)
          .map((row) => `${row.league_id}:${row.team_id}`),
      );
      const teamRows = (teamResult.data ?? []) as TeamRow[];
      const leagueOptions = leagueIds.map((id) => {
        const season = teamRows.find((team) => team.league_id === id)?.season;
        const currentTeams = teamRows.filter(
          (team) => team.league_id === id && team.season === season,
        );
        return {
          id,
          season: season ?? new Date().getFullYear(),
          teams: currentTeams.map((team) => ({
            id: team.team_id,
            name: team.team_name,
            managerName: team.manager_name,
            claimed: claimedTeams.has(`${id}:${team.team_id}`),
          })),
        };
      });
      const firstLeague = leagueOptions[0];
      setLeagues(leagueOptions);
      setLeagueId(firstLeague?.id ?? "");
      setTeamId(firstLeague?.teams.find((team) => !team.claimed)?.id ?? "");
      setInvites((inviteResult.data ?? []) as CommissionerInvite[]);
      setMessage("");
      setLoaded(true);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function loadInvites() {
    const client = getAuthClient();
    if (!client) return;
    const { data } = await client
      .from("team_invites")
      .select("id,league_id,team_id,team_label,created_at,expires_at,accepted_at")
      .order("created_at", { ascending: false });
    setInvites((data ?? []) as CommissionerInvite[]);
  }

  function selectLeague(nextLeagueId: string) {
    setLeagueId(nextLeagueId);
    const nextLeague = leagues.find((league) => league.id === nextLeagueId);
    setTeamId(nextLeague?.teams.find((team) => !team.claimed)?.id ?? "");
    setInviteLink("");
    setMessage("");
  }

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getAuthClient();
    if (!client) return;

    setBusy(true);
    setInviteLink("");
    setMessage("");

    const token = createInviteToken();
    const tokenHash = await hashInviteToken(token);
    const expiresAt = getInviteExpiration();
    const { error } = await client.rpc("create_team_invite", {
      target_league_id: leagueId,
      target_team_id: teamId,
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
    setBusy(false);
    await loadInvites();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setMessage("Invite link copied.");
  }

  if (!loaded || !leagues.length) {
    return (
      <p className={styles.notice}>
        {message || "No leagues are assigned to this commissioner."}
      </p>
    );
  }

  return (
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={createInvite}>
        <label>
          League
          <select value={leagueId} onChange={(event) => selectLeague(event.target.value)}>
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.id} · {league.season}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team
          <select
            onChange={(event) => setTeamId(event.target.value)}
            required
            value={teamId}
          >
            {!teamId ? <option value="">No unclaimed teams available</option> : null}
            {selectedLeague?.teams.map((team) => (
              <option disabled={team.claimed} key={team.id} value={team.id}>
                {team.name}
                {team.managerName ? ` · ${team.managerName}` : ""}
                {team.claimed ? " · claimed" : ""}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.help}>Links expire in seven days and work once.</p>
        <button
          className={styles.primaryButton}
          disabled={busy || !teamId}
          type="submit"
        >
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
