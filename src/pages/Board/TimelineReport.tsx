import { useState, useEffect, useCallback, useRef } from 'react';
import { X, FileDown, Copy, Check, RefreshCw, Loader2 } from 'lucide-react';
import { getAnthropicKey } from '../../services/api';
import type { JiraIssue } from '../../types';
import styles from './TimelineReport.module.css';

interface TimelineReportProps {
  issues: JiraIssue[];
  onClose: () => void;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('nb-NO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function statusStyle(category: string): { bg: string; color: string; label?: string } {
  if (category === 'done')          return { bg: '#dcfce7', color: '#166534' };
  if (category === 'indeterminate') return { bg: '#ede9fe', color: '#5b21b6' };
  return { bg: '#f1f5f9', color: '#475569' };
}

function priorityDot(priority?: string) {
  if (!priority) return '#94a3b8';
  const map: Record<string, string> = {
    Highest: '#dc2626', High: '#ea580c',
    Medium: '#ca8a04', Low: '#2563eb', Lowest: '#64748b',
    Kritisk: '#dc2626', Høy: '#ea580c',
    Middels: '#ca8a04', Lav: '#2563eb',
  };
  return map[priority] ?? '#94a3b8';
}

function computeSummary(issues: JiraIssue[]) {
  return {
    total:      issues.length,
    done:       issues.filter((i) => i.status.category === 'done').length,
    active:     issues.filter((i) => i.status.category === 'indeterminate').length,
    open:       issues.filter((i) => i.status.category === 'new').length,
    withDates:  issues.filter((i) => i.startDate || i.dueDate).length,
    overdue:    issues.filter((i) =>
      i.dueDate && new Date(i.dueDate) < new Date() && i.status.category !== 'done'
    ).length,
  };
}

export function TimelineReport({ issues, onClose }: TimelineReportProps) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const reportDate = new Date().toLocaleDateString('nb-NO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const reportDateShort = new Date().toISOString().slice(0, 10);
  const summary = computeSummary(issues);

  const generate = useCallback(async () => {
    const apiKey = getAnthropicKey();
    if (!apiKey) {
      setError('Anthropic API-nøkkel mangler – legg den inn under Innstillinger.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:3001/api/ai/timeline-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          reportDate,
          issues: issues.map((i) => ({
            key: i.key,
            summary: i.summary,
            issueType: { name: i.issueType.name },
            status: { name: i.status.name, category: i.status.category },
            priority: i.priority ? { name: i.priority.name } : undefined,
            assignee: i.assignee ? { displayName: i.assignee.displayName } : undefined,
            startDate: i.startDate,
            dueDate: i.dueDate,
          })),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(`Feil fra Claude: ${data.error.message ?? JSON.stringify(data.error)}`);
      } else {
        setNarrative(data.content?.[0]?.text ?? '');
      }
    } catch (e) {
      setError(`Nettverksfeil: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }, [issues, reportDate]);

  useEffect(() => { generate(); }, [generate]);

  const handleExportPdf = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      // Dynamisk import for å unngå SSR-problemer
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .set({
          margin:     [10, 0, 10, 0],
          filename:   `Prosjektrapport_${reportDateShort}.pdf`,
          image:      { type: 'jpeg', quality: 0.97 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF:      { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak:  { mode: ['avoid-all', 'css'], before: '.pdf-page-break' },
        })
        .from(printRef.current)
        .save();
    } finally {
      setExporting(false);
    }
  };

  const handleCopy = () => {
    const header = `PROSJEKTSTATUSRAPPORT\n${reportDate}\n\n`;
    const tableHeader = 'Sak\tBeskrivelse\tType\tStatus\tPrioritet\tAnsvarlig\tStartdato\tFrist\n';
    const tableRows = issues.map((i) =>
      [i.key, i.summary, i.issueType.name, i.status.name,
       i.priority?.name ?? '–', i.assignee?.displayName ?? '–',
       formatDate(i.startDate), formatDate(i.dueDate)].join('\t')
    ).join('\n');
    navigator.clipboard.writeText(header + (narrative ?? '') + '\n\n' + tableHeader + tableRows)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.shell} onClick={(e) => e.stopPropagation()}>

        {/* Toolbar (skjules i PDF) */}
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Forhåndsvisning av rapport</span>
          <div className={styles.toolbarActions}>
            <button className={styles.toolbarBtn} onClick={generate} disabled={generating} title="Regenerer">
              <RefreshCw size={14} className={generating ? styles.spin : ''} />
            </button>
            <button className={styles.toolbarBtn} onClick={handleCopy} disabled={!narrative}>
              {copied ? <><Check size={14} /> Kopiert</> : <><Copy size={14} /> Kopier tekst</>}
            </button>
            <button
              className={`${styles.toolbarBtn} ${styles.toolbarBtnPrimary}`}
              onClick={handleExportPdf}
              disabled={exporting || generating}
            >
              {exporting
                ? <><Loader2 size={14} className={styles.spin} /> Eksporterer…</>
                : <><FileDown size={14} /> Eksporter PDF</>}
            </button>
            <button className={`${styles.toolbarBtn} ${styles.toolbarBtnClose}`} onClick={onClose}>
              <X size={14} /> Lukk
            </button>
          </div>
        </div>

        {/* PDF-innhold */}
        <div className={styles.scrollArea}>
          <div className={styles.pageWrapper} ref={printRef}>

            {/* ── Rapporthodet ── */}
            <div className={styles.docHeader}>
              <div className={styles.docHeaderLeft}>
                <div className={styles.docBrand}>Prosjektstatusrapport</div>
                <div className={styles.docMeta}>
                  <span>Dato: {reportDate}</span>
                  <span className={styles.docMetaDivider}>·</span>
                  <span>Saker inkludert: {summary.total}</span>
                </div>
              </div>
              <div className={styles.docHeaderRight}>
                <div className={styles.docConfidential}>Internt dokument</div>
              </div>
            </div>
            <div className={styles.docHeaderRule} />

            {/* ── Nøkkeltall ── */}
            <div className={styles.kpiRow}>
              <KpiBox value={summary.total}     label="Saker totalt"  color="#1e40af" />
              <KpiBox value={summary.done}      label="Fullført"      color="#166534" />
              <KpiBox value={summary.active}    label="Pågår"         color="#5b21b6" />
              <KpiBox value={summary.open}      label="Ikke startet"  color="#475569" />
              <KpiBox value={summary.withDates} label="Med datoer"    color="#0e7490" />
              {summary.overdue > 0 && (
                <KpiBox value={summary.overdue} label="Forfalt"       color="#dc2626" highlight />
              )}
            </div>

            {/* ── Prosjektbeskrivelse ── */}
            <Section title="1. Prosjektbeskrivelse">
              {generating && (
                <div className={styles.generating}>
                  <Loader2 size={16} className={styles.spin} />
                  Genererer innhold med Claude AI…
                </div>
              )}
              {error && <p className={styles.errorText}>{error}</p>}
              {narrative && <div className={styles.narrativeText}>{narrative}</div>}
              {!generating && !narrative && !error && (
                <p className={styles.placeholderText}>Prosjektbeskrivelse genereres automatisk.</p>
              )}
            </Section>

            {/* ── Saksoversikt ── */}
            <div className="pdf-page-break" />
            <Section title="2. Saksoversikt">
              <table className={styles.issueTable}>
                <colgroup>
                  <col style={{ width: 55 }} />
                  <col />
                  <col style={{ width: 82 }} />
                  <col style={{ width: 82 }} />
                  <col style={{ width: 62 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 76 }} />
                  <col style={{ width: 76 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Sak</th>
                    <th>Beskrivelse</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Prioritet</th>
                    <th>Ansvarlig</th>
                    <th>Startdato</th>
                    <th>Frist</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue, idx) => {
                    const st = statusStyle(issue.status.category);
                    const isOverdue = issue.dueDate
                      && new Date(issue.dueDate) < new Date()
                      && issue.status.category !== 'done';
                    return (
                      <tr key={issue.key} className={idx % 2 === 1 ? styles.rowAlt : ''}>
                        <td className={styles.keyCell}>{issue.key}</td>
                        <td className={styles.summaryCell}>{issue.summary}</td>
                        <td className={styles.typeCell}>{issue.issueType.name}</td>
                        <td>
                          <span className={styles.statusPill} style={{ background: st.bg, color: st.color }}>
                            {issue.status.name}
                          </span>
                        </td>
                        <td>
                          {issue.priority?.name ? (
                            <span className={styles.priorityCell}>
                              <span className={styles.priorityDot} style={{ background: priorityDot(issue.priority.name) }} />
                              {issue.priority.name}
                            </span>
                          ) : '–'}
                        </td>
                        <td className={styles.assigneeCell}>{issue.assignee?.displayName ?? '–'}</td>
                        <td className={styles.dateCell}>{formatDate(issue.startDate)}</td>
                        <td className={`${styles.dateCell} ${isOverdue ? styles.dateOverdue : ''}`}>
                          {formatDate(issue.dueDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>

            {/* ── Bunntekst ── */}
            <div className={styles.docFooter}>
              <span>Generert {reportDate} · Prosjektstatusrapport</span>
              <span>Konfidensiell – kun for internt bruk</span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

// ── Hjelpkomponenter ──────────────────────────────────────────────────────
function KpiBox({ value, label, color, highlight }: {
  value: number; label: string; color: string; highlight?: boolean;
}) {
  return (
    <div className={styles.kpiBox} style={highlight ? { border: `1.5px solid ${color}` } : {}}>
      <div className={styles.kpiValue} style={{ color }}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}
