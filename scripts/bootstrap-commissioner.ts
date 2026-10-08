import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  ESPN_LEAGUE_ID: z.string().trim().min(1),
  COMMISSIONER_EMAIL: z.email().transform((email) => email.toLowerCase()),
});

async function findUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<User> {
  const matches: User[] = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    matches.push(
      ...data.users.filter((user) => user.email?.toLowerCase() === email),
    );
    if (data.users.length < 1000) break;
  }

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one confirmed auth user for ${email}; found ${matches.length}.`,
    );
  }

  const user = matches[0];
  if (!user.email_confirmed_at) {
    throw new Error(`The auth user for ${email} has not confirmed their email.`);
  }
  return user;
}

async function main() {
  const env = envSchema.parse(process.env);
  const apply = process.argv.includes("--apply");
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const user = await findUserByEmail(supabase, env.COMMISSIONER_EMAIL);

  const { data: memberships, error: membershipError } = await supabase
    .from("league_memberships")
    .select("user_id,role,team_id")
    .eq("league_id", env.ESPN_LEAGUE_ID);
  if (membershipError) throw membershipError;

  const existingCommissioner = memberships?.find(
    (membership) => membership.role === "commissioner",
  );
  if (existingCommissioner) {
    if (existingCommissioner.user_id === user.id) {
      console.log(
        `${env.COMMISSIONER_EMAIL} is already the commissioner for league ${env.ESPN_LEAGUE_ID}.`,
      );
      return;
    }
    throw new Error(
      `League ${env.ESPN_LEAGUE_ID} already has a different commissioner.`,
    );
  }

  if (memberships?.some((membership) => membership.user_id === user.id)) {
    throw new Error(
      `${env.COMMISSIONER_EMAIL} already has a non-commissioner membership in this league.`,
    );
  }

  if (!apply) {
    console.log(
      `Dry run: assign confirmed user ${env.COMMISSIONER_EMAIL} (${user.id}) as commissioner for league ${env.ESPN_LEAGUE_ID}.`,
    );
    console.log("Run the command again with --apply to make this one-time change.");
    return;
  }

  const { error: insertError } = await supabase.from("league_memberships").insert({
    league_id: env.ESPN_LEAGUE_ID,
    user_id: user.id,
    role: "commissioner",
    team_id: null,
  });
  if (insertError) throw insertError;

  console.log(
    `Assigned ${env.COMMISSIONER_EMAIL} as commissioner for league ${env.ESPN_LEAGUE_ID}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
