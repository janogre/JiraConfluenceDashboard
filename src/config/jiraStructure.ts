/**
 * Jira-struktur for avd. Teknologi.
 *
 * Single source of truth for den nye sakstrukturen: arbeidstyper, prioriteter,
 * komponenter (Gruppe:Element), kategorier per team (Team:Kategori) og
 * etiketter (prefiks:verdi). Hentet direkte fra strukturdokumentet.
 *
 * Verdiene er hardkodet her nå. De kan på sikt gjøres redigerbare i Innstillinger
 * uten å endre forbruket i UI-et, så lenge eksportene beholder formen.
 */

// ── Arbeidstype ──────────────────────────────────────────────────────────────

export interface Arbeidstype {
  navn: string;
  beskrivelse: string;
}

export const ARBEIDSTYPER: Arbeidstype[] = [
  { navn: 'Oppgave', beskrivelse: 'Planlagt arbeid — installasjon, konfigurasjon, vedlikehold' },
  { navn: 'Feil', beskrivelse: 'Noe som er ødelagt eller ikke fungerer som det skal, bugs' },
  { navn: 'Historie', beskrivelse: 'Brukerorientert beskrivelse av et behov eller ønsket funksjonalitet' },
  { navn: 'Oppgavesamling', beskrivelse: 'Samlebeholder for relaterte oppgaver innenfor et større arbeid' },
];

export const ARBEIDSTYPE_STANDARD = 'Oppgave';

// ── Status ───────────────────────────────────────────────────────────────────

// Standardflyt: Åpen → Pågår → Ferdig. Nye saker starter i første workflow-status
// (Åpen), så status settes aldri eksplisitt ved oppretting.
export const STATUS_STANDARD = 'Åpen';

// ── Prioritet ────────────────────────────────────────────────────────────────

export interface Prioritet {
  navn: string;
  betydning: string;
}

export const PRIORITETER: Prioritet[] = [
  { navn: 'Høyest', betydning: 'Kritisk — påvirker mange kunder eller kjernetjenester, krever umiddelbar handling' },
  { navn: 'Høy', betydning: 'Viktig — bør løses raskt, men ikke nødvendigvis akkurat nå' },
  { navn: 'Medium', betydning: 'Normal prioritet — løses i tur og orden' },
  { navn: 'Lav', betydning: 'Kan vente — ingen umiddelbar konsekvens' },
  { navn: 'Lavest', betydning: 'Ren «nice to have» — gjøres hvis det er tid' },
];

export const PRIORITET_STANDARD = 'Medium';

// ── Team ─────────────────────────────────────────────────────────────────────

export type Team = 'nettverk' | 'system';

// ── Komponent (Gruppe:Element) ───────────────────────────────────────────────

export interface Komponent {
  gruppe: string;
  element: string;
  /** Fullt komponentnavn på formen Gruppe:Element, f.eks. "Aksess:PON". */
  navn: string;
  forklaring: string;
  /** Hvilket team som typisk eier kategoriene for denne komponenten. */
  team: Team;
}

function lagKomponent(gruppe: string, element: string, forklaring: string, team: Team): Komponent {
  return { gruppe, element, navn: `${gruppe}:${element}`, forklaring, team };
}

export const KOMPONENTER: Komponent[] = [
  lagKomponent('Aksess', 'PON', 'PON-aksessnett (XGS-PON, GPON)', 'nettverk'),
  lagKomponent('Aksess', 'BNG', 'Broadband Network Gateway (aksess-side)', 'nettverk'),
  lagKomponent('Aksess', 'KTV', 'Kabel-TV-nett', 'nettverk'),
  lagKomponent('Kjerne', 'BNG', 'BNG i kjernenettet', 'nettverk'),
  lagKomponent('System', 'NETAdmin', 'NETAdmin som forvaltningssystem', 'system'),
];

/** Gruppe → team. Driver hvilke kategorier som er aktuelle for en komponent. */
export const GRUPPE_TIL_TEAM: Record<string, Team> = {
  Aksess: 'nettverk',
  Kjerne: 'nettverk',
  System: 'system',
};

/** Komponentene gruppert på Gruppe, for visning i picker. */
export function komponenterGruppert(): { gruppe: string; komponenter: Komponent[] }[] {
  const grupper: { gruppe: string; komponenter: Komponent[] }[] = [];
  for (const komp of KOMPONENTER) {
    let bolk = grupper.find((g) => g.gruppe === komp.gruppe);
    if (!bolk) {
      bolk = { gruppe: komp.gruppe, komponenter: [] };
      grupper.push(bolk);
    }
    bolk.komponenter.push(komp);
  }
  return grupper;
}

