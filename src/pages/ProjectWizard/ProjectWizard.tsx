import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { getSpaces, getSpaceHomePage, getChildPages, createPage } from '../../services/confluenceService';
import type { ConfluencePage } from '../../types';
import { getAnthropicKey } from '../../services/api';
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
  return markdown
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hup])(.+)$/gm, (line) =>
      line.trim() && !line.startsWith('<') ? `<p>${line}</p>` : line
    )
    .replace(/<\/p><p>/g, '</p>\n<p>');
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ProjectInfo {
  name: string;
  owner: string;
  description: string;
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

// ── Stepper ────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Prosjektinfo', 'Dokumenter', 'Tilleggsinfo', 'Generer & publiser'];

function Stepper({ current }: { current: number }) {
  return (
    <div className={styles.stepper}>
      {STEP_LABELS.map((label, i) => {
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
            {i < STEP_LABELS.length - 1 && (
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

function AccordionItem({
  doc,
  onChange,
}: {
  doc: GeneratedDoc;
  onChange: (markdown: string) => void;
}) {
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

interface TreeNodeProps {
  page: ConfluencePage;
  selectedId: string;
  onSelect: (id: string, title: string) => void;
}

function TreeNode({ page, selectedId, onSelect }: TreeNodeProps) {
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

interface PageTreePickerProps {
  spaceKey: string;
  selectedId: string;
  selectedTitle: string;
  onSelect: (id: string, title: string) => void;
  onClear: () => void;
}

function PageTreePicker({ spaceKey, selectedId, selectedTitle, onSelect, onClear }: PageTreePickerProps) {
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
          <TreeNode
            page={homePage}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ProjectWizard() {
  const [step, setStep] = useState(1);

  // Step 1 state
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    name: '',
    owner: '',
    description: '',
    spaceKey: '',
    parentId: '',
    parentTitle: '',
  });

  // Step 2 state
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  // Step 3 state
  const [additionalInfo, setAdditionalInfo] = useState<AdditionalInfo>({
    purpose: '',
    goals: '',
    deadline: '',
    duration: '',
    budget: '',
    stakeholders: '',
    risks: '',
  });

  // Step 4 state
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishedPages, setPublishedPages] = useState<PublishedPage[]>([]);
  const [publishingStatus, setPublishingStatus] = useState('');

  // Confluence data
  const { data: spaces = [], isLoading: spacesLoading } = useQuery({
    queryKey: ['spaces'],
    queryFn: getSpaces,
  });

  // Reset parent when space changes
  useEffect(() => {
    setProjectInfo((prev) => ({ ...prev, parentId: '', parentTitle: '' }));
  }, [projectInfo.spaceKey]);

  // ── Step 1 helpers ──

  function updateProjectInfo(key: keyof ProjectInfo, value: string) {
    setProjectInfo((prev) => ({ ...prev, [key]: value }));
  }

  const step1Valid = projectInfo.name.trim() && projectInfo.spaceKey;

  // ── Step 2 helpers ──

  function toggleDoc(key: string) {
    setSelectedDocs((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  // ── Step 3 helpers ──

  function updateAdditionalInfo(key: keyof AdditionalInfo, value: string) {
    setAdditionalInfo((prev) => ({ ...prev, [key]: value }));
  }

  // ── Step 4: generate ──

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

      if (!response.ok) {
        throw new Error(data.error || 'Generering feilet');
      }

      setGeneratedDocs(data.results);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setGenerating(false);
    }
  }

  function updateDocMarkdown(type: string, markdown: string) {
    setGeneratedDocs((prev) =>
      prev.map((d) => (d.type === type ? { ...d, markdown } : d))
    );
  }

  // ── Step 4: publish ──

  async function handlePublish() {
    setPublishing(true);
    setPublishError('');
    setPublishedPages([]);

    const created: PublishedPage[] = [];

    try {
      for (const doc of generatedDocs) {
        setPublishingStatus(`Publiserer «${doc.title}»…`);
        const body = markdownToStorageFormat(doc.markdown);
        const page = await createPage(
          projectInfo.spaceKey,
          doc.title,
          body,
          projectInfo.parentId || undefined
        );
        created.push({ title: page.title, url: page.url });
      }
      setPublishedPages(created);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publisering feilet');
    } finally {
      setPublishing(false);
      setPublishingStatus('');
    }
  }

  // ── Render steps ──

  function renderStep1() {
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

        {projectInfo.spaceKey && (
          <div className={styles.field}>
            <label className={styles.label}>Overordnet side (valgfri)</label>
            <PageTreePicker
              spaceKey={projectInfo.spaceKey}
              selectedId={projectInfo.parentId}
              selectedTitle={projectInfo.parentTitle}
              onSelect={(id, title) => setProjectInfo((prev) => ({ ...prev, parentId: id, parentTitle: title }))}
              onClear={() => setProjectInfo((prev) => ({ ...prev, parentId: '', parentTitle: '' }))}
            />
          </div>
        )}
      </div>
    );
  }

  function renderStep2() {
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

  function renderStep3() {
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

  function renderStep4() {
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
            <p className={styles.successTitle}>✓ Dokumenter publisert til Confluence</p>
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
          <p className={styles.publishingStatus}>{publishingStatus}</p>
        )}
      </div>
    );
  }

  // ── Navigation ──

  function canGoNext() {
    if (step === 1) return !!step1Valid;
    if (step === 2) return selectedDocs.length > 0;
    return true;
  }

  function renderActions() {
    const isLastStep = step === 4;

    return (
      <div className={styles.actions}>
        <div>
          {step > 1 && (
            <Button
              variant="secondary"
              onClick={() => setStep((s) => s - 1)}
              disabled={generating || publishing}
            >
              ← Tilbake
            </Button>
          )}
        </div>
        <div className={styles.actionsRight}>
          {isLastStep ? (
            <>
              {generatedDocs.length === 0 ? (
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? 'Genererer…' : 'Generer dokumenter'}
                </Button>
              ) : (
                !publishedPages.length && (
                  <Button onClick={handlePublish} disabled={publishing}>
                    {publishing ? 'Publiserer…' : 'Publiser til Confluence'}
                  </Button>
                )
              )}
            </>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canGoNext()}>
              Neste →
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wizard}>
      <Stepper current={step} />

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}

      {renderActions()}
    </div>
  );
}
