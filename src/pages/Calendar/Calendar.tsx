import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardContent, Button, Input, LoadingSpinner } from '../../components/common';
import { getIssues, getProjects } from '../../services/jiraService';
import { isConfigured } from '../../services/api';
import { useCalendarStore } from '../../store/calendarStore';
import type { AbsenceEntry, AbsenceType, JiraIssue } from '../../types';
import styles from './Calendar.module.css';

const ABSENCE_COLORS: Record<AbsenceType, string> = {
  ferie: '#3b82f6',
  syk: '#ef4444',
  avspasering: '#f59e0b',
  annet: '#8b5cf6',
};

const WEEK_DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // pad to Monday start
  const days: Date[] = [];
  const startDow = (first.getDay() + 6) % 7; // 0=Mon
  for (let i = 0; i < startDow; i++) {
    const d = new Date(first);
    d.setDate(d.getDate() - (startDow - i));
    days.push(d);
  }
  for (let i = 1; i <= last.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  // pad to full weeks
  while (days.length % 7 !== 0) {
    const d = new Date(days[days.length - 1]);
    d.setDate(d.getDate() + 1);
    days.push(d);
  }
  return days;
}

function getAssignees(issues: JiraIssue[]): { accountId: string; displayName: string; avatarUrl?: string }[] {
  const map = new Map<string, { accountId: string; displayName: string; avatarUrl?: string }>();
  issues.forEach((i) => {
    if (i.assignee) {
      // Use displayName as pseudo-accountId since Jira API may not expose accountId directly here
      const key = i.assignee.displayName;
      if (!map.has(key)) {
        map.set(key, { accountId: key, displayName: i.assignee.displayName, avatarUrl: i.assignee.avatarUrl });
      }
    }
  });
  return Array.from(map.values());
}

interface AddAbsenceModalProps {
  onClose: () => void;
  onAdd: (entry: Omit<AbsenceEntry, 'id'>) => void;
  assignees: { accountId: string; displayName: string }[];
}

function AddAbsenceModal({ onClose, onAdd, assignees }: AddAbsenceModalProps) {
  const [form, setForm] = useState({
    personAccountId: assignees[0]?.accountId ?? '',
    personName: assignees[0]?.displayName ?? '',
    startDate: isoDate(new Date()),
    endDate: isoDate(new Date()),
    type: 'ferie' as AbsenceType,
    note: '',
  });

  const handlePersonChange = (accountId: string) => {
    const a = assignees.find((x) => x.accountId === accountId);
    setForm((f) => ({ ...f, personAccountId: accountId, personName: a?.displayName ?? '' }));
  };

  const handleSubmit = () => {
    if (!form.personAccountId || !form.startDate || !form.endDate) return;
    onAdd(form);
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>Legg til fravær</h3>

        <div className={styles.modalForm}>
          <label className={styles.label}>Person</label>
          <select
            className={styles.select}
            value={form.personAccountId}
            onChange={(e) => handlePersonChange(e.target.value)}
          >
            {assignees.map((a) => (
              <option key={a.accountId} value={a.accountId}>{a.displayName}</option>
            ))}
          </select>

          <label className={styles.label}>Type</label>
          <select
            className={styles.select}
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AbsenceType }))}
          >
            <option value="ferie">Ferie</option>
            <option value="syk">Syk</option>
            <option value="avspasering">Avspasering</option>
            <option value="annet">Annet</option>
          </select>

          <Input
            label="Fra"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
          <Input
            label="Til"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
          <Input
            label="Notat (valgfritt)"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </div>

        <div className={styles.modalActions}>
          <Button onClick={onClose}>Avbryt</Button>
          <Button onClick={handleSubmit}>Lagre</Button>
        </div>
      </div>
    </div>
  );
}

