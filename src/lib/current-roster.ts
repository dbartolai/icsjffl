export function currentRosterHref(teamId: string) {
  return `/players/teams/${encodeURIComponent(teamId)}`;
}
