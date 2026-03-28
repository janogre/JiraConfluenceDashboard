import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, ChevronDown, ChevronRight, Briefcase, Layers } from 'lucide-react';
import { getSpaces, getSpaceHomePage, getChildPages, createPage } from '../../services/confluenceService';
import type { ConfluencePage } from '../../types';
import { getAnthropicKey } from '../../services/api';
import { getProjects, createIssue, createRemoteLink } from '../../services/jiraService';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import styles from './ProjectWizard.module.css';

// ── Document type definitions ──────────────────────────────────────────────

interface DocType {
  key: string;
  name: string;
  icon: string;
  description: string;
}

const DOC_TYPES: DocType[] = [
  { key: 'mandate',      name: 'Prosjektmandat',      icon: '📋', description: 'Formell godkjenning, mandat og rammer for prosjektet' },
  { key: 'needs',        name: 'Behovsanalyse',        icon: '🔍', description: 'Analyse av behov, problemer og krav som prosjektet løser' },
  { key: 'decision',     name: 'Beslutningsgrunnlag',  icon: '⚖️', description: 'Grunnlag for beslutning inkl. alternativer og anbefaling' },
  { key: 'risk',         name: 'Risikoanalyse',        icon: '⚠️', description: 'Identifisering og vurdering av prosjektrisiko' },
  { key: 'stakeholders', name: 'Interessentanalyse',   icon: '👥', description: 'Kartlegging av interessenter, roller og påvirkningskraft' },
  { key: 'status',       name: 'Statusrapport-mal',    icon: '📊', description: 'Gjenbrukbar mal for løpende statusrapportering' },
];

// ── markdown → Confluence storage format ───────────────────────────────────

function markdownToStorageFormat(markdown: string): string {
  const withTables = markdown.replace(
    /^(\|.+\|\n)((?:\|[-: ]+)+\|\n)((?:\|.+\|\n?)*)/gm,
    (_, headerRow, _sep, bodyRows) => {
      const parseRow = (row: string) =>
        row.split('|').slice(1, -1).map((cell) => cell.trim());
      const headers = parseRow(headerRow);
      const rows = bodyRows.trim().split('\n').filter(Boolean).map(parseRow);
      const thCells = headers.map((h) => `<th><p><strong>${h}</strong></p></th>`).join('');
      const trRows = rows
        .map((cells) => `<tr>${cells.map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`)
        .join('');
      return `<table><tbody><tr>${thCells}</tr>${trRows}</tbody></table>\n`;
    }
  );

  return withTables
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[huptl])(.+)$/gm, (line) =>
      line.trim() && !line.startsWith('<') ? `<p>${line}</p>` : line
    )
    .replace(/<\/p><p>/g, '</p>\n<p>');
}

// ── Types ──────────────────────────────────────────────────────────────────

type WizardType = '' | 'type1' | 'type2';

interface TaskInfo {
  name: string;
  owner: string;
  description: string;
  jiraProjectKey: string;
  dueDate: string;
}

interface ProjectInfo {
  name: string;
  owner: string;
  description: string;
  jiraProjectKey: string;
  spaceKey: string;
  parentId: string;
  parentTitle: string;
}

interface AdditionalInfo {
  purpose: string;
  goals: string;
  deadline: string;
  duration: string;
  budget: string;
  stakeholders: string;
  risks: string;
}

interface GeneratedDoc {
  type: string;
  title: string;
  markdown: string;
}

interface PublishedPage {
  title: string;
  url: string;
}

interface SubtaskItem {
  id: string;
  title: string;
}

// ── Step label sets ────────────────────────────────────────────────────────

const STEP_LABELS_TYPE1 = ['Velg type', 'Oppgaveinfo', 'Underoppgaver', 'Opprett i Jira'];
const STEP_LABELS_TYPE2 = ['Velg type', 'Prosjektinfo', 'Dokumenter', 'Tilleggsinfo', 'Jira-oppgaver', 'Generer & publiser'];

function getStepLabels(type: WizardType): string[] {
  if (type === 'type1') return STEP_LABELS_TYPE1;
  if (type === 'type2') return STEP_LABELS_TYPE2;
  return ['Velg type'];
}

