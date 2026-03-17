import { useState } from 'react';
import { Plus, ChevronDown, ChevronRight, Search, ClipboardList, Kanban, CheckSquare, Globe, ExternalLink, Trash2, Pencil, X, Check, Grid2x2 } from 'lucide-react';
import { useTodoStore } from '../../store/todoStore';
import { useExternalPortalStore } from '../../store/externalPortalStore';
import { Microsoft } from '../Microsoft/Microsoft';
import { TodoRow } from './TodoRow';
import type { TodoItem, ExternalPortal } from '../../types';
import styles from './Todos.module.css';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'private' | 'jira' | 'confluence' | 'external' | 'microsoft';
type SortKey = 'priority' | 'dueDate' | 'createdAt';

const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: 'private',    icon: <ClipboardList size={16} />, label: 'Private oppgaver'   },
  { id: 'jira',       icon: <Kanban size={16} />,        label: 'Jira-oppgaver'      },
  { id: 'confluence', icon: <CheckSquare size={16} />,   label: 'Handlingselementer' },
  { id: 'microsoft',  icon: <Grid2x2 size={16} />,       label: 'Microsoft 365'      },
  { id: 'external',   icon: <Globe size={16} />,         label: 'Eksterne'           },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().split('T')[0]; }
function tomorrowISO() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}
function startOfTodayMs() { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function endOfWeekMs() { const d = new Date(); d.setHours(23,59,59,999); d.setDate(d.getDate()+7); return d.getTime(); }

// ── Shared todo list UI ────────────────────────────────────────────────────────

interface TodoListProps {
  activeTodos: TodoItem[];
  completedTodos: TodoItem[];
  showQuickAdd: boolean;
}

function TodoList({ activeTodos, completedTodos, showQuickAdd }: TodoListProps) {
  const { addTodo } = useTodoStore();

  const [newContent, setNewContent]   = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newDueDate, setNewDueDate]   = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey]         = useState<SortKey>('priority');

  const handleAdd = () => {
    if (!newContent.trim()) return;
    addTodo({
      content:  newContent.trim(),
      priority: newPriority,
      dueDate:  newDueDate ? new Date(newDueDate).toISOString() : undefined,
    });
    setNewContent(''); setNewPriority('medium'); setNewDueDate('');
  };

  let filtered = activeTodos;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (t) => t.content.toLowerCase().includes(q) || t.linkedJiraIssue?.toLowerCase().includes(q)
    );
  }

  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  if (sortKey === 'priority') {
    filtered = [...filtered].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  } else if (sortKey === 'dueDate') {
    filtered = [...filtered].sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return a.dueDate ? -1 : b.dueDate ? 1 : 0;
    });
  } else {
    filtered = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const todayStart = startOfTodayMs();
  const weekEnd    = endOfWeekMs();

  const todayGroup = filtered.filter((t) => {
    if (!t.dueDate) return t.priority === 'high';
    return new Date(t.dueDate).getTime() <= todayStart + 86_400_000 - 1;
  });
  const weekGroup = filtered.filter((t) => {
    if (!t.dueDate) return false;
    const ms = new Date(t.dueDate).getTime();
    return ms > todayStart + 86_400_000 - 1 && ms <= weekEnd;
  });
  const laterGroup = filtered.filter((t) => {
    if (!t.dueDate) return t.priority !== 'high';
    return new Date(t.dueDate).getTime() > weekEnd;
  });

  return (
    <>
      {showQuickAdd && (
        <div className={styles.quickAdd}>
          <div className={styles.quickAddInput}>
            <Plus size={16} className={styles.quickAddIcon} />
            <input
              className={styles.quickAddField}
              placeholder="Legg til ny oppgave... (Enter)"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
          <div className={styles.quickAddOptions}>
            <select className={styles.prioritySelect} value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as 'low' | 'medium' | 'high')}>
              <option value="low">Lav</option>
              <option value="medium">Middels</option>
              <option value="high">Høy</option>
            </select>
            <button className={`${styles.dateBtn} ${newDueDate === todayISO() ? styles.dateBtnActive : ''}`}
              onClick={() => setNewDueDate(newDueDate === todayISO() ? '' : todayISO())}>I dag</button>
            <button className={`${styles.dateBtn} ${newDueDate === tomorrowISO() ? styles.dateBtnActive : ''}`}
              onClick={() => setNewDueDate(newDueDate === tomorrowISO() ? '' : tomorrowISO())}>I morgen</button>
            <input type="date" className={styles.dateInput} value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)} title="Velg dato" />
            <button className={styles.addBtn} onClick={handleAdd} disabled={!newContent.trim()}>Legg til</button>
          </div>
        </div>
      )}

      <div className={styles.filterBar}>
        <div className={styles.searchRow}>
          <Search size={14} className={styles.searchIcon} />
          <input className={styles.searchInput} placeholder="Søk i oppgaver..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className={styles.sortRow}>
          <span className={styles.sortLabel}>Sorter:</span>
          {(['priority', 'dueDate', 'createdAt'] as SortKey[]).map((key) => (
            <button key={key}
              className={`${styles.sortBtn} ${sortKey === key ? styles.sortBtnActive : ''}`}
              onClick={() => setSortKey(key)}>
              {key === 'priority' ? 'Prioritet' : key === 'dueDate' ? 'Frist' : 'Opprettet'}
            </button>
          ))}
        </div>
      </div>

      <GroupSection icon="📅" title="I dag"       count={todayGroup.length} todos={todayGroup}  defaultOpen />
      <GroupSection icon="📆" title="Denne uken"  count={weekGroup.length}  todos={weekGroup}   defaultOpen />
      <GroupSection icon="🗂"  title="Senere"      count={laterGroup.length} todos={laterGroup}  defaultOpen={false} />

      <div className={styles.group}>
        <button className={styles.groupHeader} onClick={() => setShowCompleted((v) => !v)}>
          <span className={styles.groupIcon}>✓</span>
          <span className={styles.groupTitle}>Fullført</span>
          <span className={styles.groupCount}>{completedTodos.length}</span>
          <span className={styles.chevron}>{showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        </button>
        {showCompleted && (
          <div className={styles.groupBody}>
            {completedTodos.length === 0
              ? <p className={styles.empty}>Ingen fullførte oppgaver.</p>
              : completedTodos.map((todo) => <TodoRow key={todo.id} todo={todo} />)}
          </div>
        )}
      </div>
    </>
  );
}