function loadStarredProjects(): Set<string> {
  try {
    const raw = localStorage.getItem('board_starred_projects');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function TeamCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [showModal, setShowModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const starredProjects = loadStarredProjects();

  const { absences, addAbsence, deleteAbsence } = useCalendarStore();
  const configured = isConfigured();

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    enabled: configured,
  });

  const { data: issues = [], isLoading: loadingIssues } = useQuery({
    queryKey: ['calendar-issues', selectedProject],
    queryFn: () =>
      getIssues(
        undefined,
        `project = "${selectedProject}" AND duedate is not EMPTY AND statusCategory != Done ORDER BY duedate DESC`
      ),
    enabled: configured && selectedProject !== '',
  });

  const isLoading = loadingProjects || loadingIssues;

  const assignees = getAssignees(issues);

  const days = getMonthDays(year, month);

  const monthStart = isoDate(new Date(year, month, 1));
  const monthEnd = isoDate(new Date(year, month + 1, 0));
  const relevantAbsences = absences.filter((a) => a.startDate <= monthEnd && a.endDate >= monthStart);

  const issuesByDate: Record<string, JiraIssue[]> = {};
  issues.forEach((issue) => {
    if (issue.dueDate) {
      if (!issuesByDate[issue.dueDate]) issuesByDate[issue.dueDate] = [];
      issuesByDate[issue.dueDate].push(issue);
    }
  });

  const nextMonthYear = month === 11 ? year + 1 : year;
  const nextMonthIndex = month === 11 ? 0 : month + 1;
  const nextMonthStart = isoDate(new Date(nextMonthYear, nextMonthIndex, 1));
  const nextMonthEnd = isoDate(new Date(nextMonthYear, nextMonthIndex + 1, 0));
  const nextMonthLabel = new Date(nextMonthYear, nextMonthIndex).toLocaleDateString('nb-NO', { month: 'long' });

  const thisMonthCount = issues.filter(
    (i) => i.dueDate && i.dueDate >= monthStart && i.dueDate <= monthEnd
  ).length;
  const nextMonthCount = issues.filter(
    (i) => i.dueDate && i.dueDate >= nextMonthStart && i.dueDate <= nextMonthEnd
  ).length;

  const absencesByDate: Record<string, AbsenceEntry[]> = {};
  days.forEach((d) => {
    const ds = isoDate(d);
    absencesByDate[ds] = relevantAbsences.filter((a) => a.startDate <= ds && a.endDate >= ds);
  });

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const monthLabel = new Date(year, month).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });

  const selectedDayIssues = selectedDay ? (issuesByDate[selectedDay] ?? []) : [];
  const selectedDayAbsences = selectedDay ? (absencesByDate[selectedDay] ?? []) : [];

  if (!configured) {
    return (
      <div className={styles.container}>
        <Card><CardContent><p>Konfigurer API-tilkobling under Settings først.</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.projectBar}>
        <label className={styles.projectBarLabel} htmlFor="cal-project-select">Prosjekt</label>
        <select
          id="cal-project-select"
          className={styles.projectSelect}
          value={selectedProject}
          onChange={(e) => { setSelectedProject(e.target.value); setSelectedDay(null); }}
          disabled={loadingProjects}
        >
          <option value="">— Velg prosjekt —</option>
          {starredProjects.size > 0 && (
            <optgroup label="Stjernemerket">
              {projects
                .filter((p) => starredProjects.has(p.key))
                .map((p) => (
                  <option key={p.key} value={p.key}>★ {p.name}</option>
                ))}
            </optgroup>
          )}
          <optgroup label="Alle prosjekter">
            {projects
              .filter((p) => !starredProjects.has(p.key))
              .map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
          </optgroup>
        </select>
      </div>

      {selectedProject && !loadingIssues && (
        <div className={styles.monthSummary}>
          <div className={styles.monthSummaryItem}>
            <span className={styles.monthSummaryCount}>{thisMonthCount}</span>
            <span className={styles.monthSummaryLabel}>saker forfaller i {new Date(year, month).toLocaleDateString('nb-NO', { month: 'long' })}</span>
          </div>
          <div className={styles.monthSummarySep} />
          <div className={styles.monthSummaryItem}>
            <span className={`${styles.monthSummaryCount} ${styles.monthSummaryCountMuted}`}>{nextMonthCount}</span>
            <span className={styles.monthSummaryLabel}>saker forfaller i {nextMonthLabel}</span>
          </div>
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.calendarSection}>
          <Card>
            <CardHeader>
              <div className={styles.calHeader}>
                <button className={styles.navBtn} onClick={prevMonth}><ChevronLeft size={18} /></button>
                <h3 className={styles.monthLabel}>{monthLabel}</h3>
                <button className={styles.navBtn} onClick={nextMonth}><ChevronRight size={18} /></button>
                <button
                  className={styles.todayBtn}
                  onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
                >
                  I dag
                </button>
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => setShowModal(true)}
                >
                  Fravær
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedProject ? (
                <div className={styles.emptyCalendar}>Velg et prosjekt for å vise issues i kalenderen.</div>
              ) : isLoading ? <LoadingSpinner /> : (
                <div className={styles.grid}>
                  {WEEK_DAYS.map((d) => (
                    <div key={d} className={styles.weekDay}>{d}</div>
                  ))}
                  {days.map((d) => {
                    const ds = isoDate(d);
                    const isCurrentMonth = d.getMonth() === month;
                    const isToday = ds === isoDate(today);
                    const dayIssues = issuesByDate[ds] ?? [];
                    const dayAbsences = absencesByDate[ds] ?? [];

                    return (
                      <div
                        key={ds}
                        className={`${styles.dayCell} ${!isCurrentMonth ? styles.dayCellOther : ''} ${isToday ? styles.dayCellToday : ''} ${selectedDay === ds ? styles.dayCellSelected : ''}`}
                        onClick={() => setSelectedDay(selectedDay === ds ? null : ds)}
                      >
                        <span className={styles.dayNum}>{d.getDate()}</span>
                        {dayAbsences.length > 0 && (
                          <div className={styles.absenceStripes}>
                            {dayAbsences.map((a) => (
                              <div
                                key={a.id}
                                className={styles.absenceStripe}
                                style={{ background: ABSENCE_COLORS[a.type] }}
                                title={`${a.personName}: ${a.type}`}
                              />
                            ))}
                          </div>
                        )}
                        {dayIssues.length > 0 && (
                          <div className={styles.issueDots}>
                            {dayIssues.slice(0, 3).map((i) => (
                              <div key={i.id} className={styles.issueDot} title={`${i.key}: ${i.summary}`} />
                            ))}
                            {dayIssues.length > 3 && (
                              <span className={styles.moreIssues}>+{dayIssues.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className={styles.sidebar}>
          {selectedDay ? (
            <Card>
              <CardHeader>
                <h3>{new Date(selectedDay + 'T12:00:00').toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
              </CardHeader>
              <CardContent>
                {selectedDayAbsences.length > 0 && (
                  <div className={styles.sideSection}>
                    <h4 className={styles.sideTitle}>Fravær</h4>
                    {selectedDayAbsences.map((a) => (
                      <div key={a.id} className={styles.absenceItem}>
                        <div
                          className={styles.absenceDot}
                          style={{ background: ABSENCE_COLORS[a.type] }}
                        />
                        <div className={styles.absenceInfo}>
                          <span className={styles.absenceName}>{a.personName}</span>
                          <span className={styles.absenceType}>{a.type}</span>
                          {a.note && <span className={styles.absenceNote}>{a.note}</span>}
                        </div>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => deleteAbsence(a.id)}
                          title="Slett"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {selectedDayIssues.length > 0 && (
                  <div className={styles.sideSection}>
                    <h4 className={styles.sideTitle}>Issues forfaller</h4>
                    {selectedDayIssues.map((i) => (
                      <div key={i.id} className={styles.issueItem}>
                        <span className={styles.issueKey}>{i.key}</span>
                        <span className={styles.issueSummary}>{i.summary}</span>
                        {i.assignee && (
                          <span className={styles.issueAssignee}>{i.assignee.displayName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {selectedDayAbsences.length === 0 && selectedDayIssues.length === 0 && (
                  <p className={styles.empty}>Ingen hendelser denne dagen.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <p className={styles.empty}>Klikk på en dag for å se detaljer.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><h3>Fravær denne måneden</h3></CardHeader>
            <CardContent>
              {relevantAbsences.length === 0 ? (
                <p className={styles.empty}>Ingen registrert fravær.</p>
              ) : (
                <div className={styles.absenceList}>
                  {relevantAbsences.map((a) => (
                    <div key={a.id} className={styles.absenceListItem}>
                      <div className={styles.absenceDot} style={{ background: ABSENCE_COLORS[a.type] }} />
                      <div className={styles.absenceInfo}>
                        <span className={styles.absenceName}>{a.personName}</span>
                        <span className={styles.absenceType}>{a.type} · {a.startDate} – {a.endDate}</span>
                      </div>
                      <button className={styles.deleteBtn} onClick={() => deleteAbsence(a.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showModal && (
        <AddAbsenceModal
          onClose={() => setShowModal(false)}
          onAdd={addAbsence}
          assignees={assignees.length > 0 ? assignees : [{ accountId: 'manual', displayName: 'Manuell person' }]}
        />
      )}
    </div>
  );
}
