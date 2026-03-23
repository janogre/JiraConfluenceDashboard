import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  FileText,
  Users,
  Wand2,
  Send,
  RotateCcw,
  ExternalLink,
  Loader2,
  ChevronRight,
  Check,
  AlertCircle,
  Layout,
  X,
  Plus,
} from 'lucide-react';
import { getChildPages, findPageByTitle, createPage, searchUsers } from '../../services/confluenceService';
import type { ConfluenceUserResult } from '../../services/confluenceService';
import { getAnthropicKey } from '../../services/api';
import type { ConfluenceSpace, ConfluencePage } from '../../types';
import styles from './Confluence.module.css';

interface MeetingNoteEditorProps {
  space: ConfluenceSpace;
}

type WizardStep = 'setup' | 'write' | 'review';

interface BuiltInTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: 'standard',
    name: 'Standard møtenotat',
    description: 'Generell mal med alle seksjoner',
    content: `Møtets formål:

Deltakere:

## Agenda
1.
2.
3.

## Diskusjon og notater


## Beslutninger
-

## Aksjoner
| Aksjon | Ansvarlig | Frist |
|--------|-----------|-------|
|        |           |       |

## Neste møte
Dato:`,
  },
  {
    id: 'prosjekt',
    name: 'Prosjektmøte',
    description: 'Status, risiko og fremdrift',
    content: `Prosjekt:
Møtedato:
Deltakere:

## Status siden sist
Hva er fullført siden forrige møte?

## Fremdrift mot mål
- På plan:
- Forsinket:
- Blokkert:

## Risiko og utfordringer
-

## Beslutninger
-

## Aksjoner
| Aksjon | Ansvarlig | Frist |
|--------|-----------|-------|
|        |           |       |

## Neste steg`,
  },
  {
    id: 'status',
    name: 'Ukentlig statusmøte',
    description: 'Kort format for løpende statusmøter',
    content: `Uke:
Deltakere:

## Siden sist
-

## Denne uken – prioriteringer
-

## Blokkere / trenger hjelp
-

## Info til teamet
- `,
  },
  {
    id: 'beslutning',
    name: 'Beslutningsreferat',
    description: 'Fokus på beslutninger og begrunnelse',
    content: `Møtets formål:
Dato:
Beslutningsdeltakere:
Observatører:

## Bakgrunn / problemstilling


## Alternativer som ble vurdert
1.
2.
3.

## Beslutning
Beslutning:
Begrunnelse:
Stemte for:
Stemte mot / reservasjoner:

## Konsekvenser og oppfølging
-

## Aksjoner
| Aksjon | Ansvarlig | Frist |
|--------|-----------|-------|
|        |           |       |`,
  },
  {
    id: 'brainstorm',
    name: 'Idédugnad',
    description: 'For kreative sesjoner og idégenerering',
    content: `Tema / utfordring vi skal løse:
Deltakere:
Tidsramme:

## Mål for sesjonen


## Ideer (alle ideer noteres – ingen filtrering ennå)
-
-
-
-
-

## Rangering / prioritering
Topp 3 ideer vi går videre med:
1.
2.
3.

## Neste steg
- `,
  },
  {
    id: 'retro',
    name: 'Retrospektiv',
    description: 'Sprint- eller prosjektgjennomgang',
    content: `Sprint / periode:
Deltakere:
Fasilitator:

## Hva gikk bra?
-
-
-

## Hva kunne vært bedre?
-
-
-

## Konkrete forbedringstiltak
| Tiltak | Ansvarlig | Frist |
|--------|-----------|-------|
|        |           |       |

## Ros og anerkjennelse
-

## Neste retrospektiv`,
  },
  {
    id: 'entoeen',
    name: '1:1-møte',
    description: 'For personalmøter og oppfølgingssamtaler',
    content: `Dato:
Leder:
Medarbeider:

## Siden sist – oppdatering
Hva har gått bra?

Hva har vært utfordrende?

## Mål og fremdrift
Status på pågående mål:

## Trivsel og arbeidsforhold
Generell trivsel (1–10):
Kommentarer:

## Utvikling og læring
Hva ønsker medarbeideren å lære/utvikle seg innen?

## Tilbakemelding begge veier
Fra leder:

Fra medarbeider:

## Aksjoner og oppfølging
| Aksjon | Ansvarlig | Frist |
|--------|-----------|-------|
|        |           |       |

## Neste 1:1
Dato:`,
  },
];

function markdownToStorageFormat(markdown: string): string {
  return markdown
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^\*\*(.+)\*\*$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hup])(.+)$/gm, (line) =>
      line.trim() && !line.startsWith('<') ? `<p>${line}</p>` : line
    )
    .replace(/<\/p><p>/g, '</p>\n<p>');
}