// ── GroupSection ───────────────────────────────────────────────────────────────

interface GroupSectionProps { icon: string; title: string; count: number; todos: TodoItem[]; defaultOpen: boolean; }

function GroupSection({ icon, title, count, todos, defaultOpen }: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.group}>
      <button className={styles.groupHeader} onClick={() => setOpen((v) => !v)}>
        <span className={styles.groupIcon}>{icon}</span>
        <span className={styles.groupTitle}>{title}</span>
        <span className={styles.groupCount}>{count}</span>
        <span className={styles.chevron}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {open && (
        <div className={styles.groupBody}>
          {todos.length === 0
            ? <p className={styles.empty}>Ingen oppgaver her.</p>
            : todos.map((todo) => <TodoRow key={todo.id} todo={todo} />)}
        </div>
      )}
    </div>
  );
}

// ── ExternalPortalList ─────────────────────────────────────────────────────────

function PortalCard({ portal }: { portal: ExternalPortal }) {
  const { updatePortal, deletePortal } = useExternalPortalStore();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(portal.title);
  const [url, setUrl] = useState(portal.url);
  const [description, setDescription] = useState(portal.description ?? '');

  const save = () => {
    if (!title.trim() || !url.trim()) return;
    updatePortal(portal.id, {
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || undefined,
    });
    setEditing(false);
  };

  const cancel = () => {
    setTitle(portal.title);
    setUrl(portal.url);
    setDescription(portal.description ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={styles.portalCard}>
        <div className={styles.portalEditForm}>
          <input
            className={styles.portalInput}
            placeholder="Tittel *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <input
            className={styles.portalInput}
            placeholder="URL *"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <textarea
            className={styles.portalTextarea}
            placeholder="Beskrivelse (valgfritt)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <div className={styles.portalEditActions}>
            <button className={styles.portalSaveBtn} onClick={save} disabled={!title.trim() || !url.trim()}>
              <Check size={14} /> Lagre
            </button>
            <button className={styles.portalCancelBtn} onClick={cancel}>
              <X size={14} /> Avbryt
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.portalCard}>
      <div className={styles.portalIcon}>
        <Globe size={18} />
      </div>
      <div className={styles.portalBody}>
        <div className={styles.portalTitleRow}>
          <a
            href={portal.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.portalTitle}
          >
            {portal.title}
            <ExternalLink size={13} className={styles.portalExternalIcon} />
          </a>
        </div>
        {portal.description && (
          <p className={styles.portalDescription}>{portal.description}</p>
        )}
        <span className={styles.portalUrl}>{portal.url}</span>
      </div>
      <div className={styles.portalActions}>
        <button className={styles.portalActionBtn} title="Rediger" onClick={() => setEditing(true)}>
          <Pencil size={14} />
        </button>
        <button className={`${styles.portalActionBtn} ${styles.portalDeleteBtn}`} title="Slett" onClick={() => deletePortal(portal.id)}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function ExternalPortalList() {
  const { portals, addPortal } = useExternalPortalStore();
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const handleAdd = () => {
    if (!newTitle.trim() || !newUrl.trim()) return;
    addPortal({
      title: newTitle.trim(),
      url: newUrl.trim(),
      description: newDescription.trim() || undefined,
    });
    setNewTitle(''); setNewUrl(''); setNewDescription('');
    setShowForm(false);
  };

  return (
    <div className={styles.portalList}>
      <div className={styles.portalAddBar}>
        {showForm ? (
          <div className={styles.portalAddForm}>
            <input
              className={styles.portalInput}
              placeholder="Tittel *"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
            <input
              className={styles.portalInput}
              placeholder="URL *  (f.eks. https://portal.example.com)"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <textarea
              className={styles.portalTextarea}
              placeholder="Beskrivelse – hva er portalen og hvilke oppgaver finnes der?"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={3}
            />
            <div className={styles.portalEditActions}>
              <button className={styles.portalSaveBtn} onClick={handleAdd} disabled={!newTitle.trim() || !newUrl.trim()}>
                <Plus size={14} /> Legg til portal
              </button>
              <button className={styles.portalCancelBtn} onClick={() => { setShowForm(false); setNewTitle(''); setNewUrl(''); setNewDescription(''); }}>
                <X size={14} /> Avbryt
              </button>
            </div>
          </div>
        ) : (
          <button className={styles.portalNewBtn} onClick={() => setShowForm(true)}>
            <Plus size={15} /> Legg til ekstern portal
          </button>
        )}
      </div>

      {portals.length === 0 && !showForm ? (
        <div className={styles.portalEmpty}>
          <Globe size={40} />
          <p>Ingen eksterne portaler lagt til ennå.</p>
        </div>
      ) : (
        portals.map((portal) => <PortalCard key={portal.id} portal={portal} />)
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export function Todos() {
  const [activeTab, setActiveTab] = useState<Tab>('private');
  const { getActiveTodos, getCompletedTodos } = useTodoStore();
  const { portals } = useExternalPortalStore();

  const allActive    = getActiveTodos();
  const allCompleted = getCompletedTodos();

  const privateActive    = allActive.filter((t) => !t.linkedJiraIssue && !t.linkedConfluenceTask);
  const privateCompleted = allCompleted.filter((t) => !t.linkedJiraIssue && !t.linkedConfluenceTask);

  const jiraActive    = allActive.filter((t) => !!t.linkedJiraIssue);
  const jiraCompleted = allCompleted.filter((t) => !!t.linkedJiraIssue);

  const confluenceActive    = allActive.filter((t) => !!t.linkedConfluenceTask);
  const confluenceCompleted = allCompleted.filter((t) => !!t.linkedConfluenceTask);

  return (
    <div className={styles.container}>
      <div className={styles.tabNav}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
            <span className={styles.tabCount}>
              {tab.id === 'private' ? privateActive.length
                : tab.id === 'jira' ? jiraActive.length
                : tab.id === 'confluence' ? confluenceActive.length
                : tab.id === 'external' ? portals.length
                : ''}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'private' && (
        <TodoList
          activeTodos={privateActive}
          completedTodos={privateCompleted}
          showQuickAdd
        />
      )}
      {activeTab === 'jira' && (
        <TodoList
          activeTodos={jiraActive}
          completedTodos={jiraCompleted}
          showQuickAdd={false}
        />
      )}
      {activeTab === 'confluence' && (
        <TodoList
          activeTodos={confluenceActive}
          completedTodos={confluenceCompleted}
          showQuickAdd={false}
        />
      )}
      {activeTab === 'external' && <ExternalPortalList />}
      {activeTab === 'microsoft' && <Microsoft />}
    </div>
  );
}
