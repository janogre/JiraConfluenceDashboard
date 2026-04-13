export type TeamName = 'Administrasjon' | 'System' | 'Nettverk' | 'NOC';
export const TEAM_NAMES: TeamName[] = ['Administrasjon', 'System', 'Nettverk', 'NOC'];

export interface TeamConfig {
  Administrasjon: string[];
  System: string[];
  Nettverk: string[];
  NOC: string[];
}

const STORAGE_KEY = 'team-component-config';
const TAB_KEY = 'team-active-tab';

export function loadTeamConfig(): TeamConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TeamConfig;
  } catch { /* ugyldig JSON */ }
  return { Administrasjon: [], System: [], Nettverk: [], NOC: [] };
}

export function saveTeamConfig(config: TeamConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadActiveTeam(): TeamName {
  const raw = localStorage.getItem(TAB_KEY) as TeamName | null;
  return TEAM_NAMES.includes(raw as TeamName) ? (raw as TeamName) : 'Administrasjon';
}

export function saveActiveTeam(team: TeamName): void {
  localStorage.setItem(TAB_KEY, team);
}
