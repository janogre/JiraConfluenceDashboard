import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Plus, X, Check, ExternalLink, Loader2, Info, ListTree, AlertCircle, HelpCircle, PenLine, RotateCcw } from 'lucide-react';
import { getProjects, getCurrentUser, searchJiraUsers, createIssue } from '../../services/jiraService';
import { aiFetch } from '../../services/aiApi';
import { Button } from '../../components/common';
import type { JiraUser } from '../../types';
import {
  ARBEIDSTYPER, ARBEIDSTYPE_STANDARD,
  PRIORITETER, PRIORITET_STANDARD,
  STATUS_STANDARD,
  komponenterGruppert, finnKomponent,
  kategorierForKomponent, alleKategorier,
  ETIKETT_PREFIKSER, byggEtikett,
  byggTillatteVerdier,
  manglendeKrav, lagretKravnivaa, KRAVNIVAAER,
  type Krav, type KravKontekst,
} from '../../config/jiraStructure';
import styles from './NySak.module.css';

const SIST_PROSJEKT_KEY = 'nysak-sist-prosjekt';
const SIST_KOMPONENT_KEY = 'nysak-sist-komponent';
const STARRED_PROJECTS_KEY = 'board_starred_projects';

function loadStarred(): Set<string> {
  try {
    const raw = localStorage.getItem(STARRED_PROJECTS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

interface ForslagSvar {
  summary?: string;
  arbeidstype?: string | null;
  komponent?: string | null;
  kategori?: string | null;
  prioritet?: string | null;
  etiketter?: unknown;
  underoppgaver?: unknown;
  oppfolging?: unknown;
  begrunnelse?: string;
}

interface Underoppgave {
  id: string;
  title: string;
}

interface OpprettetSak {
  key: string;
  url: string;
  summary: string;
  underoppgaver: { key: string; url: string; title: string }[];
  feilet: string[];
}

// ── Ansvarlig-picker (gjenbruker searchJiraUsers) ───────────────────────────

function AnsvarligPicker({ value, valueLabel, onSelect, onClear }: {
  value: string;
  valueLabel: string;
  onSelect: (u: JiraUser) => void;
  onClear: () => void;
}) {
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['jiraUserSearch', debounced],
    queryFn: () => searchJiraUsers(debounced),
    enabled: debounced.length >= 2,
  });

  if (value) {
    return (
      <div className={styles.valgtBruker}>
        <span>{valueLabel}</span>
        <button type="button" className={styles.chipRemove} onClick={onClear} title="Fjern">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.pickerWrap}>
      <input
        className={styles.input}
        value={input}
        onChange={(e) => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Søk navn eller e-post…"
        autoComplete="off"
      />
      {open && debounced.length >= 2 && (
        <div className={styles.dropdown}>
          {isFetching && <div className={styles.dropdownItem}>Søker…</div>}
          {!isFetching && results.length === 0 && (
            <div className={styles.dropdownItem} style={{ color: 'var(--color-text-secondary)' }}>Ingen treff</div>
          )}
          {results.map((u) => (
            <div
              key={u.accountId}
              className={styles.dropdownItem}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(u); setInput(''); setOpen(false); }}
            >
              {u.avatarUrl && <img src={u.avatarUrl} alt="" className={styles.avatar} />}
              <div className={styles.brukerTekst}>
                <span>{u.displayName}</span>
                {u.emailAddress && <span className={styles.brukerEpost}>{u.emailAddress}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Egen etikett-verdi ───────────────────────────────────────────────────────

function EgenEtikett({ onAdd }: { onAdd: (verdi: string) => void }) {
  const [v, setV] = useState('');
  function submit() {
    const t = v.trim();
    if (!t) return;
    onAdd(t);
    setV('');
  }
  return (
    <span className={styles.egenWrap}>
      <input
        className={styles.egenInput}
        value={v}
        placeholder="+ egen"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
      />
      {v.trim() && (
        <button type="button" className={styles.egenAdd} onClick={submit} title="Legg til">
          <Plus size={13} />
        </button>
      )}
    </span>
  );
}

// ── Hovedside ────────────────────────────────────────────────────────────────

export function NySak() {
  const [fritekst, setFritekst] = useState('');
  const [summary, setSummary] = useState('');
  const [arbeidstype, setArbeidstype] = useState(ARBEIDSTYPE_STANDARD);
  const [prioritet, setPrioritet] = useState(PRIORITET_STANDARD);
  const [komponent, setKomponent] = useState('');
  const [kategori, setKategori] = useState('');
  const [etiketter, setEtiketter] = useState<string[]>([]);
  const [underoppgaver, setUnderoppgaver] = useState<Underoppgave[]>([]);
  const [jiraProjectKey, setJiraProjectKey] = useState('');
  const [assignee, setAssignee] = useState<{ accountId: string; name: string }>({ accountId: '', name: '' });
  const [dueDate, setDueDate] = useState('');

  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState('');
  const [begrunnelse, setBegrunnelse] = useState('');
  const [skrivOm, setSkrivOm] = useState(false);
  const [skrivOmError, setSkrivOmError] = useState('');
  const [forrigeFritekst, setForrigeFritekst] = useState('');
  const [omskrevet, setOmskrevet] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [opprettStatus, setOpprettStatus] = useState('');
  const [created, setCreated] = useState<OpprettetSak | null>(null);

  const [kravnivaa] = useState(lagretKravnivaa);
  const [visMangler, setVisMangler] = useState(false);
  const [aiOppfolging, setAiOppfolging] = useState<Record<string, string>>({});

  const fritekstRef = useRef<HTMLTextAreaElement>(null);
  const komponentRef = useRef<HTMLSelectElement>(null);
  const kategoriRef = useRef<HTMLSelectElement>(null);
  const etikettRef = useRef<HTMLDivElement>(null);

  const nesteUId = useRef(0);
  function nyUId() {
    nesteUId.current += 1;
    return `u-${nesteUId.current}`;
  }

  const [starred] = useState<Set<string>>(loadStarred);

  const { data: jiraProjects = [] } = useQuery({ queryKey: ['jiraProjects'], queryFn: getProjects });
  const { data: meg } = useQuery({ queryKey: ['currentUser'], queryFn: getCurrentUser });

  // Forhåndsvelg sist brukte prosjekt når prosjektlisten er lastet.
  useEffect(() => {
    if (jiraProjectKey || jiraProjects.length === 0) return;
    const sist = localStorage.getItem(SIST_PROSJEKT_KEY);
    if (sist && jiraProjects.some((p) => p.key === sist)) setJiraProjectKey(sist);
  }, [jiraProjects, jiraProjectKey]);

  // Standard ansvarlig = innlogget bruker.
  useEffect(() => {
    if (meg && !assignee.accountId) setAssignee({ accountId: meg.accountId, name: meg.displayName });
  }, [meg, assignee.accountId]);

  const kategoriValg = komponent ? kategorierForKomponent(komponent).map((k) => k.full) : alleKategorier();

  // Obligatoriske krav gitt aktivt kravnivå og dagens utfylling.
  const kontekst: KravKontekst = { arbeidstype, komponent, kategori, beskrivelse: fritekst, etiketter };
  const manglende = manglendeKrav(kontekst, kravnivaa);
  const mangelFelt = new Set(manglende.map((k) => (k.etikettPrefiks ? `etikett:${k.etikettPrefiks}` : k.felt)));
  const harMangel = (n: string) => visMangler && mangelFelt.has(n);

  function sporsmalFor(k: Krav): string {
    return aiOppfolging[k.etikettPrefiks ?? k.felt] || k.sporsmal;
  }

  function fokusKrav(k: Krav): void {
    const ref =
      k.felt === 'komponent' ? komponentRef
      : k.felt === 'kategori' ? kategoriRef
      : k.felt === 'beskrivelse' ? fritekstRef
      : etikettRef;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const el = ref.current;
    if (el && 'focus' in el) (el as HTMLElement).focus();
  }

  // Inline oppfølgingsspørsmål under et felt som mangler.
  function feltSporsmal(n: string) {
    if (!visMangler) return null;
    const k = manglende.find((x) => (x.etikettPrefiks ? `etikett:${x.etikettPrefiks}` : x.felt) === n);
    if (!k) return null;
    return (
      <p className={styles.feltSporsmal}><HelpCircle size={12} /> {sporsmalFor(k)}</p>
    );
  }

  function velgKomponent(navn: string) {
    setKomponent(navn);
    if (navn) localStorage.setItem(SIST_KOMPONENT_KEY, navn);
    const gyldige = navn ? kategorierForKomponent(navn).map((k) => k.full) : alleKategorier();
    setKategori((prev) => (prev && !gyldige.includes(prev) ? '' : prev));
  }

  function velgProsjekt(key: string) {
    setJiraProjectKey(key);
    if (key) localStorage.setItem(SIST_PROSJEKT_KEY, key);
  }

  function toggleEtikett(full: string) {
    setEtiketter((prev) => (prev.includes(full) ? prev.filter((e) => e !== full) : [...prev, full]));
  }

  function leggTilEgenEtikett(prefiks: string, verdi: string) {
    const full = byggEtikett(prefiks, verdi);
    if (!full) return;
    setEtiketter((prev) => (prev.includes(full) ? prev : [...prev, full]));
  }

  function fjernEtikett(full: string) {
    setEtiketter((prev) => prev.filter((e) => e !== full));
  }

  function leggTilUnderoppgave() {
    setUnderoppgaver((prev) => [...prev, { id: nyUId(), title: '' }]);
  }

  function oppdaterUnderoppgave(id: string, title: string) {
    setUnderoppgaver((prev) => prev.map((u) => (u.id === id ? { ...u, title } : u)));
  }

  function fjernUnderoppgave(id: string) {
    setUnderoppgaver((prev) => prev.filter((u) => u.id !== id));
  }

  function brukForslag(f: ForslagSvar) {
    if (f.summary) setSummary(f.summary);
    if (f.arbeidstype && ARBEIDSTYPER.some((a) => a.navn === f.arbeidstype)) setArbeidstype(f.arbeidstype);
    if (f.prioritet && PRIORITETER.some((p) => p.navn === f.prioritet)) setPrioritet(f.prioritet);

    const nyKomponent = f.komponent && finnKomponent(f.komponent) ? f.komponent : '';
    if (nyKomponent) velgKomponent(nyKomponent);

    if (f.kategori) {
      const gyldige = nyKomponent ? kategorierForKomponent(nyKomponent).map((k) => k.full) : alleKategorier();
      if (gyldige.includes(f.kategori) || alleKategorier().includes(f.kategori)) setKategori(f.kategori);
    }

    if (Array.isArray(f.etiketter)) {
      const rene = (f.etiketter as unknown[])
        .filter((e): e is string => typeof e === 'string' && e.includes(':'))
        .map((e) => {
          const idx = e.indexOf(':');
          return byggEtikett(e.slice(0, idx), e.slice(idx + 1));
        })
        .filter(Boolean);
      if (rene.length) setEtiketter((prev) => [...new Set([...prev, ...rene])]);
    }

    if (Array.isArray(f.underoppgaver)) {
      const titler = (f.underoppgaver as unknown[])
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim());
      if (titler.length) setUnderoppgaver(titler.map((t) => ({ id: nyUId(), title: t })));
    }

    setBegrunnelse(f.begrunnelse ?? '');
  }

  async function handleForeslaa() {
    if (!fritekst.trim()) {
      setClassifyError('Skriv en kort beskrivelse først.');
      return;
    }
    setClassifying(true);
    setClassifyError('');
    setBegrunnelse('');
    try {
      const response = await aiFetch('classify-issue', { text: fritekst, allowed: byggTillatteVerdier() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI-feil');
      brukForslag(data as ForslagSvar);
      const o = (data as ForslagSvar).oppfolging;
      setAiOppfolging(o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, string>) : {});
      // Synliggjør straks hva som fortsatt mangler (AI som setter felt til null → spør).
      setVisMangler(true);
    } catch (err) {
      setClassifyError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setClassifying(false);
    }
  }

  // Valgfri AI-omskriving av beskrivelsen (kjøres kun når brukeren trykker).
  async function handleSkrivOm() {
    if (!fritekst.trim()) {
      setSkrivOmError('Skriv en beskrivelse først.');
      return;
    }
    setSkrivOm(true);
    setSkrivOmError('');
    try {
      const response = await aiFetch('rewrite-description', { text: fritekst, arbeidstype });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI-feil');
      const ny = String(data.beskrivelse ?? '').trim();
      if (!ny) {
        setSkrivOmError('AI returnerte en tom beskrivelse.');
        return;
      }
      setForrigeFritekst(fritekst);
      setFritekst(ny);
      setOmskrevet(true);
    } catch (err) {
      setSkrivOmError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setSkrivOm(false);
    }
  }

  function angreOmskriving() {
    setFritekst(forrigeFritekst);
    setOmskrevet(false);
  }

  async function handleOpprett() {
    if (!summary.trim()) {
      setCreateError('Tittel er påkrevd.');
      return;
    }
    if (!jiraProjectKey) {
      setCreateError('Velg et Jira-prosjekt.');
      return;
    }
    if (manglende.length > 0) {
      // Obligatoriske punkter mangler — spør etter dem i stedet for å opprette.
      setVisMangler(true);
      setCreateError('');
      fokusKrav(manglende[0]);
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      setOpprettStatus(`Oppretter sak «${summary.trim()}»…`);
      const issue = await createIssue(jiraProjectKey, summary.trim(), arbeidstype, {
        description: fritekst.trim() || undefined,
        dueDate: dueDate || undefined,
        assigneeAccountId: assignee.accountId || undefined,
        priority: prioritet || undefined,
        components: komponent ? [komponent] : undefined,
        kategori: kategori || undefined,
        labels: etiketter.length ? etiketter : undefined,
      });

      // Opprett valgte underoppgaver som «Underoppgave» under hovedsaken.
      const lagde: { key: string; url: string; title: string }[] = [];
      const feilet: string[] = [];
      for (const u of underoppgaver.filter((x) => x.title.trim())) {
        const tittel = u.title.trim();
        setOpprettStatus(`Oppretter underoppgave «${tittel}»…`);
        try {
          const sub = await createIssue(jiraProjectKey, tittel, 'Underoppgave', { parentKey: issue.key });
          lagde.push({ key: sub.key, url: sub.url, title: tittel });
        } catch {
          feilet.push(tittel);
        }
      }

      setCreated({ key: issue.key, url: issue.url, summary: summary.trim(), underoppgaver: lagde, feilet });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setCreating(false);
      setOpprettStatus('');
    }
  }

  function nullstillForNy() {
    setFritekst('');
    setSummary('');
    setArbeidstype(ARBEIDSTYPE_STANDARD);
    setPrioritet(PRIORITET_STANDARD);
    setKomponent('');
    setKategori('');
    setEtiketter([]);
    setUnderoppgaver([]);
    setDueDate('');
    setBegrunnelse('');
    setCreated(null);
    setCreateError('');
    setClassifyError('');
    setVisMangler(false);
    setAiOppfolging({});
    setOmskrevet(false);
    setForrigeFritekst('');
    setSkrivOmError('');
    // Beholder jiraProjectKey og assignee bevisst for rask gjentatt registrering.
  }

  if (created) {
    return (
      <div className={styles.page}>
        <div className={styles.suksess}>
          <div className={styles.suksessIkon}><Check size={22} /></div>
          <h2 className={styles.suksessTittel}>Sak opprettet</h2>
          <a className={styles.suksessLenke} href={created.url} target="_blank" rel="noreferrer">
            {created.key} – {created.summary} <ExternalLink size={15} />
          </a>
          {created.underoppgaver.length > 0 && (
            <div className={styles.suksessUnder}>
              <span className={styles.suksessUnderHode}>
                {created.underoppgaver.length} underoppgaver opprettet:
              </span>
              {created.underoppgaver.map((u) => (
                <a key={u.key} className={styles.suksessUnderLenke} href={u.url} target="_blank" rel="noreferrer">
                  {u.key} – {u.title}
                </a>
              ))}
            </div>
          )}
          {created.feilet.length > 0 && (
            <p className={styles.feil}>Kunne ikke opprette: {created.feilet.join(', ')}</p>
          )}
          <Button variant="primary" icon={<Plus size={16} />} onClick={nullstillForNy}>
            Registrer ny sak
          </Button>
        </div>
      </div>
    );
  }

  const favoritter = jiraProjects.filter((p) => starred.has(p.key));
  const andreProsjekter = jiraProjects.filter((p) => !starred.has(p.key));

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h1 className={styles.tittel}>Ny sak</h1>
        <p className={styles.undertittel}>
          Beskriv saken kort – så fyller vi inn strukturen automatisk. Du retter bare det som er nødvendig.
        </p>
      </div>

      {visMangler && manglende.length > 0 && (
        <div className={styles.manglerPanel}>
          <div className={styles.manglerHode}>
            <AlertCircle size={16} />
            <span>
              Noen obligatoriske punkter mangler før saken kan opprettes
              <span className={styles.manglerNivaa}> · {KRAVNIVAAER.find((n) => n.id === kravnivaa)?.navn}-nivå</span>
            </span>
          </div>
          <ul className={styles.manglerListe}>
            {manglende.map((k) => (
              <li key={k.id}>
                <button type="button" className={styles.manglerHopp} onClick={() => fokusKrav(k)}>
                  <HelpCircle size={14} /> {sporsmalFor(k)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.grid}>
        {/* ── Venstre: beskrivelse + AI ── */}
        <div className={styles.kort}>
          <label className={styles.label}>Hva gjelder saken?</label>
          <textarea
            ref={fritekstRef}
            className={`${styles.fritekst} ${harMangel('beskrivelse') ? styles.feltMangler : ''}`}
            value={fritekst}
            onChange={(e) => setFritekst(e.target.value)}
            placeholder="F.eks. «Feil på OLT i Nordvika, Smøla – ingen kunder får signal»"
            rows={6}
          />
          {feltSporsmal('beskrivelse')}
          <div className={styles.aiKnapper}>
            <Button
              variant="secondary"
              icon={skrivOm ? <Loader2 size={16} className={styles.spin} /> : <PenLine size={16} />}
              onClick={handleSkrivOm}
              disabled={skrivOm || !fritekst.trim()}
            >
              {skrivOm ? 'Skriver om…' : 'Skriv om beskrivelse'}
            </Button>
            <Button
              variant="primary"
              icon={classifying ? <Loader2 size={16} className={styles.spin} /> : <Sparkles size={16} />}
              onClick={handleForeslaa}
              disabled={classifying}
            >
              {classifying ? 'Analyserer…' : 'Foreslå med AI'}
            </Button>
          </div>
          {omskrevet && (
            <p className={styles.omskrevetNote}>
              <Sparkles size={12} /> Beskrivelsen er omskrevet av AI – juster fritt.
              <button type="button" className={styles.angreLenke} onClick={angreOmskriving}>
                <RotateCcw size={12} /> Angre
              </button>
            </p>
          )}
          {skrivOmError && <p className={styles.feil}>{skrivOmError}</p>}
          {classifyError && <p className={styles.feil}>{classifyError}</p>}
          {begrunnelse && (
            <p className={styles.begrunnelse}><Info size={13} /> {begrunnelse}</p>
          )}

          <div className={styles.field} style={{ marginTop: 'var(--spacing-md)' }}>
            <label className={styles.label}>Tittel *</label>
            <input
              className={styles.input}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Kort sakstittel"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleOpprett(); } }}
            />
          </div>
        </div>

        {/* ── Høyre: strukturfelt ── */}
        <div className={styles.kort}>
          <div className={styles.field}>
            <label className={styles.label}>Arbeidstype</label>
            <div className={styles.segmented}>
              {ARBEIDSTYPER.map((a) => (
                <button
                  key={a.navn}
                  type="button"
                  title={a.beskrivelse}
                  className={`${styles.segItem} ${arbeidstype === a.navn ? styles.segItemAktiv : ''}`}
                  onClick={() => setArbeidstype(a.navn)}
                >
                  {a.navn}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Prioritet</label>
            <div className={styles.segmented}>
              {PRIORITETER.map((p) => (
                <button
                  key={p.navn}
                  type="button"
                  title={p.betydning}
                  className={`${styles.segItem} ${prioritet === p.navn ? styles.segItemAktiv : ''}`}
                  onClick={() => setPrioritet(p.navn)}
                >
                  {p.navn}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>Komponent</label>
              <select
                ref={komponentRef}
                className={`${styles.select} ${harMangel('komponent') ? styles.feltMangler : ''}`}
                value={komponent}
                onChange={(e) => velgKomponent(e.target.value)}
              >
                <option value="">— Velg komponent —</option>
                {komponenterGruppert().map((g) => (
                  <optgroup key={g.gruppe} label={g.gruppe}>
                    {g.komponenter.map((k) => (
                      <option key={k.navn} value={k.navn}>{k.navn}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {feltSporsmal('komponent')}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Kategori {komponent && <span className={styles.scopeHint}>({finnKomponent(komponent)?.team})</span>}
              </label>
              <select
                ref={kategoriRef}
                className={`${styles.select} ${harMangel('kategori') ? styles.feltMangler : ''}`}
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
              >
                <option value="">— Velg kategori —</option>
                {kategoriValg.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              {feltSporsmal('kategori')}
            </div>
          </div>

          {/* ── Etiketter ── */}
          <div className={styles.field} ref={etikettRef}>
            <label className={styles.label}>Etiketter <span className={styles.valgfri}>(valgfritt)</span></label>
            {feltSporsmal('etikett:geo')}
            {feltSporsmal('etikett:lok')}
            {feltSporsmal('etikett:seg')}
            {etiketter.length > 0 && (
              <div className={styles.valgteEtiketter}>
                {etiketter.map((e) => (
                  <span key={e} className={styles.valgtEtikett}>
                    {e}
                    <button type="button" className={styles.chipRemove} onClick={() => fjernEtikett(e)} title="Fjern">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className={styles.etikettGrupper}>
              {ETIKETT_PREFIKSER.map((g) => (
                <div className={styles.etikettGruppe} key={g.prefiks}>
                  <div className={styles.etikettGruppeHode}>
                    <span className={styles.etikettPrefiks}>{g.prefiks}:</span>
                    <span className={styles.etikettFormaal}>{g.formaal}</span>
                  </div>
                  <div className={styles.etikettVerdier}>
                    {g.verdier.map((v) => {
                      const full = byggEtikett(g.prefiks, v);
                      const valgt = etiketter.includes(full);
                      return (
                        <button
                          key={full}
                          type="button"
                          className={`${styles.etikettChip} ${valgt ? styles.etikettChipAktiv : ''}`}
                          onClick={() => toggleEtikett(full)}
                        >
                          {v}
                        </button>
                      );
                    })}
                    <EgenEtikett onAdd={(verdi) => leggTilEgenEtikett(g.prefiks, verdi)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Underoppgaver ── */}
      <div className={styles.kort}>
        <div className={styles.uHode}>
          <label className={styles.label}>
            <ListTree size={15} /> Underoppgaver <span className={styles.valgfri}>(valgfritt)</span>
          </label>
          {underoppgaver.filter((u) => u.title.trim()).length > 0 && (
            <span className={styles.uAntall}>{underoppgaver.filter((u) => u.title.trim()).length}</span>
          )}
        </div>
        <p className={styles.uHint}>
          La AI bryte ned en sammensatt sak i steg, eller legg til selv. Hver underoppgave opprettes som en Jira-underoppgave under saken.
        </p>
        {underoppgaver.length > 0 && (
          <div className={styles.uListe}>
            {underoppgaver.map((u, i) => (
              <div key={u.id} className={styles.uRad}>
                <span className={styles.uNr}>{i + 1}</span>
                <input
                  className={styles.input}
                  value={u.title}
                  placeholder="Beskriv steget…"
                  onChange={(e) => oppdaterUnderoppgave(u.id, e.target.value)}
                />
                <button type="button" className={styles.chipRemove} onClick={() => fjernUnderoppgave(u.id)} title="Fjern">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className={styles.uLeggTil} onClick={leggTilUnderoppgave}>
          <Plus size={14} /> Legg til underoppgave
        </button>
      </div>

      {/* ── Bunnlinje: prosjekt, ansvarlig, frist, opprett ── */}
      <div className={styles.kort}>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>Jira-prosjekt *</label>
            <select className={styles.select} value={jiraProjectKey} onChange={(e) => velgProsjekt(e.target.value)}>
              <option value="">— Velg prosjekt —</option>
              {favoritter.length > 0 && (
                <optgroup label="⭐ Favoritter">
                  {favoritter.map((p) => <option key={p.key} value={p.key}>{p.key} – {p.name}</option>)}
                </optgroup>
              )}
              <optgroup label="Alle prosjekter">
                {andreProsjekter.map((p) => <option key={p.key} value={p.key}>{p.key} – {p.name}</option>)}
              </optgroup>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Ansvarlig</label>
            <AnsvarligPicker
              value={assignee.accountId}
              valueLabel={assignee.name}
              onSelect={(u) => setAssignee({ accountId: u.accountId, name: u.displayName })}
              onClear={() => setAssignee({ accountId: '', name: '' })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Frist</label>
            <input
              className={styles.input}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.bunn}>
          {opprettStatus ? (
            <span className={styles.statusNote}>
              <Loader2 size={13} className={styles.spin} /> {opprettStatus}
            </span>
          ) : (
            <span className={styles.statusNote}>
              <Info size={13} /> Status settes automatisk til <strong>{STATUS_STANDARD}</strong>.
            </span>
          )}
          <Button
            variant="primary"
            size="lg"
            icon={creating ? <Loader2 size={18} className={styles.spin} /> : <Check size={18} />}
            onClick={handleOpprett}
            disabled={creating}
          >
            {creating ? 'Oppretter…' : 'Opprett sak'}
          </Button>
        </div>
        {createError && <p className={styles.feil}>{createError}</p>}
      </div>
    </div>
  );
}
