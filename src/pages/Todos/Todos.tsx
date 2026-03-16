import { useState } from 'react';
import { Plus, ChevronDown, ChevronRight, Search, Filter } from 'lucide-react';
import { useTodoStore } from '../../store/todoStore';
import { TodoRow } from './TodoRow';
import type { TodoItem } from '../../types';
import styles from './Todos.module.css';

type SortKey = 'priority' | 'dueDate' | 'createdAt';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfWeekMs() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + 7);
  return d.getTime();
}

export function Todos() {
  const { addTodo, getActiveTodos, getCompletedTodos } = useTodoStore();

  const [newContent, setNewContent] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newDueDate, setNewDueDate] = useState<string>('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterJiraOnly, setFilterJiraOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('priority');

  const activeTodos = getActiveTodos();
  const completedTodos = getCompletedTodos();

  const handleAdd = () => {
    if (!newContent.trim()) return;
    addTodo({
      content: newContent.trim(),
      priority: newPriority,
      dueDate: newDueDate ? new Date(newDueDate).toISOString() : undefined,
    });
    setNewContent('');
    setNewPriority('medium');
    setNewDueDate('');
  };

  // Filter
  let filtered = activeTodos;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (t) => t.content.toLowerCase().includes(q) || t.linkedJiraIssue?.toLowerCase().includes(q)
    );
  }
  if (filterJiraOnly) {
    filtered = filtered.filter((t) => !!t.linkedJiraIssue);
  }

  // Sort
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  if (sortKey === 'priority') {
    filtered = [...filtered].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  } else if (sortKey === 'dueDate') {
    filtered = [...filtered].sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
  } else if (sortKey === 'createdAt') {
    filtered = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // Group into time buckets
  const todayStart = startOfTodayMs();
  const weekEnd = endOfWeekMs();

  const todayGroup = filtered.filter((t) => {
    if (!t.dueDate) return t.priority === 'high';
    const ms = new Date(t.dueDate).getTime();
    return ms <= todayStart + 86_400_000 - 1; // up to end of today (including overdue)
  });

  const weekGroup = filtered.filter((t) => {
    if (!t.dueDate) return false;
    const ms = new Date(t.dueDate).getTime();
    return ms > todayStart + 86_400_000 - 1 && ms <= weekEnd;
  });

  const laterGroup = filtered.filter((t) => {
    if (!t.dueDate) return t.priority !== 'high';
    const ms = new Date(t.dueDate).getTime();
    return ms > weekEnd;
  });

  return (
    <div className={styles.container}>
      {/* Quick-add bar */}
      <div className={styles.quickAdd}>
        <div className={styles.quickAddInput}>
          <Plus size={16} className={styles.quickAddIcon} />
          <input
            className={styles.quickAddField}
            placeholder="Legg til ny oppgave... (Enter for å legge til)"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
        </div>
        <div className={styles.quickAddOptions}>
          <select
            className={styles.prioritySelect}
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as 'low' | 'medium' | 'high')}
          >
            <option value="low">Lav</option>
            <option value="medium">Middels</option>
            <option value="high">Høy</option>
          </select>
          <button
            className={`${styles.dateBtn} ${newDueDate === todayISO() ? styles.dateBtnActive : ''}`}
            onClick={() => setNewDueDate(newDueDate === todayISO() ? '' : todayISO())}
          >
            I dag
          </button>
          <button
            className={`${styles.dateBtn} ${newDueDate === tomorrowISO() ? styles.dateBtnActive : ''}`}
            onClick={() => setNewDueDate(newDueDate === tomorrowISO() ? '' : tomorrowISO())}
          >
            I morgen
          </button>
          <input
            type="date"
            className={styles.dateInput}
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            title="Velg dato"
          />
          <button className={styles.addBtn} onClick={handleAdd} disabled={!newContent.trim()}>
            Legg til
          </button>
        </div>
      </div>

      {/* Filter / search bar */}
      <div className={styles.filterBar}>
        <div className={styles.searchRow}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Søk i oppgaver..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <label className={`${styles.filterToggle} ${filterJiraOnly ? styles.filterToggleActive : ''}`}>
          <input
            type="checkbox"
            checked={filterJiraOnly}
            onChange={(e) => setFilterJiraOnly(e.target.checked)}
            className={styles.hiddenCheckbox}
          />
          <Filter size={12} />
          Kun med Jira
        </label>
        <div className={styles.sortRow}>
          <span className={styles.sortLabel}>Sorter:</span>
          {(['priority', 'dueDate', 'createdAt'] as SortKey[]).map((key) => (
            <button
              key={key}
              className={`${styles.sortBtn} ${sortKey === key ? styles.sortBtnActive : ''}`}
              onClick={() => setSortKey(key)}
            >
              {key === 'priority' ? 'Prioritet' : key === 'dueDate' ? 'Frist' : 'Opprettet'}
            </button>
          ))}
        </div>
      </div>

      {/* Today group */}
      <GroupSection
        icon="📅"
        title="I dag"
        count={todayGroup.length}
        todos={todayGroup}
        defaultOpen
      />

      {/* This week group */}
      <GroupSection
        icon="📆"
        title="Denne uken"
        count={weekGroup.length}
        todos={weekGroup}
        defaultOpen
      />

      {/* Later group */}
      <GroupSection
        icon="🗂"
        title="Senere"
        count={laterGroup.length}
        todos={laterGroup}
        defaultOpen={false}
      />

      {/* Completed */}
      <div className={styles.group}>
        <button
          className={styles.groupHeader}
          onClick={() => setShowCompleted((v) => !v)}
        >
          <span className={styles.groupIcon}>✓</span>
          <span className={styles.groupTitle}>Fullført</span>
          <span className={styles.groupCount}>{completedTodos.length}</span>
          <span className={styles.chevron}>
            {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>
        {showCompleted && (
          <div className={styles.groupBody}>
            {completedTodos.length === 0 ? (
              <p className={styles.empty}>Ingen fullførte oppgaver.</p>
            ) : (
              completedTodos.map((todo) => <TodoRow key={todo.id} todo={todo} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface GroupSectionProps {
  icon: string;
  title: string;
  count: number;
  todos: TodoItem[];
  defaultOpen: boolean;
}

function GroupSection({ icon, title, count, todos, defaultOpen }: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.group}>
      <button className={styles.groupHeader} onClick={() => setOpen((v) => !v)}>
        <span className={styles.groupIcon}>{icon}</span>
        <span className={styles.groupTitle}>{title}</span>
        <span className={styles.groupCount}>{count}</span>
        <span className={styles.chevron}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && (
        <div className={styles.groupBody}>
          {todos.length === 0 ? (
            <p className={styles.empty}>Ingen oppgaver her.</p>
          ) : (
            todos.map((todo) => <TodoRow key={todo.id} todo={todo} />)
          )}
        </div>
      )}
    </div>
  );
}
