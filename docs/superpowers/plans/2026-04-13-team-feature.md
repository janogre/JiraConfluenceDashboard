# Team-funksjon — Implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legg til et «Team»-menyvalg med koordinatorvisning og tildeling av utildelte oppgaver for fire faste team (Administrasjon, System, Nettverk, NOC), der hvert team identifiseres via Jira-komponenter.

**Architecture:** Team-siden (`/team`) bruker to nivåer med faner — team og undervisning. Saker hentes med JQL `component in (...)` på tvers av alle prosjekter. Team-komponent-konfig lagres i localStorage. Tildeling skjer direkte mot Jira API. Saksmodal er ekstrahert til `IssueModal.tsx` for gjenbruk.

**Tech Stack:** React 19, TypeScript, TanStack Query, CSS Modules, lucide-react, Jira REST API v3.

---

## Filstruktur

**Nye filer:**
```
src/store/teamStore.ts             — TeamConfig type, load/save helpers
src/pages/Board/IssueModal.tsx     — Ekstrahert saksmodal (gjenbrukbar)
src/pages/Team/Team.tsx            — Hovedside: team-faner + underfaner
src/pages/Team/TeamCoordinator.tsx — Koordinatorvisning
src/pages/Team/TeamUnassigned.tsx  — Utildelte oppgaver med tildeling
src/pages/Team/Team.module.css     — Stiler for alle Team-sider
```

**Endrede filer:**
```
src/services/jiraService.ts        — 3 nye funksjoner
src/pages/Board/Board.tsx          — Bruk IssueModal i stedet for inline modal
src/pages/Settings/Settings.tsx   — Ny «Team-oppsett»-seksjon
src/App.tsx                        — Ny rute /team
src/components/Layout/LayoutV2.tsx — Nytt menyvalg
```

---

## Task 1: Jira service-funksjoner

**Files:**
- Modify: `src/services/jiraService.ts`

- [ ] **Steg 1: Legg til `getIssuesByComponents` på slutten av jiraService.ts**

```typescript
export async function getIssuesByComponents(componentNames: string[]): Promise<JiraIssue[]> {
  if (componentNames.length === 0) return [];
  const list = componentNames.map((c) => `"${c}"`).join(', ');
  const jql = `component in (${list}) ORDER BY updated DESC`;
  return getIssues(undefined, jql, true);
}
```

- [ ] **Steg 2: Legg til `searchUsers` rett etter `getIssuesByComponents`**

```typescript
export async function searchUsers(query: string): Promise<JiraUser[]> {
  if (!query.trim()) return [];
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<Array<{
    accountId: string;
    displayName: string;
    emailAddress?: string;
    avatarUrls?: { '48x48'?: string };
    active: boolean;
  }>>(`${baseUrl}/rest/api/3/user/search`, {
    params: { query, maxResults: 10 },
  });
  return response.data
    .filter((u) => u.active)
    .map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      emailAddress: u.emailAddress,
      avatarUrl: u.avatarUrls?.['48x48'],
      active: u.active,
    }));
}
```

- [ ] **Steg 3: Legg til `getAllProjectComponents` rett etter `searchUsers`**

```typescript
export async function getAllProjectComponents(): Promise<{ id: string; name: string }[]> {
  const projects = await getProjects();
  const api = getApi();
  const baseUrl = getJiraBaseUrl();

  const results = await Promise.all(
    projects.map(async (project) => {
      try {
        const response = await api.get<Array<{ id: string; name: string }>>(
          `${baseUrl}/rest/api/3/project/${project.key}/components`
        );
        return response.data.map((c) => ({ id: c.id, name: c.name }));
      } catch {
        return [];
      }
    })
  );

  const seen = new Set<string>();
  return results.flat().filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}
```

- [ ] **Steg 4: Typesjekk**

```bash
cd C:/Kode-prosjekter-lokalt/JiraConfluenceDashboard && npx tsc -b --noEmit
```
Forventet: ingen feil.

- [ ] **Steg 5: Commit**

```bash
git add src/services/jiraService.ts
git commit -m "Legg til getIssuesByComponents, searchUsers og getAllProjectComponents"
```

---

## Task 2: TeamConfig helpers

**Files:**
- Create: `src/store/teamStore.ts`

- [ ] **Steg 1: Opprett `src/store/teamStore.ts`**

```typescript
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
```

- [ ] **Steg 2: Typesjekk**

```bash
cd C:/Kode-prosjekter-lokalt/JiraConfluenceDashboard && npx tsc -b --noEmit
```
Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/store/teamStore.ts
git commit -m "Legg til TeamConfig type og localStorage-hjelpere"
```

---

## Task 3: Ekstraher IssueModal fra Board.tsx

**Files:**
- Create: `src/pages/Board/IssueModal.tsx`
- Modify: `src/pages/Board/Board.tsx`

- [ ] **Steg 1: Opprett `src/pages/Board/IssueModal.tsx`**

Denne filen inneholder all modal-logikk som nå er inline i Board.tsx. Den administrerer sine egne queries, mutations og todo-state.

```typescript
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ExternalLink, CheckSquare, Check } from 'lucide-react';
import { Badge, Modal, Button } from '../../components/common';
import { getTransitions, transitionIssue } from '../../services/jiraService';
import { useTodoStore } from '../../store/todoStore';
import type { JiraIssue } from '../../types';
import styles from './Board.module.css';

function getPriorityVariant(priority?: string): 'danger' | 'warning' | 'default' {
  switch (priority?.toLowerCase()) {
    case 'highest':
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    default:
      return 'default';
  }
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date(new Date().toDateString());
}