function formatDefaultTitle(): string {
  return new Date()
    .toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\b(\w)/, (c) => c.toUpperCase());
}

interface AttendeePickerProps {
  value: string[];
  onChange: (names: string[]) => void;
}

function AttendeePicker({ value, onChange }: AttendeePickerProps) {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ['confluenceUserSearch', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  // Filtrer ut allerede valgte
  const filtered = suggestions.filter((u) => !value.includes(u.displayName));

  // Vis "Legg til fritekst"-alternativ hvis ingen eksakt treff
  const showFreeText =
    inputValue.trim().length > 0 &&
    !filtered.some((u) => u.displayName.toLowerCase() === inputValue.trim().toLowerCase()) &&
    !value.includes(inputValue.trim());

  const totalOptions = filtered.length + (showFreeText ? 1 : 0);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered.length, showFreeText]);

  // Lukk dropdown ved klikk utenfor
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 250);
  };

  const addAttendee = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue('');
    setDebouncedQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeAttendee = (name: string) => {
    onChange(value.filter((n) => n !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, totalOptions - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && totalOptions > 0) {
        if (highlightedIndex < filtered.length) {
          addAttendee(filtered[highlightedIndex].displayName);
        } else if (showFreeText) {
          addAttendee(inputValue);
        }
      } else if (inputValue.trim()) {
        addAttendee(inputValue);
      }
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const getAvatar = (user: ConfluenceUserResult) => {
    if (user.avatarUrl) {
      return <img src={user.avatarUrl} alt={user.displayName} className={styles.attendeeAvatar} />;
    }
    return (
      <span className={styles.attendeeAvatarInitial}>
        {user.displayName.charAt(0).toUpperCase()}
      </span>
    );
  };

  return (
    <div ref={containerRef} className={styles.attendeePicker}>
      <div
        className={styles.attendeeInput}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((name) => (
          <span key={name} className={styles.attendeeChip}>
            {name}
            <button
              type="button"
              className={styles.attendeeChipRemove}
              onClick={(e) => { e.stopPropagation(); removeAttendee(name); }}
              tabIndex={-1}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className={styles.attendeeInlineInput}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => inputValue.length >= 2 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? 'Søk etter deltakere...' : ''}
        />
      </div>

      {open && (inputValue.length >= 2 || isFetching) && (
        <div className={styles.attendeeDropdown}>
          {isFetching ? (
            <div className={styles.attendeeDropdownLoading}>
              <Loader2 size={13} className={styles.treeSpinner} /> Søker...
            </div>
          ) : totalOptions === 0 ? (
            <div className={styles.attendeeDropdownEmpty}>Ingen treff</div>
          ) : (
            <>
              {filtered.map((user, i) => (
                <button
                  key={user.accountId}
                  type="button"
                  className={`${styles.attendeeSuggestion} ${highlightedIndex === i ? styles.attendeeSuggestionActive : ''}`}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onMouseDown={(e) => { e.preventDefault(); addAttendee(user.displayName); }}
                >
                  {getAvatar(user)}
                  <span>{user.displayName}</span>
                </button>
              ))}
              {showFreeText && (
                <button
                  type="button"
                  className={`${styles.attendeeSuggestion} ${styles.attendeeSuggestionFreeText} ${highlightedIndex === filtered.length ? styles.attendeeSuggestionActive : ''}`}
                  onMouseEnter={() => setHighlightedIndex(filtered.length)}
                  onMouseDown={(e) => { e.preventDefault(); addAttendee(inputValue); }}
                >
                  <span className={styles.attendeeFreeTextIcon}><Plus size={12} /></span>
                  <span>Legg til «{inputValue.trim()}»</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MeetingNoteEditor({ space }: MeetingNoteEditorProps) {
  const [step, setStep] = useState<WizardStep>('setup');
  const [title, setTitle] = useState(`Møtenotat ${formatDefaultTitle()}`);
  const [parentId, setParentId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [attendees, setAttendees] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [context, setContext] = useState('');
  const [rewritten, setRewritten] = useState('');
  const [publishedPage, setPublishedPage] = useState<ConfluencePage | null>(null);
  const [rewriteError, setRewriteError] = useState('');
  const [publishError, setPublishError] = useState('');

  const [anthropicKey, setAnthropicKey] = useState(() => getAnthropicKey());

  // Oppdater nøkkelen hvis brukeren lagrer Settings mens komponenten er montert
  useEffect(() => {
    const onStorage = () => setAnthropicKey(getAnthropicKey());
    window.addEventListener('storage', onStorage);
    // Les også ved mount i tilfelle den var oppdatert uten storage-event
    setAnthropicKey(getAnthropicKey());
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const { data: meetingParent } = useQuery({
    queryKey: ['confluenceMeetingParent', space.key],
    queryFn: () => findPageByTitle('Møtenotater', space.key),
  });

  const { data: meetingChildren } = useQuery({
    queryKey: ['confluenceChildren', meetingParent?.id],
    queryFn: () => getChildPages(meetingParent!.id),
    enabled: !!meetingParent,
  });

  const parentOptions = useMemo(() => {
    if (!meetingParent) return [];
    const children = (meetingChildren ?? [])
      .filter((p) => p.type === 'folder' || p.hasChildren)
      .sort((a, b) => b.title.localeCompare(a.title, 'nb'));
    return [
      { id: meetingParent.id, title: 'Møtenotater (rot)' },
      ...children.map((c) => ({ id: c.id, title: c.title })),
    ];
  }, [meetingParent, meetingChildren]);

  const handleApplyTemplate = (templateId: string) => {
    const tpl = BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
    if (tpl) {
      setNotes(tpl.content);
      setSelectedTemplateId(templateId);
    }
  };

  const rewriteMutation = useMutation({
    mutationFn: async () => {
      const key = getAnthropicKey();
      if (!key) throw new Error('Anthropic API-nøkkel mangler – legg den inn under Innstillinger.');
      const response = await fetch('http://localhost:3001/api/ai/rewrite-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, attendees: attendees.join(', '), context, apiKey: anthropicKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Klarte ikke renskrive notater');
      if (data.content?.[0]?.text) return data.content[0].text as string;
      throw new Error('Uventet svar fra Claude');
    },
    onSuccess: (text) => {
      setRewritten(text);
      setRewriteError('');
      setStep('review');
    },
    onError: (err: Error) => {
      setRewriteError(err.message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const storageBody = markdownToStorageFormat(rewritten);
      return createPage(space.key, title, storageBody, parentId || meetingParent?.id);
    },
    onSuccess: (page) => {
      setPublishedPage(page);
      setPublishError('');
    },
    onError: (err: Error) => {
      setPublishError(err.message);
    },
  });

  const handleReset = () => {
    setStep('setup');
    setTitle(`Møtenotat ${formatDefaultTitle()}`);
    setParentId('');
    setSelectedTemplateId('');
    setAttendees([]);
    setNotes('');
    setContext('');
    setRewritten('');
    setPublishedPage(null);
    setRewriteError('');
    setPublishError('');
  };

  if (publishedPage) {
    return (
      <div className={styles.noteSuccess}>
        <div className={styles.noteSuccessIcon}><Check size={28} /></div>
        <h3 className={styles.noteSuccessTitle}>Møtenotat publisert!</h3>
        <p className={styles.noteSuccessDesc}>Siden ble opprettet i Confluence.</p>
        <a
          href={publishedPage.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.noteSuccessLink}
        >
          <ExternalLink size={14} />
          Åpne i Confluence
        </a>
        <button className={styles.noteResetBtn} onClick={handleReset}>
          <RotateCcw size={14} /> Nytt notat
        </button>
      </div>
    );
  }

  return (
    <div className={styles.noteWizard}>
      {/* Stegsindikator */}
      <div className={styles.noteSteps}>
        {(['setup', 'write', 'review'] as WizardStep[]).map((s, i) => {
          const labels = { setup: 'Oppsett', write: 'Skriv', review: 'Bekreft' };
          const isActive = step === s;
          const isDone =
            (s === 'setup' && (step === 'write' || step === 'review')) ||
            (s === 'write' && step === 'review');
          return (
            <div key={s} className={styles.noteStepItem}>
              <div
                className={`${styles.noteStepDot} ${isActive ? styles.noteStepDotActive : ''} ${isDone ? styles.noteStepDotDone : ''}`}
              >
                {isDone ? <Check size={11} /> : i + 1}
              </div>
              <span className={`${styles.noteStepLabel} ${isActive ? styles.noteStepLabelActive : ''}`}>
                {labels[s]}
              </span>
              {i < 2 && <ChevronRight size={13} className={styles.noteStepArrow} />}
            </div>
          );
        })}
      </div>

      {/* Steg A: Oppsett */}
      {step === 'setup' && (
        <div className={styles.noteStepContent}>
          <div className={styles.noteFormGrid}>
            <div className={styles.noteFormField}>
              <label className={styles.noteFormLabel}>
                <FileText size={13} /> Tittel
              </label>
              <input
                className={styles.noteFormInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Møtenotat ..."
                autoFocus
              />
            </div>

            <div className={styles.noteFormField}>
              <label className={styles.noteFormLabel}>
                <FileText size={13} /> Legg under
              </label>
              <select
                className={styles.noteFormSelect}
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">— Velg plassering —</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className={`${styles.noteFormField} ${styles.noteFormFieldFull}`}>
              <label className={styles.noteFormLabel}>
                <Users size={13} /> Deltakere (valgfritt)
              </label>
              <AttendeePicker value={attendees} onChange={setAttendees} />
            </div>
          </div>

          {/* Malvalg */}
          <div className={styles.noteFormField} style={{ marginTop: 4 }}>
            <label className={styles.noteFormLabel}>
              <Layout size={13} /> Velg mal (valgfritt)
            </label>
            <div className={styles.noteTemplateGrid}>
              {BUILT_IN_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  className={`${styles.noteTemplateCard} ${selectedTemplateId === tpl.id ? styles.noteTemplateCardActive : ''}`}
                  onClick={() => handleApplyTemplate(tpl.id)}
                  type="button"
                >
                  <span className={styles.noteTemplateCardName}>{tpl.name}</span>
                  <span className={styles.noteTemplateCardDesc}>{tpl.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.noteFormActions}>
            <button
              className={styles.noteNextBtn}
              onClick={() => setStep('write')}
              disabled={!title.trim()}
            >
              Neste <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Steg B: Skriv */}
      {step === 'write' && (
        <div className={styles.noteStepContent}>
          <div className={styles.noteWriteHeader}>
            <span className={styles.noteWriteTitle}>{title}</span>
            {attendees.length > 0 && (
              <span className={styles.noteWriteAttendees}>
                <Users size={12} /> {attendees.join(', ')}
              </span>
            )}
          </div>

          <textarea
            className={styles.noteTextarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={`Skriv rå møtenotater her...\n\nEksempel:\n- Diskuterte ny løsning for innlogging\n- Per skal lage prototyp innen fredag\n- Usikkerhet rundt integrasjon mot ekstern API`}
            autoFocus
          />

          <div className={styles.noteFormField} style={{ marginTop: 8 }}>
            <label className={styles.noteFormLabel}>
              <Wand2 size={13} /> Instruksjoner til Claude (valgfritt)
            </label>
            <input
              className={styles.noteFormInput}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder='F.eks. «fokuser på aksjoner», «lag kort sammendrag» ...'
            />
          </div>

          {rewriteError && (
            <div className={styles.noteError}>
              <AlertCircle size={14} /> {rewriteError}
            </div>
          )}

          <div className={styles.noteFormActions}>
            <button className={styles.noteBackBtn} onClick={() => setStep('setup')}>
              Tilbake
            </button>
            <button
              className={styles.noteRewriteBtn}
              onClick={() => rewriteMutation.mutate()}
              disabled={!notes.trim() || rewriteMutation.isPending}
            >
              {rewriteMutation.isPending ? (
                <><Loader2 size={14} className={styles.treeSpinner} /> Renskriver...</>
              ) : (
                <><Wand2 size={14} /> Rensk med Claude</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Steg C: Gjennomgå og publiser */}
      {step === 'review' && (
        <div className={styles.noteStepContent}>
          <div className={styles.noteDiffLayout}>
            <div className={styles.noteDiffPanel}>
              <div className={styles.noteDiffPanelHeader}>Ditt utkast</div>
              <pre className={styles.noteDiffOriginal}>{notes}</pre>
            </div>
            <div className={styles.noteDiffPanel}>
              <div className={styles.noteDiffPanelHeader}>
                <Wand2 size={12} /> Claude-forslag
                <span className={styles.noteDiffHint}>(kan redigeres)</span>
              </div>
              <textarea
                className={styles.noteDiffEditor}
                value={rewritten}
                onChange={(e) => setRewritten(e.target.value)}
              />
            </div>
          </div>

          {publishError && (
            <div className={styles.noteError}>
              <AlertCircle size={14} /> {publishError}
            </div>
          )}

          <div className={styles.noteFormActions}>
            <button className={styles.noteBackBtn} onClick={() => setStep('write')}>
              Tilbake
            </button>
            <button
              className={styles.noteRewriteBtn}
              onClick={() => rewriteMutation.mutate()}
              disabled={rewriteMutation.isPending}
            >
              {rewriteMutation.isPending ? (
                <><Loader2 size={14} className={styles.treeSpinner} /> Renskriver...</>
              ) : (
                <><Wand2 size={14} /> Rensk på nytt</>
              )}
            </button>
            <button
              className={styles.notePublishBtn}
              onClick={() => publishMutation.mutate()}
              disabled={!rewritten.trim() || publishMutation.isPending}
            >
              {publishMutation.isPending ? (
                <><Loader2 size={14} className={styles.treeSpinner} /> Publiserer...</>
              ) : (
                <><Send size={14} /> Publiser til Confluence</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