export function finnKomponent(navn: string): Komponent | undefined {
  return KOMPONENTER.find((k) => k.navn === navn);
}

// ── Kategori (Team:Kategori) ─────────────────────────────────────────────────

export interface Kategori {
  /** Kategori-suffiks uten team-prefiks, f.eks. "feilretting". */
  verdi: string;
  dekker: string;
}

export const KATEGORIER_PER_TEAM: Record<Team, Kategori[]> = {
  nettverk: [
    { verdi: 'installasjon', dekker: 'Nyinstallasjon av utstyr og tjenester' },
    { verdi: 'utvidelse', dekker: 'Kapasitetsutvidelse, nye noder, utbygging' },
    { verdi: 'oppgradering', dekker: 'Programvare-, firmware- og hardwareoppgraderinger' },
    { verdi: 'feilretting', dekker: 'Feilsøking og reparasjon' },
    { verdi: 'vedlikehold', dekker: 'Planlagt vedlikehold' },
    { verdi: 'endring', dekker: 'Planlagte konfigurasjonsendringer' },
  ],
  system: [
    { verdi: 'kunde', dekker: 'Oppgaver relatert til kunde' },
    { verdi: 'adresse', dekker: 'Oppgaver relatert til adresse' },
    { verdi: 'produkt', dekker: 'Oppgaver relatert til abonnement, ordre, provisjonering og sak' },
    { verdi: 'utstyr', dekker: 'Oppgaver relatert til inventar' },
    { verdi: 'system', dekker: 'Oppgaver relatert til selve systemet' },
    { verdi: 'billing', dekker: 'Oppgaver relatert til billpipe, billing og fakturering' },
    { verdi: 'rapporter', dekker: 'Oppgaver relatert til kontrollister, avviksrapporter og diverse uttrekk' },
  ],
};

/** Bygg full kategoriverdi på formen Team:Kategori, f.eks. "nettverk:feilretting". */
export function byggKategori(team: Team, verdi: string): string {
  return `${team}:${verdi}`;
}

/**
 * Aktuelle kategorier (med full Team:Kategori-verdi) for en valgt komponent.
 * Returnerer tom liste dersom komponenten er ukjent.
 */
export function kategorierForKomponent(komponentNavn: string): { team: Team; verdi: string; full: string; dekker: string }[] {
  const komp = finnKomponent(komponentNavn);
  if (!komp) return [];
  return KATEGORIER_PER_TEAM[komp.team].map((k) => ({
    team: komp.team,
    verdi: k.verdi,
    full: byggKategori(komp.team, k.verdi),
    dekker: k.dekker,
  }));
}

/** Alle gyldige kategoriverdier på tvers av team (for validering av AI-forslag). */
export function alleKategorier(): string[] {
  return (Object.keys(KATEGORIER_PER_TEAM) as Team[]).flatMap((team) =>
    KATEGORIER_PER_TEAM[team].map((k) => byggKategori(team, k.verdi))
  );
}

// ── Etiketter (prefiks:verdi) ────────────────────────────────────────────────

export interface EtikettPrefiks {
  prefiks: string;
  formaal: string;
  /** Kjente/foreslåtte verdier (uten prefiks). Fritt tillegg er også lov. */
  verdier: string[];
  /** tmp-etiketter er midlertidige og fjernes når tilstanden er over. */
  midlertidig?: boolean;
}

export const ETIKETT_PREFIKSER: EtikettPrefiks[] = [
  { prefiks: 'geo', formaal: 'Kommune eller område', verdier: ['smola', 'averoy', 'oppdal', 'roros', 'kristiansund'] },
  { prefiks: 'lok', formaal: 'Spesifikk lokasjon (node, sentral, skap)', verdier: ['nordvika', 'kvalvag', 'berkak'] },
  { prefiks: 'vendor', formaal: 'Leverandør eller utstyrsplattform', verdier: ['nokia', 'juniper', 'genexis'] },
  { prefiks: 'seg', formaal: 'Kundesegment', verdier: ['privat', 'bedrift', 'kommune', 'ikt-orkide'] },
  { prefiks: 'tmp', formaal: 'Midlertidig tilstand eller flagg', verdier: ['venter-deler', 'venter-leverandor', 'hastejobb'], midlertidig: true },
];

