# ESPN sync scheduling

Vercel Hobby cron jobs can run only once per day and may start anywhere in the selected hour. `vercel.json` provides that free baseline at 10:00 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET` when the project has `CRON_SECRET` configured. See Vercel's [cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [security guidance](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).

For free Sunday acceleration, [Supabase Cron](https://supabase.com/docs/guides/cron) can call the same endpoint every 15 minutes. Enable the `pg_cron` and `pg_net` extensions, store the production URL and the same `CRON_SECRET` in Vault, then create these jobs in the SQL editor:

```sql
select vault.create_secret('https://your-production-domain.example', 'icsjffl_sync_url');
select vault.create_secret('replace-with-cron-secret', 'icsjffl_cron_secret');

select cron.schedule(
  'icsjffl-sunday-sync',
  '*/15 17-23 * * 0',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'icsjffl_sync_url' limit 1) || '/api/cron/espn-sync',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'icsjffl_cron_secret' limit 1)
    ),
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'icsjffl-sunday-late-sync',
  '*/15 0-6 * * 1',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'icsjffl_sync_url' limit 1) || '/api/cron/espn-sync',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'icsjffl_cron_secret' limit 1)
    ),
    timeout_milliseconds := 60000
  );
  $$
);
```

These windows cover Sunday 17:00 UTC through Monday 06:59 UTC. Free Supabase projects may pause after a week of low activity, so this optional trigger is not an uptime guarantee. Supabase Vault encrypts the secret at rest. `pg_net` places request headers in its queue briefly, so database login roles should remain limited to trusted operators. The sync run table stores only status, timing, season, row counts, and a short error code. It never stores ESPN cookies, `CRON_SECRET`, or response bodies.
