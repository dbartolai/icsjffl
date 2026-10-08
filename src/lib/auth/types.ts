export type CommissionerTeam = {
  id: string;
  name: string;
  managerName: string | null;
  claimed: boolean;
};

export type CommissionerLeague = {
  id: string;
  season: number;
  teams: CommissionerTeam[];
};

export type CommissionerInvite = {
  id: string;
  league_id: string;
  team_id: string;
  team_label: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};