export const ETIKETT_PREFIKS_NAVN = ETIKETT_PREFIKSER.map((p) => p.prefiks);

/**
 * Normaliser en etikettverdi etter reglene i strukturdokumentet:
 * små bokstaver, norske tegn forenkles (ø→o, å→a, æ→e), mellomrom→bindestrek,
 * og kun [a-z0-9-] beholdes.
 */
export function normaliserEtikettVerdi(verdi: string): string {
  return verdi
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/æ/g, 'e')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Bygg en komplett etikett «prefiks:normalisertverdi». Tom verdi gir tom streng. */
export function byggEtikett(prefiks: string, verdi: string): string {
  const v = normaliserEtikettVerdi(verdi);
  if (!v) return '';
  return `${normaliserEtikettVerdi(prefiks)}:${v}`;
}

/** Sjekk at en etikett har et gyldig prefiks (ingen etiketter uten prefiks). */
export function harGyldigPrefiks(etikett: string): boolean {
  const idx = etikett.indexOf(':');
  if (idx <= 0) return false;
  return ETIKETT_PREFIKS_NAVN.includes(etikett.slice(0, idx));
}

// ── Kravnivå: obligatoriske felt per sak ─────────────────────────────────────

export type Kravnivaa = 'av' | 'mild' | 'standard' | 'streng';

export const KRAVNIVAAER: { id: Kravnivaa; navn: string; beskrivelse: string }[] = [
  { id: 'av', navn: 'Av', beskrivelse: 'Kun Jira-minimum (tittel + prosjekt). Ingen ekstra krav.' },
  { id: 'mild', navn: 'Mild', beskrivelse: 'Krev Komponent og Kategori.' },
  { id: 'standard', navn: 'Standard', beskrivelse: 'Komponent, Kategori, beskrivelse for Feil, og geo-etikett for nettverkssaker.' },
  { id: 'streng', navn: 'Streng', beskrivelse: 'Som standard, men beskrivelse alltid, og lok/seg der det er relevant.' },
];

export const KRAVNIVAA_STANDARD: Kravnivaa = 'standard';

const KRAVNIVAA_RANG: Record<Kravnivaa, number> = { av: 0, mild: 1, standard: 2, streng: 3 };

export interface KravKontekst {
  arbeidstype: string;
  komponent: string;
  kategori: string;
  beskrivelse: string;
  etiketter: string[];
}

export interface Krav {
  id: string;
  /** Hvilket felt/seksjon i UI kravet peker på (for highlighting og fokus). */
  felt: 'komponent' | 'kategori' | 'beskrivelse' | 'etiketter';
  /** Prefiks dersom kravet gjelder en bestemt etikett (geo/lok/seg). */
  etikettPrefiks?: string;
  label: string;
  /** Standard oppfølgingsspørsmål (brukes hvis AI ikke gir et mer presist). */
  sporsmal: string;
  minNivaa: number;
  gjelder: (k: KravKontekst) => boolean;
  oppfylt: (k: KravKontekst) => boolean;
}

function harEtikett(etiketter: string[], prefiks: string): boolean {
  return etiketter.some((e) => e.startsWith(`${prefiks}:`));
}

function harTeam(komponentNavn: string, team: Team): boolean {
  const k = finnKomponent(komponentNavn);
  return !!k && k.team === team;
}

