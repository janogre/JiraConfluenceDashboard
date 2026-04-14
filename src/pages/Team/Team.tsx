import { useState } from 'react';
import { Link } from 'react-router-dom';
import { loadActiveTeam, saveActiveTeam, loadTeamConfig, TEAM_NAMES } from '../../store/teamStore';
import type { TeamConfig, TeamName } from '../../store/teamStore';
import { TeamCoordinator } from './TeamCoordinator';
import { TeamUnassigned } from './TeamUnassigned';
import styles from './Team.module.css';

type SubTab = 'koordinator' | 'utildelte';

export function Team() {
  const [activeTeam, setActiveTeam] = useState<TeamName>(loadActiveTeam);
  const [subTab, setSubTab] = useState<SubTab>('koordinator');
  const [teamConfig] = useState<TeamConfig>(loadTeamConfig);
  const teamComponents = teamConfig[activeTeam];

  const handleTeamChange = (team: TeamName) => {
    setActiveTeam(team);
    saveActiveTeam(team);
    setSubTab('koordinator');
  };

  return (
    <div className={styles.container}>
      <div className={styles.teamTabs}>
        {TEAM_NAMES.map((team) => (
          <button
            key={team}
            className={`${styles.teamTab} ${activeTeam === team ? styles.teamTabActive : ''}`}
            onClick={() => handleTeamChange(team)}
          >
            {team}
          </button>
        ))}
      </div>

      {teamComponents.length === 0 ? (
        <div className={styles.noConfig}>
          <p>Team <strong>{activeTeam}</strong> har ingen komponenter konfigurert.</p>
          <p>
            Gå til <Link to="/settings">Innstillinger → Team-oppsett</Link> for å knytte Jira-komponenter til teamet.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.subTabs}>
            <button
              className={`${styles.subTab} ${subTab === 'koordinator' ? styles.subTabActive : ''}`}
              onClick={() => setSubTab('koordinator')}
            >
              Koordinator
            </button>
            <button
              className={`${styles.subTab} ${subTab === 'utildelte' ? styles.subTabActive : ''}`}
              onClick={() => setSubTab('utildelte')}
            >
              Utildelte oppgaver
            </button>
          </div>

          {subTab === 'koordinator' ? (
            <TeamCoordinator teamName={activeTeam} componentNames={teamComponents} />
          ) : (
            <TeamUnassigned teamName={activeTeam} componentNames={teamComponents} />
          )}
        </>
      )}
    </div>
  );
}
