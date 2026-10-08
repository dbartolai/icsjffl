"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";

type Membership = {
  league_id: string;
  role: "commissioner" | "member";
  team_id: string | null;
};

type Identity =
  | { kind: "commissioner" }
  | { kind: "member"; label: string }
  | { kind: "account" };

async function loadIdentity(user: User): Promise<Identity> {
  const client = getAuthClient();
  if (!client) return { kind: "account" };

  const { data: membershipData } = await client
    .from("league_memberships")
    .select("league_id,role,team_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const membership = membershipData as Membership | null;

  if (!membership) return { kind: "account" };
  if (membership.role === "commissioner") return { kind: "commissioner" };
  if (!membership.team_id) return { kind: "account" };

  const { data: teamData } = await client
    .from("league_teams")
    .select("team_name")
    .eq("league_id", membership.league_id)
    .eq("team_id", membership.team_id)
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    kind: "member",
    label: teamData?.team_name ?? `Team ${membership.team_id}`,
  };
}

export function AuthStatus() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    const client = getAuthClient();
    if (!client) return;

    void client.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setIdentity(null);
      setUser(session?.user ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    if (!user) return;

    void loadIdentity(user).then((nextIdentity) => {
      if (active) setIdentity(nextIdentity);
    });

    return () => {
      active = false;
    };
  }, [user]);

  async function signOut() {
    const client = getAuthClient();
    if (!client) return;
    await client.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (!user) {
    return (
      <Link className="auth-sign-in" href="/login">
        Sign in
      </Link>
    );
  }

  const href = identity?.kind === "commissioner" ? "/commissioner/invites" : "/login";
  const label =
    identity?.kind === "commissioner"
      ? "Commissioner"
      : identity?.kind === "member"
        ? identity.label
        : "Account";

  return (
    <div className="auth-status">
      <Link href={href} title={user.email ?? label}>
        <span>{identity?.kind === "member" ? "My team" : "Signed in"}</span>
        <strong>{label}</strong>
      </Link>
      <button onClick={signOut} type="button">
        Sign out
      </button>
    </div>
  );
}