// ── Stepper ────────────────────────────────────────────────────────────────

function Stepper({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className={styles.stepper}>
      {labels.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < current;
        const isActive = stepNum === current;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={styles.stepItem}>
              <div
                className={[
                  styles.stepCircle,
                  isActive ? styles.stepCircleActive : '',
                  isDone ? styles.stepCircleDone : '',
                ].join(' ')}
              >
                {isDone ? <CheckCircle size={16} /> : stepNum}
              </div>
              <span className={[styles.stepLabel, isActive ? styles.stepLabelActive : ''].join(' ')}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div
                className={[styles.stepConnector, isDone ? styles.stepConnectorDone : ''].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Accordion item ─────────────────────────────────────────────────────────

function AccordionItem({ doc, onChange }: { doc: GeneratedDoc; onChange: (markdown: string) => void }) {
  const [open, setOpen] = useState(true);
  const docType = DOC_TYPES.find((d) => d.key === doc.type);

  return (
    <div className={styles.accordionItem}>
      <div className={styles.accordionHeader} onClick={() => setOpen((v) => !v)}>
        <span>{docType?.icon ?? '📄'}</span>
        <span className={styles.accordionTitle}>{doc.title}</span>
        <ChevronDown
          size={16}
          className={[styles.accordionChevron, open ? styles.accordionChevronOpen : ''].join(' ')}
        />
      </div>
      {open && (
        <div className={styles.accordionBody}>
          <textarea
            className={styles.previewTextarea}
            value={doc.markdown}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

// ── Page tree picker ───────────────────────────────────────────────────────

function TreeNode({ page, selectedId, onSelect }: {
  page: ConfluencePage;
  selectedId: string;
  onSelect: (id: string, title: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: children, isFetching } = useQuery({
    queryKey: ['wizardChildren', page.id],
    queryFn: () => getChildPages(page.id),
    enabled: expanded,
  });
  const canExpand = page.hasChildren !== false;
  const isSelected = page.id === selectedId;

  return (
    <div className={styles.treeNode}>
      <div
        className={[styles.treeNodeRow, isSelected ? styles.treeNodeRowSelected : ''].join(' ')}
        onClick={() => onSelect(page.id, page.title)}
      >
        <button
          className={styles.treeToggle}
          style={{ visibility: canExpand ? 'visible' : 'hidden' }}
          onClick={(e) => { e.stopPropagation(); canExpand && setExpanded((v) => !v); }}
          aria-label={expanded ? 'Skjul undersider' : 'Vis undersider'}
        >
          {isFetching ? (
            <span className={styles.treeSpinner}>⟳</span>
          ) : expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
        <span className={styles.treePageLabel}>{page.title}</span>
      </div>
      {expanded && children && children.length > 0 && (
        <div className={styles.treeChildren}>
          {children.map((child) => (
            <TreeNode key={child.id} page={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function PageTreePicker({ spaceKey, selectedId, selectedTitle, onSelect, onClear }: {
  spaceKey: string;
  selectedId: string;
  selectedTitle: string;
  onSelect: (id: string, title: string) => void;
  onClear: () => void;
}) {
  const { data: homePage, isLoading, isError } = useQuery({
    queryKey: ['wizardHomePage', spaceKey],
    queryFn: () => getSpaceHomePage(spaceKey),
    enabled: !!spaceKey,
  });

  return (
    <div className={styles.treePicker}>
      <div className={styles.treePickerSelected}>
        {selectedId ? (
          <>
            <span className={styles.treePickerSelectedLabel}>Valgt: <strong>{selectedTitle}</strong></span>
            <button className={styles.treePickerClear} onClick={onClear} title="Fjern valg">✕</button>
          </>
        ) : (
          <span className={styles.treePickerPlaceholder}>Ingen overordnet side (root i space)</span>
        )}
      </div>
      <div className={styles.treePickerScroll}>
        {isLoading && <p className={styles.statusMsg}>Laster sidetreet…</p>}
        {isError && <p className={styles.statusMsg}>Kunne ikke laste sider.</p>}
        {homePage && (
          <TreeNode page={homePage} selectedId={selectedId} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ProjectWizard() {
  const [step, setStep] = useState(1);
  const [wizardType, setWizardType] = useState<WizardType>('');

  // ── Type 1 state ──
  const [taskInfo, setTaskInfo] = useState<TaskInfo>({
    name: '', owner: '', description: '', jiraProjectKey: '', dueDate: '',
  });
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [suggestingSubtasks, setSuggestingSubtasks] = useState(false);
  const [subtaskError, setSubtaskError] = useState('');
  const [creatingJira, setCreatingJira] = useState(false);
  const [jiraCreateError, setJiraCreateError] = useState('');
  const [createdIssues, setCreatedIssues] = useState<PublishedPage[]>([]);

  // ── Type 2 state ──
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    name: '', owner: '', description: '', jiraProjectKey: '', spaceKey: '', parentId: '', parentTitle: '',
  });
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState<AdditionalInfo>({
    purpose: '', goals: '', deadline: '', duration: '', budget: '', stakeholders: '', risks: '',
  });
  const [jiraTasks, setJiraTasks] = useState<SubtaskItem[]>([]);
  const [suggestingTasks, setSuggestingTasks] = useState(false);
  const [taskSuggestError, setTaskSuggestError] = useState('');

  // Step 6 (generate/publish) state
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishedPages, setPublishedPages] = useState<PublishedPage[]>([]);
  const [operationStatus, setOperationStatus] = useState('');

  // ── Data queries ──
  const { data: spaces = [], isLoading: spacesLoading } = useQuery({
    queryKey: ['spaces'],
    queryFn: getSpaces,
  });

  const { data: jiraProjects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['jiraProjects'],
    queryFn: getProjects,
  });

  useEffect(() => {
    setProjectInfo((prev) => ({ ...prev, parentId: '', parentTitle: '' }));
  }, [projectInfo.spaceKey]);

  // ── Helpers ──

  function updateTaskInfo(key: keyof TaskInfo, value: string) {
    setTaskInfo((prev) => ({ ...prev, [key]: value }));
  }

  function updateProjectInfo(key: keyof ProjectInfo, value: string) {
    setProjectInfo((prev) => ({ ...prev, [key]: value }));
  }

  function updateAdditionalInfo(key: keyof AdditionalInfo, value: string) {
    setAdditionalInfo((prev) => ({ ...prev, [key]: value }));
  }

  function toggleDoc(key: string) {
    setSelectedDocs((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  // ── Subtask editing (Type 1) ──

  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: `st-${Date.now()}`, title: '' }]);
  }

  function removeSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSubtask(id: string, title: string) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  // ── Jira task editing (Type 2) ──

  function addJiraTask() {
    setJiraTasks((prev) => [...prev, { id: `jt-${Date.now()}`, title: '' }]);
  }

  function removeJiraTask(id: string) {
    setJiraTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function updateJiraTask(id: string, title: string) {
    setJiraTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }

  // ── AI: suggest subtasks ──

  async function handleSuggestSubtasks(forType: 'type1' | 'type2') {
    const apiKey = getAnthropicKey();
    if (!apiKey) {
      const msg = 'Mangler Anthropic API-nøkkel. Legg den til under Innstillinger.';
      if (forType === 'type1') setSubtaskError(msg);
      else setTaskSuggestError(msg);
      return;
    }

    const body =
      forType === 'type1'
        ? {
            apiKey,
            projectType: 'type1',
            projectInfo: { name: taskInfo.name, description: taskInfo.description },
          }
        : {
            apiKey,
            projectType: 'type2',
            projectInfo: { name: projectInfo.name, description: projectInfo.description },
            additionalInfo: {
              purpose: additionalInfo.purpose,
              goals: additionalInfo.goals,
              stakeholders: additionalInfo.stakeholders,
            },
          };

    if (forType === 'type1') {
      setSuggestingSubtasks(true);
      setSubtaskError('');
    } else {
      setSuggestingTasks(true);
      setTaskSuggestError('');
    }

    try {
      const response = await fetch('http://localhost:3001/api/ai/suggest-subtasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI-feil');

      const items = (data.subtasks as { title: string }[]).map((s, i) => ({
        id: `${forType === 'type1' ? 'st' : 'jt'}-${Date.now()}-${i}`,
        title: s.title,
      }));

      if (forType === 'type1') setSubtasks(items);
      else setJiraTasks(items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ukjent feil';
      if (forType === 'type1') setSubtaskError(msg);
      else setTaskSuggestError(msg);
    } finally {
      if (forType === 'type1') setSuggestingSubtasks(false);
      else setSuggestingTasks(false);
    }
  }

  // ── Type 1: create in Jira ──

  async function handleCreateType1Jira() {
    setCreatingJira(true);
    setJiraCreateError('');
    setCreatedIssues([]);
    const results: PublishedPage[] = [];

    try {
      setOperationStatus(`Oppretter oppgave «${taskInfo.name}»…`);
      const mainIssue = await createIssue(
        taskInfo.jiraProjectKey,
        taskInfo.name,
        'Oppgave',
        {
          description: taskInfo.description || undefined,
          dueDate: taskInfo.dueDate || undefined,
        }
      );
      results.push({ title: `${mainIssue.key} – ${taskInfo.name}`, url: mainIssue.url });

      for (const st of subtasks.filter((s) => s.title.trim())) {
        setOperationStatus(`Oppretter underoppgave «${st.title}»…`);
        const sub = await createIssue(
          taskInfo.jiraProjectKey,
          st.title,
          'Underoppgave',
          { parentKey: mainIssue.key }
        );
        results.push({ title: `${sub.key} – ${st.title}`, url: sub.url });
      }

      setCreatedIssues(results);
    } catch (err) {
      setJiraCreateError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setCreatingJira(false);
      setOperationStatus('');
    }
  }

  // ── Type 2: generate docs ──

  async function handleGenerate() {
    const apiKey = getAnthropicKey();
    if (!apiKey) {
      setGenerateError('Mangler Anthropic API-nøkkel. Legg den til under Innstillinger.');
      return;
    }

    setGenerating(true);
    setGenerateError('');
    setGeneratedDocs([]);

    try {
      const response = await fetch('http://localhost:3001/api/ai/project-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          documents: selectedDocs,
          projectInfo: {
            name: projectInfo.name,
            owner: projectInfo.owner,
            description: projectInfo.description,
          },
          additionalInfo,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Generering feilet');
      setGeneratedDocs(data.results);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setGenerating(false);
    }
  }

  function updateDocMarkdown(type: string, markdown: string) {
    setGeneratedDocs((prev) => prev.map((d) => (d.type === type ? { ...d, markdown } : d)));
  }

  // ── Type 2: publish all ──

  async function handlePublish() {
    setPublishing(true);
    setPublishError('');
    setPublishedPages([]);
    const created: PublishedPage[] = [];

    try {
      // 1. Confluence folder
      setOperationStatus(`Oppretter prosjektmappe «${projectInfo.name}»…`);
      const folderBody = `<p>Prosjektdokumentasjon for <strong>${projectInfo.name}</strong>.</p>`;
      const folderPage = await createPage(
        projectInfo.spaceKey,
        projectInfo.name,
        folderBody,
        projectInfo.parentId || undefined
      );

      // 2. Confluence docs
      for (const doc of generatedDocs) {
        setOperationStatus(`Publiserer «${doc.title}»…`);
        const body = markdownToStorageFormat(doc.markdown);
        const page = await createPage(projectInfo.spaceKey, doc.title, body, folderPage.id);
        created.push({ title: page.title, url: page.url });
      }

      // 3. Jira Epic
      setOperationStatus('Oppretter Oppgavesamling i Jira…');
      const epicIssue = await createIssue(
        projectInfo.jiraProjectKey,
        projectInfo.name,
        'Oppgavesamling',
        { description: projectInfo.description || undefined }
      );

      // 4. Jira tasks
      for (const task of jiraTasks.filter((t) => t.title.trim())) {
        setOperationStatus(`Oppretter Jira-oppgave «${task.title}»…`);
        await createIssue(projectInfo.jiraProjectKey, task.title, 'Oppgave', {
          parentKey: epicIssue.key,
        });
      }

      // 5. Remote link
      setOperationStatus('Lenker Jira til Confluence…');
      await createRemoteLink(epicIssue.key, folderPage.url, projectInfo.name);

      created.unshift({ title: `Jira: ${epicIssue.key} – ${projectInfo.name}`, url: epicIssue.url });
      setPublishedPages(created);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publisering feilet');
    } finally {
      setPublishing(false);
      setOperationStatus('');
    }
  }

  // ── Navigation ──

  function canGoNext(): boolean {
    if (step === 1) return !!wizardType;
    if (wizardType === 'type1') {
      if (step === 2) return !!(taskInfo.name.trim() && taskInfo.jiraProjectKey);
      return true;
    }
    if (wizardType === 'type2') {
      if (step === 2) return !!(projectInfo.name.trim() && projectInfo.jiraProjectKey && projectInfo.spaceKey);
      if (step === 3) return selectedDocs.length > 0;
      return true;
    }
    return false;
  }

  const lastStep = wizardType === 'type1' ? 4 : wizardType === 'type2' ? 6 : 0;
  const isLastStep = step === lastStep && wizardType !== '';
  const busy = generating || publishing || creatingJira;

  // ── Step renderers ──

  function renderStep0() {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Hva vil du opprette?</h2>
        <p className={styles.hint} style={{ marginBottom: '1.25rem' }}>
          Velg type for å tilpasse flyten.
        </p>
        <div className={styles.typeGrid}>
          <div
            className={[styles.typeCard, wizardType === 'type1' ? styles.typeCardSelected : ''].join(' ')}
            onClick={() => setWizardType('type1')}
          >
            <div className={styles.typeCardIcon}><Briefcase size={32} /></div>
            <div>
              <p className={styles.typeCardTitle}>Enkel oppgave</p>
              <p className={styles.typeCardDesc}>
                Varighet under 1 uke. Oppretter en Oppgave i Jira med valgfrie Underoppgaver.
              </p>
            </div>
          </div>
          <div
            className={[styles.typeCard, wizardType === 'type2' ? styles.typeCardSelected : ''].join(' ')}
            onClick={() => setWizardType('type2')}
          >
            <div className={styles.typeCardIcon}><Layers size={32} /></div>
            <div>
              <p className={styles.typeCardTitle}>Større prosjekt</p>
              <p className={styles.typeCardDesc}>
                Varighet over 1 uke. Oppretter Oppgavesamling i Jira og prosjektdokumenter i Confluence.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderType1Step2() {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Oppgaveinformasjon</h2>

        <div className={styles.field}>
          <label className={styles.label}>Oppgavenavn *</label>
          <input
            className={styles.input}
            value={taskInfo.name}
            onChange={(e) => updateTaskInfo('name', e.target.value)}
            placeholder="f.eks. Oppdater kundeportal-onboarding"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Ansvarlig</label>
          <input
            className={styles.input}
            value={taskInfo.owner}
            onChange={(e) => updateTaskInfo('owner', e.target.value)}
            placeholder="f.eks. Ola Nordmann"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Beskrivelse</label>
          <textarea
            className={styles.textarea}
            value={taskInfo.description}
            onChange={(e) => updateTaskInfo('description', e.target.value)}
            placeholder="Beskriv oppgaven kort..."
            rows={3}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>Jira-prosjekt *</label>
            {projectsLoading ? (
              <p className={styles.statusMsg}>Laster prosjekter…</p>
            ) : (
              <select
                className={styles.select}
                value={taskInfo.jiraProjectKey}
                onChange={(e) => updateTaskInfo('jiraProjectKey', e.target.value)}
              >
                <option value="">— Velg prosjekt —</option>
                {jiraProjects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Frist</label>
            <input
              className={styles.input}
              type="date"
              value={taskInfo.dueDate}
              onChange={(e) => updateTaskInfo('dueDate', e.target.value)}
            />
          </div>
        </div>
      </div>
    );
  }

  function renderType1Step3() {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Underoppgaver</h2>
        <p className={styles.hint} style={{ marginBottom: '1rem' }}>
          Valgfritt. Legg til underoppgaver manuelt eller bruk AI-forslag.
        </p>

        {subtaskError && <div className={styles.errorMsg}>{subtaskError}</div>}

        <div style={{ marginBottom: '1rem' }}>
          <Button
            variant="secondary"
            onClick={() => handleSuggestSubtasks('type1')}
            disabled={suggestingSubtasks}
          >
            {suggestingSubtasks ? <><LoadingSpinner size="small" /> Foreslår…</> : '✨ AI-forslag'}
          </Button>
        </div>

        {subtasks.length > 0 && (
          <div className={styles.subtaskList}>
            {subtasks.map((st) => (
              <div key={st.id} className={styles.subtaskRow}>
                <input
                  className={styles.input}
                  value={st.title}
                  onChange={(e) => updateSubtask(st.id, e.target.value)}
                  placeholder="Underoppgavetittel…"
                />
                <button
                  className={styles.subtaskDeleteBtn}
                  onClick={() => removeSubtask(st.id)}
                  aria-label="Slett"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button className={styles.addSubtaskBtn} onClick={addSubtask}>
          + Legg til underoppgave
        </button>
      </div>
    );
  }

  function renderType1Step4() {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Opprett i Jira</h2>

        {jiraCreateError && <div className={styles.errorMsg}>{jiraCreateError}</div>}

        {createdIssues.length === 0 && !creatingJira && (
          <p className={styles.statusMsg}>
            Klikk «Opprett i Jira» for å opprette{' '}
            <strong>{taskInfo.name}</strong>
            {subtasks.filter((s) => s.title.trim()).length > 0
              ? ` med ${subtasks.filter((s) => s.title.trim()).length} underoppgave(r)`
              : ''}
            .
          </p>
        )}

        {creatingJira && (
          <div className={styles.statusMsg}>
            <LoadingSpinner size="small" />
            <p>{operationStatus}</p>
          </div>
        )}

        {createdIssues.length > 0 && (
          <div className={styles.successBox}>
            <p className={styles.successTitle}>✓ Opprettet i Jira</p>
            <ul className={styles.successLinks}>
              {createdIssues.map((issue) => (
                <li key={issue.url}>
                  <a href={issue.url} target="_blank" rel="noopener noreferrer">
                    {issue.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  function renderType2Step2() {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Prosjektinformasjon</h2>

        <div className={styles.field}>
          <label className={styles.label}>Prosjektnavn *</label>
          <input
            className={styles.input}
            value={projectInfo.name}
            onChange={(e) => updateProjectInfo('name', e.target.value)}
            placeholder="f.eks. Digitalt kundeportal-prosjekt"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Prosjektansvarlig</label>
          <input
            className={styles.input}
            value={projectInfo.owner}
            onChange={(e) => updateProjectInfo('owner', e.target.value)}
            placeholder="f.eks. Ola Nordmann"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Kort beskrivelse</label>
          <textarea
            className={styles.textarea}
            value={projectInfo.description}
            onChange={(e) => updateProjectInfo('description', e.target.value)}
            placeholder="Beskriv prosjektet kort..."
            rows={3}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>Jira-prosjekt *</label>
            {projectsLoading ? (
              <p className={styles.statusMsg}>Laster prosjekter…</p>
            ) : (
              <select
                className={styles.select}
                value={projectInfo.jiraProjectKey}
                onChange={(e) => updateProjectInfo('jiraProjectKey', e.target.value)}
              >
                <option value="">— Velg Jira-prosjekt —</option>
                {jiraProjects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Confluence-space *</label>
            {spacesLoading ? (
              <p className={styles.statusMsg}>Laster spaces…</p>
            ) : (
              <select
                className={styles.select}
                value={projectInfo.spaceKey}
                onChange={(e) => updateProjectInfo('spaceKey', e.target.value)}
              >
                <option value="">— Velg space —</option>
                {spaces
                  .filter((s) => !s.key.startsWith('~'))
                  .map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name} ({s.key})
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>

        {projectInfo.spaceKey && (
          <div className={styles.field}>
            <label className={styles.label}>Overordnet Confluence-side (valgfri)</label>
            <PageTreePicker
              spaceKey={projectInfo.spaceKey}
              selectedId={projectInfo.parentId}
              selectedTitle={projectInfo.parentTitle}
              onSelect={(id, title) =>
                setProjectInfo((prev) => ({ ...prev, parentId: id, parentTitle: title }))
              }
              onClear={() =>
                setProjectInfo((prev) => ({ ...prev, parentId: '', parentTitle: '' }))
              }
            />
          </div>
        )}
      </div>
    );
  }

  function renderType2Step3() {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Velg dokumenttyper</h2>
        <p className={styles.hint} style={{ marginBottom: '1rem' }}>
          Velg minst ett dokument. AI genererer innholdet basert på prosjektinformasjonen din.
        </p>
        <div className={styles.docGrid}>
          {DOC_TYPES.map((dt) => {
            const selected = selectedDocs.includes(dt.key);
            return (
              <div
                key={dt.key}
                className={[styles.docCard, selected ? styles.docCardSelected : ''].join(' ')}
                onClick={() => toggleDoc(dt.key)}
              >
                <span className={styles.docCardIcon}>{dt.icon}</span>
                <div className={styles.docCardContent}>
                  <p className={styles.docCardName}>{dt.name}</p>
                  <p className={styles.docCardDesc}>{dt.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderType2Step4() {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Tilleggsinformasjon</h2>
        <p className={styles.hint} style={{ marginBottom: '1rem' }}>
          Felter her brukes av AI til å generere alle valgte dokumenter.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Formål / problem som løses</label>
          <textarea
            className={styles.textarea}
            value={additionalInfo.purpose}
            onChange={(e) => updateAdditionalInfo('purpose', e.target.value)}
            placeholder="Hva er bakgrunnen for prosjektet? Hvilket problem løser vi?"
            rows={3}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Ønsket resultat / mål</label>
          <textarea
            className={styles.textarea}
            value={additionalInfo.goals}
            onChange={(e) => updateAdditionalInfo('goals', e.target.value)}
            placeholder="Hva ønsker vi å oppnå? Konkrete leveranser?"
            rows={3}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>Frist (dato)</label>
            <input
              className={styles.input}
              type="date"
              value={additionalInfo.deadline}
              onChange={(e) => updateAdditionalInfo('deadline', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Estimert varighet</label>
            <input
              className={styles.input}
              value={additionalInfo.duration}
              onChange={(e) => updateAdditionalInfo('duration', e.target.value)}
              placeholder="f.eks. 6 måneder"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Budsjettramme (valgfri)</label>
          <input
            className={styles.input}
            value={additionalInfo.budget}
            onChange={(e) => updateAdditionalInfo('budget', e.target.value)}
            placeholder="f.eks. 500 000 NOK"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Viktige interessenter</label>
          <input
            className={styles.input}
            value={additionalInfo.stakeholders}
            onChange={(e) => updateAdditionalInfo('stakeholders', e.target.value)}
            placeholder="Kommaseparert: IT-sjef, Økonomiavdeling, Kunder"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Kjente risikoer (valgfri)</label>
          <textarea
            className={styles.textarea}
            value={additionalInfo.risks}
            onChange={(e) => updateAdditionalInfo('risks', e.target.value)}
            placeholder="Beskriv eventuelle kjente risikoer..."
            rows={3}
          />
        </div>
      </div>
    );
  }

  function renderType2Step5() {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Jira-oppgaver</h2>
        <p className={styles.hint} style={{ marginBottom: '1rem' }}>
          Valgfritt. Disse opprettes som Oppgaver under Oppgavesamlingen i Jira.
        </p>

        {taskSuggestError && <div className={styles.errorMsg}>{taskSuggestError}</div>}

        <div style={{ marginBottom: '1rem' }}>
          <Button
            variant="secondary"
            onClick={() => handleSuggestSubtasks('type2')}
            disabled={suggestingTasks}
          >
            {suggestingTasks ? <><LoadingSpinner size="small" /> Foreslår…</> : '✨ AI-forslag'}
          </Button>
        </div>

        {jiraTasks.length > 0 && (
          <div className={styles.subtaskList}>
            {jiraTasks.map((task) => (
              <div key={task.id} className={styles.subtaskRow}>
                <input
                  className={styles.input}
                  value={task.title}
                  onChange={(e) => updateJiraTask(task.id, e.target.value)}
                  placeholder="Oppgavetittel…"
                />
                <button
                  className={styles.subtaskDeleteBtn}
                  onClick={() => removeJiraTask(task.id)}
                  aria-label="Slett"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button className={styles.addSubtaskBtn} onClick={addJiraTask}>
          + Legg til oppgave
        </button>
      </div>
    );
  }

  function renderType2Step6() {
    const hasGenerated = generatedDocs.length > 0;
    const hasPublished = publishedPages.length > 0;

    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Generer og publiser</h2>

        {generateError && <div className={styles.errorMsg}>{generateError}</div>}
        {publishError && <div className={styles.errorMsg}>{publishError}</div>}

        {!hasGenerated && !generating && (
          <p className={styles.statusMsg}>
            Klikk «Generer dokumenter» for å lage innhold for{' '}
            <strong>{selectedDocs.length}</strong> dokument
            {selectedDocs.length !== 1 ? 'er' : ''} med AI.
          </p>
        )}

        {generating && (
          <div className={styles.statusMsg}>
            <LoadingSpinner size="small" />
            <p>Genererer innhold…</p>
          </div>
        )}

        {hasGenerated && (
          <div className={styles.generateList}>
            {generatedDocs.map((doc) => (
              <AccordionItem
                key={doc.type}
                doc={doc}
                onChange={(md) => updateDocMarkdown(doc.type, md)}
              />
            ))}
          </div>
        )}

        {hasPublished && (
          <div className={styles.successBox}>
            <p className={styles.successTitle}>✓ Alt publisert</p>
            <ul className={styles.successLinks}>
              {publishedPages.map((p) => (
                <li key={p.url}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {p.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {publishing && (
          <p className={styles.publishingStatus}>{operationStatus}</p>
        )}
      </div>
    );
  }

  // ── Actions bar ──

  function renderActions() {
    return (
      <div className={styles.actions}>
        <div>
          {step > 1 && (
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              ← Tilbake
            </Button>
          )}
        </div>
        <div className={styles.actionsRight}>
          {isLastStep && wizardType === 'type1' && createdIssues.length === 0 && (
            <Button onClick={handleCreateType1Jira} disabled={creatingJira}>
              {creatingJira ? 'Oppretter…' : 'Opprett i Jira'}
            </Button>
          )}
          {isLastStep && wizardType === 'type2' && generatedDocs.length === 0 && (
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? 'Genererer…' : 'Generer dokumenter'}
            </Button>
          )}
          {isLastStep && wizardType === 'type2' && generatedDocs.length > 0 && !publishedPages.length && (
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publiserer…' : 'Publiser alt'}
            </Button>
          )}
          {!isLastStep && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canGoNext()}>
              Neste →
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Render ──

  const stepLabels = getStepLabels(wizardType);

  return (
    <div className={styles.wizard}>
      <Stepper current={step} labels={stepLabels} />

      {step === 1 && renderStep0()}

      {wizardType === 'type1' && step === 2 && renderType1Step2()}
      {wizardType === 'type1' && step === 3 && renderType1Step3()}
      {wizardType === 'type1' && step === 4 && renderType1Step4()}

      {wizardType === 'type2' && step === 2 && renderType2Step2()}
      {wizardType === 'type2' && step === 3 && renderType2Step3()}
      {wizardType === 'type2' && step === 4 && renderType2Step4()}
      {wizardType === 'type2' && step === 5 && renderType2Step5()}
      {wizardType === 'type2' && step === 6 && renderType2Step6()}

      {renderActions()}
    </div>
  );
}
