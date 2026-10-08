import type { Metadata } from "next";
import { InviteManager } from "@/components/auth/InviteManager";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Commissioner invites",
};

export default function CommissionerInvitesPage() {
  return (
    <main id="main" className={styles.page}>
      <header className={styles.header}>
        <p>COMMISSIONER DESK</p>
        <h1>Team invites</h1>
        <span>
          Create a one-time link for a specific ESPN team slot. Send the link
          directly to that manager.
        </span>
      </header>
      <InviteManager />
    </main>
  );
}
