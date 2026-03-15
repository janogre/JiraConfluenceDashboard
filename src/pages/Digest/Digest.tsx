import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles, Copy, Check, PackageCheck, ActivitySquare,
  AlertTriangle, CalendarArrowUp,
} from 'lucide-react';
import { Card, CardContent, Button, LoadingSpinner } from '../../components/common';
import { getIssues, getMyIssues } from '../../services/jiraService';
import { isConfigured, getAnthropicKey } from '../../services/api';
import type { JiraIssue } from '../../types';
import styles from './Digest.module.css';

// ── Markdown parser ────────────────────────────────────────────────────────────

interface DigestSection {
  heading: string;
  body: string;
}

function parseSections(text: string): DigestSection[] {
  const lines = text.split('\n');
  const sections: DigestSection[] = [];
  let current: DigestSection | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^##\s*/, '').trim(), body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) sections.push(current);
  return sections;
}

const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

function renderBody(text: string): React.ReactNode[] {
  const paragraphs = text.trim().split(/\n\n+/);
  return paragraphs.map((para, pi) => {
    const trimmed = para.trim();
    if (!trimmed) return null;

    // Split paragraph into bold + issue key tokens
    const nodes: React.ReactNode[] = [];
    // Combined regex: **bold** or ISSUE-KEY
    const tokenRe = /\*\*(.+?)\*\*|([A-Z][A-Z0-9]+-\d+)/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = tokenRe.exec(trimmed)) !== null) {
      if (m.index > last) nodes.push(trimmed.slice(last, m.index));
      if (m[1]) {
        nodes.push(<strong key={m.index}>{m[1]}</strong>);
      } else if (m[2]) {
        nodes.push(
          <span key={m.index} className={styles.issueKey}>{m[2]}</span>
        );
      }
      last = m.index + m[0].length;
    }
    if (last < trimmed.length) nodes.push(trimmed.slice(last));

    return <p key={pi} className={styles.bodyPara}>{nodes}</p>;
  }).filter(Boolean) as React.ReactNode[];
}

// ── Section config ─────────────────────────────────────────────────────────────

const SECTION_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  'Hva ble levert': {
    icon: <PackageCheck size={18} />,
    color: 'green',
  },
  'Pågående arbeid': {
    icon: <ActivitySquare size={18} />,
    color: 'blue',
  },
  'Hindringer': {
    icon: <AlertTriangle size={18} />,
    color: 'red',
  },
  'Neste uke': {
    icon: <CalendarArrowUp size={18} />,
    color: 'purple',
  },
};

