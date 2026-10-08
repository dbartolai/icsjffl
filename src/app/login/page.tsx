import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeNextPath } from "@/lib/auth/invites";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Team sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main id="main" className={styles.page}>
      <section className={styles.intro}>
        <p className={styles.kicker}>TEAM ACCESS</p>
        <h1>Your team, under your login.</h1>
        <p>
          Sign in with the account that received the commissioner&apos;s invite.
          New managers can create an account here first.
        </p>
      </section>
      <section className={styles.card} aria-label="Sign in form">
        <AuthForm
          commissionerDenied={error === "commissioner"}
          nextPath={safeNextPath(next)}
        />
      </section>
    </main>
  );
}
