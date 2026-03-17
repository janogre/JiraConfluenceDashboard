import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, FolderKanban } from 'lucide-react';
import { Badge } from '../../components/common';
import styles from './Microsoft.module.css';

// ─── Mock data ────────────────────────────────────────────────────────────────

const TODAY = '2026-03-16';

const TODO_LISTS = [
  {
    id: 'work',
    name: 'Arbeidsoppgaver',
    tasks: [
      { id: 't1', title: 'Ferdigstille kravspesifikasjon', priority: 'high' as const, dueDate: TODAY,          plan: 'Digitaliseringsprosjekt', bucket: 'Pågående' },
      { id: 't2', title: 'Møte med Telia om NNI',          priority: 'medium' as const, dueDate: '2026-03-18', plan: undefined,                   bucket: undefined },
      { id: 't3', title: 'Kodegjennomgang sprint 14',      priority: 'low' as const,    dueDate: '2026-03-20', plan: 'Digitaliseringsprosjekt', bucket: 'Til review' },
      { id: 't4', title: 'Oppdatere dokumentasjon',        priority: 'low' as const,    dueDate: undefined,    plan: undefined,                   bucket: undefined },
    ],
  },
  {
    id: 'private',
    name: 'Privat',
    tasks: [
      { id: 't5', title: 'Bestille flybilletter', priority: 'medium' as const, dueDate: '2026-03-25', plan: undefined, bucket: undefined },
      { id: 't6', title: 'Tannlegetime',          priority: 'low' as const,    dueDate: undefined,    plan: undefined, bucket: undefined },
    ],
  },
];

const PLANNER_PLANS = [
  {
    id: 'p1',
    name: 'Digitaliseringsprosjekt',
    buckets: [
      {
        id: 'b1',
        name: 'Backlog',
        tasks: [
          { id: 'pt1', title: 'API-integrasjon mot SAP', progress: 0, dueDate: '2026-03-28' },
          { id: 'pt2', title: 'Brukertest ny onboarding-flyt', progress: 25, dueDate: undefined },
        ],
      },
      {
        id: 'b2',
        name: 'Pågående',
        tasks: [
          { id: 'pt3', title: 'Redesign av rapportmodul', progress: 50, dueDate: '2026-03-17' },
          { id: 'pt4', title: 'Migrering av testdata', progress: 50, dueDate: '2026-03-19' },
        ],
      },
      {
        id: 'b3',
        name: 'Til review',
        tasks: [
          { id: 'pt5', title: 'Sprint 14 demo-presentasjon', progress: 75, dueDate: TODAY },
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_LABELS = { high: 'Høy', medium: 'Middels', low: 'Lav' };
const PRIORITY_VARIANTS = {
  high: 'danger' as const,
  medium: 'warning' as const,
  low: 'default' as const,
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function isToday(dateString: string) {
  return dateString === TODAY;
}

function isOverdue(dateString: string) {
  return dateString < TODAY;
}

function dueDateVariant(dateString: string) {
  if (isOverdue(dateString)) return 'danger' as const;
  if (isToday(dateString)) return 'warning' as const;
  return 'default' as const;
}

function dueDateLabel(dateString: string) {
  if (isToday(dateString)) return 'I dag';
  if (isOverdue(dateString)) return `Forfalt ${formatDate(dateString)}`;
  return formatDate(dateString);
}

function progressVariant(pct: number) {
  if (pct === 0) return 'default' as const;
  if (pct < 50) return 'info' as const;
  if (pct < 75) return 'warning' as const;
  return 'success' as const;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CollapsibleGroupProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleGroup({ title, count, defaultOpen = true, children }: CollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.group}>
      <button className={styles.groupHeader} onClick={() => setOpen((v) => !v)}>
        <span className={styles.groupTitle}>{title}</span>
        <span className={styles.groupCount}>{count}</span>
        <span className={styles.chevron}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && <div className={styles.groupBody}>{children}</div>}
    </div>
  );
}

function TodoTaskRow({ task }: { task: typeof TODO_LISTS[0]['tasks'][0] }) {
  return (
    <div className={styles.taskRow}>
      <span className={styles.taskCircle} />
      <div className={styles.taskMain}>
        <span className={styles.taskTitle}>{task.title}</span>
        {(task.plan || task.bucket) && (
          <div className={styles.taskPlanMeta}>
            {task.plan && (
              <span className={styles.taskPlanBadge}>
                <Layers size={11} />
                {task.plan}
              </span>
            )}
            {task.bucket && (
              <span className={styles.taskBucketBadge}>
                <FolderKanban size={11} />
                {task.bucket}
              </span>
            )}
          </div>
        )}
      </div>
      <div className={styles.taskBadges}>
        <Badge variant={PRIORITY_VARIANTS[task.priority]} size="sm">
          {PRIORITY_LABELS[task.priority]}
        </Badge>
        {task.dueDate && (
          <Badge variant={dueDateVariant(task.dueDate)} size="sm">
            {dueDateLabel(task.dueDate)}
          </Badge>
        )}
      </div>
    </div>
  );
}

function PlannerTaskRow({ task }: { task: typeof PLANNER_PLANS[0]['buckets'][0]['tasks'][0] }) {
  return (
    <div className={styles.taskRow}>
      <span className={styles.taskCircle} />
      <span className={styles.taskTitle}>{task.title}</span>
      <div className={styles.taskBadges}>
        <Badge variant={progressVariant(task.progress)} size="sm">
          {task.progress}%
        </Badge>
        {task.dueDate && (
          <Badge variant={dueDateVariant(task.dueDate)} size="sm">
            {dueDateLabel(task.dueDate)}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Microsoft() {
  return (
    <div className={styles.container}>
      {/* Mock user bar */}
      <div className={styles.userBar}>
        <div className={styles.msIcon}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="8.5" height="8.5" fill="#f25022" />
            <rect x="10.5" y="1" width="8.5" height="8.5" fill="#7fba00" />
            <rect x="1" y="10.5" width="8.5" height="8.5" fill="#00a4ef" />
            <rect x="10.5" y="10.5" width="8.5" height="8.5" fill="#ffb900" />
          </svg>
        </div>
        <div className={styles.userInfo}>
          <span className={styles.userName}>Ola Nordmann</span>
          <span className={styles.userEmail}>ola@bedrift.no</span>
        </div>
        <button className={styles.logoutBtn} disabled>
          Logg ut
        </button>
      </div>

      {/* ── Microsoft Todo ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          <span>📋</span> Microsoft Todo
        </h2>
        <div className={styles.listStack}>
          {TODO_LISTS.map((list) => (
            <CollapsibleGroup key={list.id} title={list.name} count={list.tasks.length}>
              {list.tasks.map((task) => (
                <TodoTaskRow key={task.id} task={task} />
              ))}
            </CollapsibleGroup>
          ))}
        </div>
      </section>

      {/* ── Microsoft Planner ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          <span>📊</span> Microsoft Planner
        </h2>
        {PLANNER_PLANS.map((plan) => (
          <div key={plan.id} className={styles.planCard}>
            <div className={styles.planHeader}>{plan.name}</div>
            <div className={styles.planBody}>
              {plan.buckets.map((bucket) => (
                <div key={bucket.id} className={styles.bucket}>
                  <div className={styles.bucketTitle}>{bucket.name}</div>
                  {bucket.tasks.map((task) => (
                    <PlannerTaskRow key={task.id} task={task} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