export const KRAV: Krav[] = [
  {
    id: 'komponent', felt: 'komponent', label: 'Komponent',
    sporsmal: 'Hvilken del av nettet/systemet gjelder saken? (f.eks. Aksess:PON)',
    minNivaa: KRAVNIVAA_RANG.mild,
    gjelder: () => true,
    oppfylt: (k) => !!k.komponent,
  },
  {
    id: 'kategori', felt: 'kategori', label: 'Kategori',
    sporsmal: 'Hva slags arbeid eller hvilket objekt gjelder saken?',
    minNivaa: KRAVNIVAA_RANG.mild,
    gjelder: () => true,
    oppfylt: (k) => !!k.kategori,
  },
  {
    id: 'beskrivelse-feil', felt: 'beskrivelse', label: 'Beskrivelse',
    sporsmal: 'Hva er galt, og hva er konsekvensen? Beskriv symptom og omfang.',
    minNivaa: KRAVNIVAA_RANG.standard,
    gjelder: (k) => k.arbeidstype === 'Feil',
    oppfylt: (k) => k.beskrivelse.trim().length > 0,
  },
  {
    id: 'geo-nettverk', felt: 'etiketter', etikettPrefiks: 'geo', label: 'Etikett geo: (kommune)',
    sporsmal: 'Hvilken kommune eller område gjelder saken? (f.eks. geo:smola)',
    minNivaa: KRAVNIVAA_RANG.standard,
    gjelder: (k) => harTeam(k.komponent, 'nettverk'),
    oppfylt: (k) => harEtikett(k.etiketter, 'geo'),
  },
  {
    id: 'beskrivelse-alle', felt: 'beskrivelse', label: 'Beskrivelse',
    sporsmal: 'Beskriv saken kort.',
    minNivaa: KRAVNIVAA_RANG.streng,
    gjelder: () => true,
    oppfylt: (k) => k.beskrivelse.trim().length > 0,
  },
  {
    id: 'lok-nettverk', felt: 'etiketter', etikettPrefiks: 'lok', label: 'Etikett lok: (lokasjon)',
    sporsmal: 'Hvilken node, sentral eller lokasjon? (f.eks. lok:nordvika)',
    minNivaa: KRAVNIVAA_RANG.streng,
    gjelder: (k) => harTeam(k.komponent, 'nettverk'),
    oppfylt: (k) => harEtikett(k.etiketter, 'lok'),
  },
  {
    id: 'seg-system', felt: 'etiketter', etikettPrefiks: 'seg', label: 'Etikett seg: (segment)',
    sporsmal: 'Hvilket kundesegment gjelder saken? (f.eks. seg:bedrift)',
    minNivaa: KRAVNIVAA_RANG.streng,
    gjelder: (k) => harTeam(k.komponent, 'system'),
    oppfylt: (k) => harEtikett(k.etiketter, 'seg'),
  },
];

/** Manglende obligatoriske krav gitt kontekst og aktivt kravnivå (deduplisert per felt). */
export function manglendeKrav(kontekst: KravKontekst, nivaa: Kravnivaa): Krav[] {
  const rang = KRAVNIVAA_RANG[nivaa];
  const sett = new Set<string>();
  const resultat: Krav[] = [];
  for (const krav of KRAV) {
    if (krav.minNivaa > rang) continue;
    if (!krav.gjelder(kontekst)) continue;
    if (krav.oppfylt(kontekst)) continue;
    const nokkel = `${krav.felt}:${krav.etikettPrefiks ?? ''}`;
    if (sett.has(nokkel)) continue;
    sett.add(nokkel);
    resultat.push(krav);
  }
  return resultat;
}

// Persistens av valgt kravnivå (kan flyttes til Innstillinger-UI).
const KRAVNIVAA_KEY = 'nysak-kravnivaa';

export function lagretKravnivaa(): Kravnivaa {
  try {
    const v = localStorage.getItem(KRAVNIVAA_KEY) as Kravnivaa | null;
    if (v && v in KRAVNIVAA_RANG) return v;
  } catch { /* ignore */ }
  return KRAVNIVAA_STANDARD;
}

export function lagreKravnivaa(nivaa: Kravnivaa): void {
  try { localStorage.setItem(KRAVNIVAA_KEY, nivaa); } catch { /* ignore */ }
}

// ── Samlet «allowed»-pakke til AI-klassifisering ──────────────────────────────

/**
 * Komprimert beskrivelse av de tillatte verdiene som sendes til AI-endepunktet,
 * slik at modellen kun foreslår verdier som finnes i strukturen.
 */
export function byggTillatteVerdier() {
  return {
    arbeidstyper: ARBEIDSTYPER.map((a) => a.navn),
    prioriteter: PRIORITETER.map((p) => p.navn),
    komponenter: KOMPONENTER.map((k) => k.navn),
    kategorierPerTeam: {
      nettverk: KATEGORIER_PER_TEAM.nettverk.map((k) => byggKategori('nettverk', k.verdi)),
      system: KATEGORIER_PER_TEAM.system.map((k) => byggKategori('system', k.verdi)),
    },
    etiketter: ETIKETT_PREFIKSER.map((p) => ({ prefiks: p.prefiks, formaal: p.formaal, verdier: p.verdier })),
  };
}