function fallbackConfig(heading: string) {
  return SECTION_CONFIG[heading] ?? { icon: <Sparkles size={18} />, color: 'gray' };
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildPrompt(done: JiraIssue[], active: JiraIssue[], blocked: JiraIssue[], weekLabel: string): string {
  const fmt = (issues: JiraIssue[]) =>
    issues.slice(0, 20).map((i) =>
      `- ${i.key}: ${i.summary}${i.assignee ? ` (${i.assignee.displayName})` : ''}`
    ).join('\n') || '(ingen)';

  return `Du er assistent for et utviklingsteam. Lag et kortfattet ukesammendrag på norsk bokmål basert på følgende data fra ${weekLabel}:

Ferdigstilt denne uken:
${fmt(done)}

Pågående arbeid:
${fmt(active)}

Blokkerte issues:
${fmt(blocked)}

Strukturer svaret med disse overskriftene:
## Hva ble levert
## Pågående arbeid
## Hindringer
## Neste uke

Vær konkret og bruk issue-nøkler der relevant. Hold sammendraget under 400 ord.`;
}

function getISOWeek(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getWeekLabel(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset * 7);
  return `uke ${getISOWeek(d)} ${d.getFullYear()}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Digest() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const configured = isConfigured();
  const anthropicKey = getAnthropicKey();

  const daysBack = 7 + weekOffset * 7;
  const daysEnd = weekOffset * 7;
  const doneJql = daysEnd === 0
    ? `statusCategory = Done AND updated >= -${daysBack}d ORDER BY updated DESC`
    : `statusCategory = Done AND updated >= -${daysBack}d AND updated <= -${daysEnd}d ORDER BY updated DESC`;

  const { data: done = [], isLoading: l1 } = useQuery({
    queryKey: ['digest-done', weekOffset],
    queryFn: () => getIssues(undefined, doneJql),
    enabled: configured,
  });
  const { data: active = [], isLoading: l2 } = useQuery({
    queryKey: ['myIssues-digest'],
    queryFn: getMyIssues,
    enabled: configured,
  });
  const { data: allActive = [], isLoading: l3 } = useQuery({
    queryKey: ['digest-active'],
    queryFn: () => getIssues(undefined, 'statusCategory != Done ORDER BY updated DESC'),
    enabled: configured,
  });

  const blocked = allActive.filter((issue) =>
    issue.links?.some(
      (link) => link.type.inward === 'is blocked by' && link.inwardIssue?.status.category !== 'done'
    )
  );

  const loading = l1 || l2 || l3;
  const weekLabel = getWeekLabel(weekOffset);
  const sections = digest ? parseSections(digest) : [];

  const handleGenerate = async () => {
    if (!anthropicKey) {
      setError('Anthropic API-nøkkel mangler. Legg inn nøkkel under Settings.');
      return;
    }
    setGenerating(true);
    setError(null);
    setDigest(null);

    const prompt = buildPrompt(done, [...active, ...allActive.slice(0, 20)], blocked, weekLabel);
    try {
      const res = await fetch('http://localhost:3001/api/ai/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: anthropicKey, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      if (data.error) {
        setError(`Feil fra Anthropic: ${data.error.message ?? JSON.stringify(data.error)}`);
      } else {
        setDigest(data.content?.[0]?.text ?? '');
      }
    } catch (e: unknown) {
      setError(`Nettverksfeil: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!digest) return;
    navigator.clipboard.writeText(digest);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Count issue keys mentioned
  const issueKeyCount = digest ? (digest.match(ISSUE_KEY_RE) ?? []).length : 0;

  if (!configured) {
    return (
      <div className={styles.container}>
        <Card><CardContent><p>Konfigurer API-tilkobling under Settings først.</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Sparkles size={20} className={styles.toolbarIcon} />
          <span className={styles.toolbarTitle}>Ukessammendrag</span>
          <span className={styles.toolbarWeek}>{weekLabel}</span>
        </div>
        <div className={styles.toolbarRight}>
          <select
            className={styles.weekSelect}
            value={weekOffset}
            onChange={(e) => { setWeekOffset(Number(e.target.value)); setDigest(null); }}
          >
            <option value={0}>Inneværende uke</option>
            <option value={1}>Forrige uke</option>
            <option value={2}>For 2 uker siden</option>
            <option value={3}>For 3 uker siden</option>
          </select>
          {digest && (
            <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={handleCopy}>
              {copied ? 'Kopiert!' : 'Kopier'}
            </Button>
          )}
          <Button icon={<Sparkles size={16} />} onClick={handleGenerate}>
            {generating ? 'Genererer…' : 'Generer'}
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{loading ? '…' : done.length}</span>
          <span className={styles.statLabel}>Ferdigstilt ({weekLabel})</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statValue}>{loading ? '…' : active.length}</span>
          <span className={styles.statLabel}>Mine aktive</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={`${styles.statValue} ${blocked.length > 0 ? styles.statValueRed : ''}`}>
            {loading ? '…' : blocked.length}
          </span>
          <span className={styles.statLabel}>Blokkerte</span>
        </div>
        {digest && (
          <>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statValue}>{issueKeyCount}</span>
              <span className={styles.statLabel}>Issue-referanser</span>
            </div>
          </>
        )}
      </div>

      {!anthropicKey && (
        <div className={styles.warning}>
          Anthropic API-nøkkel er ikke konfigurert. Gå til Settings for å legge den inn.
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {generating && (
        <div className={styles.loadingWrap}>
          <LoadingSpinner />
          <p>Claude genererer sammendrag…</p>
        </div>
      )}

      {!digest && !generating && !error && (
        <div className={styles.emptyState}>
          <Sparkles size={48} className={styles.emptyIcon} />
          <p>Klikk «Generer» for å lage en AI-generert rapport for {weekLabel}.</p>
        </div>
      )}

      {/* Parsed sections */}
      {sections.length > 0 && (
        <div className={styles.sectionsGrid}>
          {sections.map((section) => {
            const cfg = fallbackConfig(section.heading);
            return (
              <div key={section.heading} className={`${styles.sectionCard} ${styles[`section_${cfg.color}`]}`}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionIcon}>{cfg.icon}</span>
                  <h3 className={styles.sectionHeading}>{section.heading}</h3>
                </div>
                <div className={styles.sectionBody}>
                  {renderBody(section.body)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