interface IssueModalProps {
  issue: JiraIssue;
  jiraBaseUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onTransitioned?: (issueKey: string, newStatus: { id: string; name: string; category: 'new' | 'indeterminate' | 'done' }) => void;
}

export function IssueModal({ issue, jiraBaseUrl, isOpen, onClose, onTransitioned }: IssueModalProps) {
  const [showTodoForm, setShowTodoForm] = useState(false);
  const [todoCreated, setTodoCreated] = useState(false);
  const [todoPriority, setTodoPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [todoDueDate, setTodoDueDate] = useState('');
  const { addTodo, getTodosByJiraIssue } = useTodoStore();

  const { data: transitions } = useQuery({
    queryKey: ['transitions', issue.key],
    queryFn: () => getTransitions(issue.key),
  });

  const { mutate: doTransition, isPending: changingStatus } = useMutation({
    mutationFn: (vars: { transitionId: string; toStatusName: string; toCategoryKey: string }) =>
      transitionIssue(issue.key, vars.transitionId),
    onSuccess: (_, vars) => {
      const category = vars.toCategoryKey as 'new' | 'indeterminate' | 'done';
      onTransitioned?.(issue.key, { id: issue.status.id, name: vars.toStatusName, category });
    },
  });

  const handleClose = () => {
    setShowTodoForm(false);
    setTodoCreated(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={issue.key} size="md">
      <div className={styles.modalContent}>
        <h2 className={styles.modalTitle}>{issue.summary}</h2>

        <div className={styles.modalMeta}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Status</span>
            <Badge
              variant={
                issue.status.category === 'done'
                  ? 'success'
                  : issue.status.category === 'indeterminate'
                  ? 'primary'
                  : 'default'
              }
            >
              {issue.status.name}
            </Badge>
          </div>
          {issue.priority && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Prioritet</span>
              <Badge variant={getPriorityVariant(issue.priority.name)}>
                {issue.priority.name}
              </Badge>
            </div>
          )}
          {issue.assignee && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Ansvarlig</span>
              <span>{issue.assignee.displayName}</span>
            </div>
          )}
          {issue.dueDate && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Frist</span>
              <span className={isOverdue(issue.dueDate) ? styles.overdue : ''}>
                {new Date(issue.dueDate).toLocaleDateString('nb-NO')}
              </span>
            </div>
          )}
          {issue.labels && issue.labels.length > 0 && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Etiketter</span>
              <div className={styles.modalLabels}>
                {issue.labels.map((label) => (
                  <span key={label} className={styles.cardLabel}>{label}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {issue.description && (
          <div className={styles.modalDescription}>
            <span className={styles.metaLabel}>Beskrivelse</span>
            <p>{issue.description}</p>
          </div>
        )}

        {transitions && transitions.length > 0 && (
          <div className={styles.modalSection}>
            <span className={styles.metaLabel}>Flytt til</span>
            <div className={styles.transitionButtons}>
              {transitions.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant="secondary"
                  disabled={changingStatus}
                  onClick={() =>
                    doTransition({
                      transitionId: t.id,
                      toStatusName: t.to.name,
                      toCategoryKey: t.to.statusCategoryKey,
                    })
                  }
                >
                  {t.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {issue.links && issue.links.length > 0 && (
          <div className={styles.modalSection}>
            <span className={styles.metaLabel}>Avhengigheter</span>
            <div className={styles.dependencyList}>
              {issue.links.map((link) => {
                const linkedIssue = link.inwardIssue ?? link.outwardIssue;
                const direction = link.inwardIssue ? link.type.inward : link.type.outward;
                if (!linkedIssue) return null;
                const typeLower = link.type.name.toLowerCase();
                const isBlocked = !!link.inwardIssue && (typeLower.includes('block') || typeLower.includes('blokkerer'));
                const isBlocking = !!link.outwardIssue && (typeLower.includes('block') || typeLower.includes('blokkerer'));
                const depClass = isBlocked ? styles.depBlocked : isBlocking ? styles.depBlocking : styles.depRelated;
                return (
                  <div key={link.id} className={`${styles.dependencyItem} ${depClass}`}>
                    <span className={styles.depDirection}>{direction}</span>
                    {linkedIssue.issueType?.iconUrl && (
                      <img src={linkedIssue.issueType.iconUrl} alt="" className={styles.depIcon} />
                    )}
                    <a
                      href={`${jiraBaseUrl}/browse/${linkedIssue.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.depKey}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {linkedIssue.key}
                    </a>
                    <span className={styles.depSummary}>{linkedIssue.summary}</span>
                    <Badge
                      variant={
                        linkedIssue.status.category === 'done'
                          ? 'success'
                          : linkedIssue.status.category === 'indeterminate'
                          ? 'primary'
                          : 'default'
                      }
                      size="sm"
                    >
                      {linkedIssue.status.name}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showTodoForm && !todoCreated && (
          <div className={styles.todoForm}>
            <div className={styles.todoFormFields}>
              <div className={styles.todoFormField}>
                <label className={styles.todoFormLabel}>Prioritet</label>
                <select
                  className={styles.todoFormSelect}
                  value={todoPriority}
                  onChange={(e) => setTodoPriority(e.target.value as 'low' | 'medium' | 'high')}
                >
                  <option value="low">Lav</option>
                  <option value="medium">Middels</option>
                  <option value="high">Høy</option>
                </select>
              </div>
              <div className={styles.todoFormField}>
                <label className={styles.todoFormLabel}>Forfallsdato</label>
                <input
                  type="date"
                  className={styles.todoFormDate}
                  value={todoDueDate}
                  onChange={(e) => setTodoDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <div className={styles.modalActions}>
          {todoCreated ? (
            <span className={styles.todoCreatedConfirm}>
              <Check size={14} /> Todo opprettet!
            </span>
          ) : showTodoForm ? (
            <>
              <button
                className={styles.createTodoBtn}
                onClick={() => {
                  addTodo({
                    content: `[${issue.key}] ${issue.summary}`,
                    priority: todoPriority,
                    dueDate: todoDueDate ? new Date(todoDueDate).toISOString() : undefined,
                    linkedJiraIssue: issue.key,
                  });
                  setTodoCreated(true);
                  setShowTodoForm(false);
                  setTimeout(() => setTodoCreated(false), 2000);
                }}
              >
                <CheckSquare size={14} />
                Lagre todo
              </button>
              <button className={styles.cancelTodoBtn} onClick={() => setShowTodoForm(false)}>
                Avbryt
              </button>
            </>
          ) : (
            <button
              className={styles.createTodoBtn}
              onClick={() => {
                const p = issue.priority?.name?.toLowerCase();
                setTodoPriority(p === 'high' || p === 'highest' ? 'high' : p === 'medium' ? 'medium' : 'low');
                setTodoDueDate(issue.dueDate?.split('T')[0] ?? '');
                setShowTodoForm(true);
              }}
              disabled={getTodosByJiraIssue(issue.key).some((t) => !t.completed)}
              title={getTodosByJiraIssue(issue.key).some((t) => !t.completed) ? 'Aktiv todo finnes allerede' : 'Opprett todo'}
            >
              <CheckSquare size={14} />
              Opprett todo
            </button>
          )}
          <a
            href={`${jiraBaseUrl}/browse/${issue.key}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.openInJiraBtn}
          >
            Åpne i Jira
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Steg 2: Oppdater Board.tsx — importer IssueModal og fjern inline modal-blokk**

Legg til import øverst i Board.tsx, etter de andre lokale importene:
```typescript
import { IssueModal } from './IssueModal';
```

Fjern disse state-variablene fra Board.tsx (de håndteres nå internt i IssueModal):
- `showTodoForm`, `setShowTodoForm`
- `todoCreated`, `setTodoCreated`
- `todoPriority`, `setTodoPriority`
- `todoDueDate`, `setTodoDueDate`

Fjern queries/mutations fra Board.tsx som bare gjelder modalen:
- `transitions`-queryen (linje ~149–153)
- `doTransition`-mutasjonen og `changingStatus` (linje ~155–170)

Erstatt den inline modal-blokken (fra `{selectedIssue && (` til `</Modal>` + `)}`) med:
```tsx
{selectedIssue && (
  <IssueModal
    issue={selectedIssue}
    jiraBaseUrl={jiraBaseUrl}
    isOpen={!!selectedIssue}
    onClose={() => setSelectedIssue(null)}
    onTransitioned={(issueKey, newStatus) => {
      queryClient.setQueryData<JiraIssue[]>(boardQueryKey, (old) =>
        (old ?? []).map((issue) =>
          issue.key === issueKey ? { ...issue, status: newStatus } : issue
        )
      );
      setSelectedIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
      queryClient.invalidateQueries({ queryKey: ['boardIssues'] });
    }}
  />
)}
```

- [ ] **Steg 3: Fjern ubrukte imports fra Board.tsx**

Fjern `ExternalLink`, `Check`, `CheckSquare` fra lucide-react-importen i Board.tsx hvis de ikke lenger brukes andre steder i filen. Søk etter bruken i filen før du fjerner.

- [ ] **Steg 4: Typesjekk**

```bash
cd C:/Kode-prosjekter-lokalt/JiraConfluenceDashboard && npx tsc -b --noEmit
```
Forventet: ingen feil.

- [ ] **Steg 5: Commit**

```bash
git add src/pages/Board/IssueModal.tsx src/pages/Board/Board.tsx
git commit -m "Ekstraher IssueModal til egen komponent for gjenbruk"
```

---

## Task 4: Settings — Team-oppsett-seksjon

**Files:**
- Modify: `src/pages/Settings/Settings.tsx`

- [ ] **Steg 1: Legg til imports og state i Settings.tsx**

Legg til disse importene øverst i filen (etter eksisterende imports):
```typescript
import { useQuery } from '@tanstack/react-query';
import { getAllProjectComponents } from '../../services/jiraService';
import { loadTeamConfig, saveTeamConfig, TEAM_NAMES } from '../../store/teamStore';
import type { TeamConfig, TeamName } from '../../store/teamStore';
```

Merk: `isConfigured` er allerede importert og `configured` er allerede definert i komponenten — ikke dupliser disse.

Legg til i Settings-komponenten, etter eksisterende state (f.eks. etter `const configured = isConfigured()`):
```typescript
const [teamConfig, setTeamConfig] = useState<TeamConfig>(loadTeamConfig);
const [teamSaved, setTeamSaved] = useState(false);
const [componentSearch, setComponentSearch] = useState<Partial<Record<TeamName, string>>>({});
const [openDropdown, setOpenDropdown] = useState<TeamName | null>(null);

const { data: allComponents = [] } = useQuery({
  queryKey: ['allProjectComponents'],
  queryFn: getAllProjectComponents,
  enabled: configured,
  staleTime: 1000 * 60 * 30,
});

const assignedComponents = new Set(TEAM_NAMES.flatMap((t) => teamConfig[t]));

const handleAddComponent = (team: TeamName, compName: string) => {
  setTeamConfig((prev) => ({
    ...prev,
    [team]: [...prev[team], compName],
  }));
  setComponentSearch((prev) => ({ ...prev, [team]: '' }));
  setOpenDropdown(null);
  setTeamSaved(false);
};

const handleRemoveComponent = (team: TeamName, compName: string) => {
  setTeamConfig((prev) => ({
    ...prev,
    [team]: prev[team].filter((c) => c !== compName),
  }));
  setTeamSaved(false);
};

const handleSaveTeamConfig = () => {
  saveTeamConfig(teamConfig);
  setTeamSaved(true);
};
```

- [ ] **Steg 2: Legg til Team-oppsett JSX i Settings returverdien**

Legg til en ny `<Card>` like etter den eksisterende `</Card>` (API-konfig) og før den avsluttende `</div>` i return-setningen:

```tsx
<Card>
  <CardHeader>
    <h2>Team-oppsett</h2>
  </CardHeader>
  <CardContent>
    {teamSaved && (
      <div className={styles.statusSaved}>
        <Check size={16} />
        <span>Team-oppsett lagret!</span>
      </div>
    )}
    {!configured && (
      <div className={styles.statusError}>
        <AlertCircle size={16} />
        <span>Konfigurer API-tilgang først for å hente komponenter.</span>
      </div>
    )}

    <div className={styles.teamGrid}>
      {TEAM_NAMES.map((team) => {
        const search = componentSearch[team] ?? '';
        const suggestions = allComponents
          .filter(
            (c) =>
              !assignedComponents.has(c.name) &&
              c.name.toLowerCase().includes(search.toLowerCase())
          )
          .slice(0, 8);

        return (
          <div key={team} className={styles.teamBox}>
            <div className={styles.teamBoxTitle}>{team}</div>
            <div className={styles.teamChips}>
              {teamConfig[team].map((comp) => (
                <span key={comp} className={styles.teamChip}>
                  {comp}
                  <button
                    className={styles.teamChipRemove}
                    onClick={() => handleRemoveComponent(team, comp)}
                    title={`Fjern ${comp}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className={styles.teamCompSearch}>
              <input
                className={styles.teamCompInput}
                placeholder="+ Legg til komponent…"
                value={search}
                onChange={(e) => {
                  setComponentSearch((prev) => ({ ...prev, [team]: e.target.value }));
                  setOpenDropdown(team);
                  setTeamSaved(false);
                }}
                onFocus={() => setOpenDropdown(team)}
                onBlur={() => setTimeout(() => setOpenDropdown(null), 150)}
              />
              {openDropdown === team && suggestions.length > 0 && (
                <div className={styles.teamCompDropdown}>
                  {suggestions.map((c) => (
                    <div
                      key={c.name}
                      className={styles.teamCompOption}
                      onMouseDown={() => handleAddComponent(team, c.name)}
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>

    <Button onClick={handleSaveTeamConfig} icon={<Save size={16} />}>
      Lagre team-oppsett
    </Button>
  </CardContent>
</Card>
```

- [ ] **Steg 3: Legg til CSS i `src/pages/Settings/Settings.module.css`**

Les filen først for å finne slutten, deretter legg til:

```css
/* Team-oppsett */
.teamGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.teamBox {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.teamBoxTitle {
  font-weight: 600;
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-sm);
  color: var(--color-text-primary);
}

.teamChips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: var(--spacing-sm);
  min-height: 28px;
}

.teamChip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: var(--font-size-xs);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
}

.teamChipRemove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-primary);
  font-size: 14px;
  line-height: 1;
  padding: 0;
  opacity: 0.7;
}

.teamChipRemove:hover {
  opacity: 1;
}

.teamCompSearch {
  position: relative;
}

.teamCompInput {
  width: 100%;
  padding: 5px var(--spacing-sm);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
}

.teamCompInput:focus {
  border-color: var(--color-primary);
}

.teamCompDropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 50;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.teamCompOption {
  padding: 6px var(--spacing-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  color: var(--color-text-primary);
}

.teamCompOption:hover {
  background: var(--color-bg-hover);
}
```

- [ ] **Steg 4: Typesjekk**

```bash
cd C:/Kode-prosjekter-lokalt/JiraConfluenceDashboard && npx tsc -b --noEmit
```
Forventet: ingen feil.

- [ ] **Steg 5: Commit**

```bash
git add src/pages/Settings/Settings.tsx src/pages/Settings/Settings.module.css
git commit -m "Legg til Team-oppsett-seksjon i Innstillinger"
```

---

## Task 5: Team.tsx, CSS og grunnstruktur

**Files:**
- Create: `src/pages/Team/Team.module.css`
- Create: `src/pages/Team/Team.tsx`

- [ ] **Steg 1: Opprett `src/pages/Team/Team.module.css`**

```css
.container {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  height: calc(100vh - var(--header-height) - var(--spacing-lg) * 2);
}

/* Øverste team-faner */
.teamTabs {
  display: flex;
  gap: var(--spacing-xs);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.teamTab {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-sm);
  font-weight: 500;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.teamTab:hover {
  color: var(--color-text-primary);
}

.teamTabActive {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

/* Underfaner (Koordinator / Utildelte) */
.subTabs {
  display: flex;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

.subTab {
  padding: 5px var(--spacing-md);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.subTab:hover {
  color: var(--color-text-primary);
}

.subTabActive {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.noConfig {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  flex: 1;
  color: var(--color-text-secondary);
  text-align: center;
}

.noConfig a {
  color: var(--color-primary);
}

/* Statistikkort */
.statsRow {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-md);
  flex-shrink: 0;
}

.statCard {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  text-align: center;
}

.statValue {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
}

.statLabel {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.statDanger { color: #e74c3c; }
.statWarning { color: #f39c12; }
.statPrimary { color: var(--color-primary); }
.statDefault { color: var(--color-text-primary); }

/* Midt-rad: arbeidsbelastning + statusfordeling */
.midRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  flex-shrink: 0;
}

.panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.panelTitle {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: var(--spacing-sm);
}

/* Arbeidsbelastning */
.workloadRow {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: 6px;
}

.workloadName {
  width: 120px;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.workloadBar {
  flex: 1;
  height: 8px;
  background: var(--color-bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.workloadFill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s;
}

.workloadCount {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  width: 24px;
  text-align: right;
  flex-shrink: 0;
}

/* Statusfordeling */
.statusBar {
  display: flex;
  height: 20px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
}

.statusBarDone { background: #2ecc71; }
.statusBarInProgress { background: var(--color-primary); }
.statusBarTodo { background: var(--color-bg-secondary); border: 1px solid var(--color-border); }

.statusLegend {
  display: flex;
  gap: var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.statusLegendDot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

/* Saksliste-seksjon */
.issueSection {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.issueSectionHeader {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  flex-shrink: 0;
}

.issueSectionTitle {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.filterBar {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.filterSelect {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background: var(--color-bg-primary);
  cursor: pointer;
}

/* Utildelte oppgaver */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  flex-shrink: 0;
  min-height: 40px;
}

.toolbarCount {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-primary);
}

.assignBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px var(--spacing-md);
  font-size: var(--font-size-sm);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: opacity 0.15s;
}

.assignBtn:hover { opacity: 0.88; }

.unassignedTable {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: auto;
  flex: 1;
}

.tableHeader {
  display: grid;
  grid-template-columns: 36px 1fr 120px 80px 100px 90px;
  padding: 6px var(--spacing-md);
  background: var(--color-bg-secondary);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.tableRow {
  display: grid;
  grid-template-columns: 36px 1fr 120px 80px 100px 90px;
  padding: 8px var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  font-size: var(--font-size-sm);
  transition: background 0.1s;
}

.tableRow:last-child {
  border-bottom: none;
}

.tableRow:hover {
  background: var(--color-bg-hover);
}

.tableRowSelected {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.issueKey {
  font-family: monospace;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.issueSummary {
  cursor: pointer;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.issueSummary:hover {
  color: var(--color-primary);
  text-decoration: underline;
}

/* Inline assign-popup */
.assignPopup {
  grid-column: 1 / -1;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.assignSearch {
  width: 100%;
  padding: 5px var(--spacing-sm);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
  max-width: 280px;
}

.assignSearch:focus {
  border-color: var(--color-primary);
}

.assignOption {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 5px var(--spacing-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.assignOption:hover {
  background: var(--color-bg-hover);
}

.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xl);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.loadingState {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}
```

- [ ] **Steg 2: Opprett `src/pages/Team/Team.tsx`**

```typescript
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { loadActiveTeam, saveActiveTeam, loadTeamConfig, TEAM_NAMES } from '../../store/teamStore';
import type { TeamName } from '../../store/teamStore';
import { TeamCoordinator } from './TeamCoordinator';
import { TeamUnassigned } from './TeamUnassigned';
import styles from './Team.module.css';

type SubTab = 'koordinator' | 'utildelte';

export function Team() {
  const [activeTeam, setActiveTeam] = useState<TeamName>(loadActiveTeam);
  const [subTab, setSubTab] = useState<SubTab>('koordinator');
  const teamConfig = loadTeamConfig();
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
```

- [ ] **Steg 3: Typesjekk**

```bash
cd C:/Kode-prosjekter-lokalt/JiraConfluenceDashboard && npx tsc -b --noEmit
```
Forventet: feil på `TeamCoordinator` og `TeamUnassigned` (ikke opprettet ennå) — det er OK.

- [ ] **Steg 4: Commit**

```bash
git add src/pages/Team/Team.module.css src/pages/Team/Team.tsx
git commit -m "Legg til Team-side med fanelayout og CSS"
```

---

## Task 6: TeamCoordinator.tsx

**Files:**
- Create: `src/pages/Team/TeamCoordinator.tsx`

- [ ] **Steg 1: Opprett `src/pages/Team/TeamCoordinator.tsx`**

```typescript
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { getIssuesByComponents } from '../../services/jiraService';
import { getJiraBaseUrl, isConfigured } from '../../services/api';
import { IssueModal } from '../Board/IssueModal';
import { IssueList } from '../Board/IssueList';
import type { JiraIssue } from '../../types';
import type { TeamName } from '../../store/teamStore';
import styles from './Team.module.css';

interface TeamCoordinatorProps {
  teamName: TeamName;
  componentNames: string[];
}

const today = new Date(new Date().toDateString());

function isOverdue(dateStr?: string): boolean {
  return !!dateStr && new Date(dateStr) < today;
}

export function TeamCoordinator({ teamName, componentNames }: TeamCoordinatorProps) {
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterComponent, setFilterComponent] = useState('');
  const queryClient = useQueryClient();
  const jiraBaseUrl = getJiraBaseUrl();
  const configured = isConfigured();

  const queryKey = ['teamIssues', teamName, componentNames] as const;

  const { data: issues = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => getIssuesByComponents(componentNames),
    enabled: configured && componentNames.length > 0,
  });

  // Statistikk
  const openIssues = issues.filter((i) => i.status.category !== 'done');
  const overdueIssues = issues.filter((i) => i.status.category !== 'done' && isOverdue(i.dueDate));
  const unassignedIssues = issues.filter((i) => !i.assignee);
  const highPriorityIssues = issues.filter(
    (i) => i.status.category !== 'done' && (i.priority?.name === 'High' || i.priority?.name === 'Highest')
  );

  // Arbeidsbelastning per person
  const workloadMap = new Map<string, number>();
  issues.filter((i) => i.assignee).forEach((i) => {
    const name = i.assignee!.displayName;
    workloadMap.set(name, (workloadMap.get(name) ?? 0) + 1);
  });
  const workloadEntries = [...workloadMap.entries()].sort((a, b) => b[1] - a[1]);
  const maxWorkload = workloadEntries[0]?.[1] ?? 1;

  // Statusfordeling
  const doneCount = issues.filter((i) => i.status.category === 'done').length;
  const inProgressCount = issues.filter((i) => i.status.category === 'indeterminate').length;
  const todoCount = issues.filter((i) => i.status.category === 'new').length;
  const total = issues.length || 1;

  // Filtrert saksliste
  const filteredIssues = issues.filter((i) => {
    if (filterPriority && i.priority?.name !== filterPriority) return false;
    if (filterStatus) {
      if (filterStatus.startsWith('cat:')) {
        if (i.status.category !== filterStatus.slice(4)) return false;
      } else {
        if (i.status.name !== filterStatus) return false;
      }
    }
    if (filterComponent && !i.components.some((c) => c.name === filterComponent)) return false;
    return true;
  });

  const availablePriorities = [...new Set(issues.map((i) => i.priority?.name).filter(Boolean) as string[])];
  const availableStatuses = [...new Map(issues.map((i) => [i.status.name, i.status])).values()].sort((a, b) => {
    const order = { new: 0, indeterminate: 1, done: 2 };
    return order[a.category] - order[b.category];
  });

  if (isLoading) return <div className={styles.loadingState}>Laster saker…</div>;

  return (
    <>
      {/* Statistikkort */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statPrimary}`}>{openIssues.length}</div>
          <div className={styles.statLabel}>Åpne saker</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statDanger}`}>{overdueIssues.length}</div>
          <div className={styles.statLabel}>Forfalt</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statWarning}`}>{unassignedIssues.length}</div>
          <div className={styles.statLabel}>Uten ansvarlig</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statDanger}`}>{highPriorityIssues.length}</div>
          <div className={styles.statLabel}>Høy prioritet</div>
        </div>
      </div>

      {/* Midt-rad */}
      <div className={styles.midRow}>
        {/* Arbeidsbelastning */}
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Belastning per person</div>
          {workloadEntries.length === 0 ? (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Ingen tildelte saker
            </div>
          ) : (
            workloadEntries.map(([name, count]) => (
              <div key={name} className={styles.workloadRow}>
                <span className={styles.workloadName} title={name}>{name}</span>
                <div className={styles.workloadBar}>
                  <div
                    className={styles.workloadFill}
                    style={{ width: `${(count / maxWorkload) * 100}%` }}
                  />
                </div>
                <span className={styles.workloadCount}>{count}</span>
              </div>
            ))
          )}
        </div>

        {/* Statusfordeling */}
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Statusfordeling</div>
          <div className={styles.statusBar}>
            {doneCount > 0 && (
              <div
                className={styles.statusBarDone}
                style={{ flex: doneCount / total }}
                title={`Ferdig: ${doneCount}`}
              />
            )}
            {inProgressCount > 0 && (
              <div
                className={styles.statusBarInProgress}
                style={{ flex: inProgressCount / total }}
                title={`Pågår: ${inProgressCount}`}
              />
            )}
            {todoCount > 0 && (
              <div
                className={styles.statusBarTodo}
                style={{ flex: todoCount / total }}
                title={`Å gjøre: ${todoCount}`}
              />
            )}
          </div>
          <div className={styles.statusLegend}>
            <span>
              <span className={styles.statusLegendDot} style={{ background: '#2ecc71' }} />
              Ferdig ({doneCount})
            </span>
            <span>
              <span className={styles.statusLegendDot} style={{ background: 'var(--color-primary)' }} />
              Pågår ({inProgressCount})
            </span>
            <span>
              <span className={styles.statusLegendDot} style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }} />
              Å gjøre ({todoCount})
            </span>
          </div>
        </div>
      </div>

      {/* Saksliste */}
      <div className={styles.issueSection}>
        <div className={styles.issueSectionHeader}>
          <span className={styles.issueSectionTitle}>Alle saker ({filteredIssues.length})</span>
          <div className={styles.filterBar}>
            {availablePriorities.length > 0 && (
              <select
                className={styles.filterSelect}
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
              >
                <option value="">Alle prioriteter</option>
                {availablePriorities.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            {availableStatuses.length > 0 && (
              <select
                className={styles.filterSelect}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Alle statuser</option>
                <optgroup label="Kategori">
                  <option value="cat:new">Å gjøre</option>
                  <option value="cat:indeterminate">Pågår</option>
                  <option value="cat:done">Ferdig</option>
                </optgroup>
                <optgroup label="Spesifikk status">
                  {availableStatuses.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </optgroup>
              </select>
            )}
            {componentNames.length > 1 && (
              <select
                className={styles.filterSelect}
                value={filterComponent}
                onChange={(e) => setFilterComponent(e.target.value)}
              >
                <option value="">Alle komponenter</option>
                {componentNames.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => refetch()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}
              title="Oppdater"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <IssueList
          issues={filteredIssues}
          jiraBaseUrl={jiraBaseUrl}
          onIssueClick={setSelectedIssue}
        />
      </div>

      {selectedIssue && (
        <IssueModal
          issue={selectedIssue}
          jiraBaseUrl={jiraBaseUrl}
          isOpen={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onTransitioned={(issueKey, newStatus) => {
            queryClient.setQueryData<JiraIssue[]>(queryKey, (old) =>
              (old ?? []).map((i) =>
                i.key === issueKey ? { ...i, status: newStatus } : i
              )
            );
            setSelectedIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Steg 2: Typesjekk**

```bash
cd C:/Kode-prosjekter-lokalt/JiraConfluenceDashboard && npx tsc -b --noEmit
```
Forventet: ingen feil (bortsett fra TeamUnassigned som mangler).

- [ ] **Steg 3: Commit**

```bash
git add src/pages/Team/TeamCoordinator.tsx
git commit -m "Legg til TeamCoordinator med statistikk, arbeidsbelastning og saksliste"
```

---

## Task 7: TeamUnassigned.tsx

**Files:**
- Create: `src/pages/Team/TeamUnassigned.tsx`

- [ ] **Steg 1: Opprett `src/pages/Team/TeamUnassigned.tsx`**

```typescript
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ChevronDown, CheckSquare } from 'lucide-react';
import { getIssuesByComponents, searchUsers, assignIssue } from '../../services/jiraService';
import { getJiraBaseUrl, isConfigured } from '../../services/api';
import { IssueModal } from '../Board/IssueModal';
import type { JiraIssue, JiraUser } from '../../types';
import type { TeamName } from '../../store/teamStore';
import styles from './Team.module.css';

interface TeamUnassignedProps {
  teamName: TeamName;
  componentNames: string[];
}

export function TeamUnassigned({ teamName, componentNames }: TeamUnassignedProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [openAssignRow, setOpenAssignRow] = useState<string | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [rowSearch, setRowSearch] = useState('');
  const [bulkSearch, setBulkSearch] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const bulkRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const jiraBaseUrl = getJiraBaseUrl();
  const configured = isConfigured();

  const queryKey = ['teamIssues', teamName, componentNames] as const;

  const { data: allIssues = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => getIssuesByComponents(componentNames),
    enabled: configured && componentNames.length > 0,
  });

  const issues = allIssues.filter((i) => !i.assignee);

  // Brukersøk for rad
  const { data: rowUsers = [] } = useQuery({
    queryKey: ['userSearch', rowSearch],
    queryFn: () => searchUsers(rowSearch),
    enabled: !!openAssignRow && rowSearch.length >= 1,
  });

  // Brukersøk for bulk
  const { data: bulkUsers = [] } = useQuery({
    queryKey: ['userSearch', bulkSearch],
    queryFn: () => searchUsers(bulkSearch),
    enabled: bulkAssignOpen && bulkSearch.length >= 1,
  });

  const { mutate: doAssign } = useMutation({
    mutationFn: ({ issueKey, accountId }: { issueKey: string; accountId: string; displayName: string }) =>
      assignIssue(issueKey, accountId),
    onSuccess: (_, { issueKey, displayName }) => {
      queryClient.setQueryData<JiraIssue[]>(queryKey, (old) =>
        (old ?? []).map((i) =>
          i.key === issueKey
            ? { ...i, assignee: { displayName, avatarUrl: undefined } }
            : i
        )
      );
    },
  });

  const handleAssignRow = (issue: JiraIssue, user: JiraUser) => {
    doAssign({ issueKey: issue.key, accountId: user.accountId, displayName: user.displayName });
    setOpenAssignRow(null);
    setRowSearch('');
  };

  const handleAssignBulk = (user: JiraUser) => {
    [...selectedKeys].forEach((key) => {
      doAssign({ issueKey: key, accountId: user.accountId, displayName: user.displayName });
    });
    setSelectedKeys(new Set());
    setBulkAssignOpen(false);
    setBulkSearch('');
  };

  const toggleRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedKeys.size === issues.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(issues.map((i) => i.key)));
    }
  };

  // Lukk bulk-dropdown ved klikk utenfor
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bulkRef.current && !bulkRef.current.contains(e.target as Node)) {
        setBulkAssignOpen(false);
        setBulkSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (isLoading) return <div className={styles.loadingState}>Laster saker…</div>;

  if (issues.length === 0) {
    return (
      <div className={styles.emptyState}>
        <CheckSquare size={32} />
        <p>Alle saker for <strong>{teamName}</strong> har en ansvarlig. Bra jobbet!</p>
      </div>
    );
  }

  const priorityColor = (name?: string) => {
    switch (name?.toLowerCase()) {
      case 'highest':
      case 'high': return '#e74c3c';
      case 'medium': return '#f39c12';
      default: return 'var(--color-text-secondary)';
    }
  };

  return (
    <>
      {/* Verktøylinje */}
      <div className={styles.toolbar}>
        {selectedKeys.size > 0 ? (
          <>
            <span className={styles.toolbarCount}>{selectedKeys.size} valgt</span>
            <div ref={bulkRef} style={{ position: 'relative' }}>
              <button
                className={styles.assignBtn}
                onClick={() => { setBulkAssignOpen((v) => !v); setBulkSearch(''); }}
              >
                <UserPlus size={14} />
                Tildel valgte
                <ChevronDown size={12} />
              </button>
              {bulkAssignOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
                  background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', minWidth: 220,
                }}>
                  <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border)' }}>
                    <input
                      className={styles.assignSearch}
                      placeholder="Søk etter person…"
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {bulkUsers.map((u) => (
                      <div
                        key={u.accountId}
                        className={styles.assignOption}
                        onClick={() => handleAssignBulk(u)}
                      >
                        {u.displayName}
                      </div>
                    ))}
                    {bulkSearch.length >= 1 && bulkUsers.length === 0 && (
                      <div style={{ padding: '8px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        Ingen treff
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            {issues.length} utildelte oppgaver — velg rader for bulktildeling
          </span>
        )}
      </div>

      {/* Tabell */}
      <div className={styles.unassignedTable}>
        <div className={styles.tableHeader}>
          <div>
            <input
              type="checkbox"
              checked={selectedKeys.size === issues.length && issues.length > 0}
              onChange={toggleAll}
              style={{ accentColor: 'var(--color-primary)' }}
            />
          </div>
          <div>Sak</div>
          <div>Komponent</div>
          <div>Prioritet</div>
          <div>Status</div>
          <div>Tildel</div>
        </div>

        {issues.map((issue) => (
          <div key={issue.key}>
            <div
              className={`${styles.tableRow} ${selectedKeys.has(issue.key) ? styles.tableRowSelected : ''}`}
            >
              <div>
                <input
                  type="checkbox"
                  checked={selectedKeys.has(issue.key)}
                  onChange={() => toggleRow(issue.key)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
              </div>
              <div style={{ overflow: 'hidden' }}>
                <span className={styles.issueKey}>{issue.key} </span>
                <span
                  className={styles.issueSummary}
                  onClick={() => setSelectedIssue(issue)}
                  title={issue.summary}
                >
                  {issue.summary}
                </span>
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                {issue.components.map((c) => c.name).join(', ')}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: priorityColor(issue.priority?.name) }}>
                {issue.priority?.name ?? '—'}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)' }}>{issue.status.name}</div>
              <div>
                <button
                  className={styles.assignBtn}
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={() => {
                    setOpenAssignRow(openAssignRow === issue.key ? null : issue.key);
                    setRowSearch('');
                  }}
                >
                  <UserPlus size={12} />
                  Tildel
                </button>
              </div>
            </div>

            {openAssignRow === issue.key && (
              <div className={styles.assignPopup}>
                <input
                  className={styles.assignSearch}
                  placeholder="Søk etter person…"
                  value={rowSearch}
                  onChange={(e) => setRowSearch(e.target.value)}
                  autoFocus
                />
                <div style={{ marginTop: 4 }}>
                  {rowUsers.map((u) => (
                    <div
                      key={u.accountId}
                      className={styles.assignOption}
                      onClick={() => handleAssignRow(issue, u)}
                    >
                      {u.displayName}
                    </div>
                  ))}
                  {rowSearch.length >= 1 && rowUsers.length === 0 && (
                    <div style={{ padding: '4px 8px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                      Ingen treff
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedIssue && (
        <IssueModal
          issue={selectedIssue}
          jiraBaseUrl={jiraBaseUrl}
          isOpen={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onTransitioned={(issueKey, newStatus) => {
            queryClient.setQueryData<JiraIssue[]>(queryKey, (old) =>
              (old ?? []).map((i) =>
                i.key === issueKey ? { ...i, status: newStatus } : i
              )
            );
            setSelectedIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Steg 2: Typesjekk**

```bash
cd C:/Kode-prosjekter-lokalt/JiraConfluenceDashboard && npx tsc -b --noEmit
```
Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/pages/Team/TeamUnassigned.tsx
git commit -m "Legg til TeamUnassigned med rad- og bulktildeling via Jira API"
```

---

## Task 8: Ruting og navigasjon

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Layout/LayoutV2.tsx`

- [ ] **Steg 1: Legg til rute i App.tsx**

Legg til import:
```typescript
import { Team } from './pages/Team/Team';
```

Legg til rute inne i `<Route path="/" element={<Layout />}>`:
```tsx
<Route path="team" element={<Team />} />
```

- [ ] **Steg 2: Legg til menyvalg i LayoutV2.tsx**

Legg til `Users` i lucide-react-importen:
```typescript
import {
  LayoutDashboard, FileText, Kanban, CheckSquare, Settings, AlertTriangle,
  Sparkles, Calendar, TrendingUp, PanelLeftOpen, PanelLeftClose, Wand2, Users,
} from 'lucide-react';
```

Legg til i `navItems`-arrayen, etter `{ path: '/board', ... }`:
```typescript
{ path: '/team', icon: Users, label: 'Team' },
```

- [ ] **Steg 3: Typesjekk og bygg**

```bash
cd C:/Kode-prosjekter-lokalt/JiraConfluenceDashboard && npx tsc -b --noEmit
```
Forventet: ingen feil.

```bash
cd C:/Kode-prosjekter-lokalt/JiraConfluenceDashboard && npm run build 2>&1 | tail -20
```
Forventet: bygget fullføres uten feil.

- [ ] **Steg 4: Commit**

```bash
git add src/App.tsx src/components/Layout/LayoutV2.tsx
git commit -m "Legg til /team-rute og Team-menyvalg i navigasjon"
```
