import type { Metadata } from "next";
import { InviteAcceptance } from "@/components/auth/InviteAcceptance";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Team invite",
};

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;

  return (
    <main id="main" className={styles.page}>
      <section className={styles.heading}>
        <p>COMMISSIONER INVITE</p>
        <h1>Take the controls.</h1>
        <span>
          One account. One team slot. The commissioner can still administer
          the full league.
        </span>
      </section>
      <section className={styles.card} aria-label="Team invitation">
        <InviteAcceptance token={token} />
      </section>
    </main>
  );
}
