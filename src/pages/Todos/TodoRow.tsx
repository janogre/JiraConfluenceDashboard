import { useState, useRef, useEffect } from 'react';
import {
  Check,
  Trash2,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
} from 'lucide-react';
import { Badge } from '../../components/common';
import { useTodoStore } from '../../store/todoStore';
import { getJiraBaseUrl } from '../../services/api';
import { JiraIssuePicker } from './JiraIssuePicker';
import type { TodoItem } from '../../types';
import styles from './TodoRow.module.css';

interface TodoRowProps {
  todo: TodoItem;
}

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
  const d = new Date(dateString);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isOverdue(dateString: string) {
  return new Date(dateString) < new Date() && !isToday(dateString);
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function nextWeekISO() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

export function TodoRow({ todo }: TodoRowProps) {
  const { toggleTodo, deleteTodo, updateTodo, addSubtask, toggleSubtask, deleteSubtask, linkToJiraIssue, unlinkFromJiraIssue } = useTodoStore();
  const [expanded, setExpanded] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState(todo.content);
  const [notesDraft, setNotesDraft] = useState(todo.notes ?? '');
  const [newSubtask, setNewSubtask] = useState('');
  const [showJiraPicker, setShowJiraPicker] = useState(false);
  const contentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setContentDraft(todo.content);
    setNotesDraft(todo.notes ?? '');
  }, [todo.content, todo.notes]);

  useEffect(() => {
    if (editingContent) contentInputRef.current?.focus();
  }, [editingContent]);

  const saveContent = () => {
    if (contentDraft.trim() && contentDraft.trim() !== todo.content) {
      updateTodo(todo.id, { content: contentDraft.trim() });
    }
    setEditingContent(false);
  };

  const saveNotes = () => {
    if (notesDraft !== (todo.notes ?? '')) {
      updateTodo(todo.id, { notes: notesDraft || undefined });
    }
  };

  const setDueDate = (isoDate: string | undefined) => {
    updateTodo(todo.id, { dueDate: isoDate ? new Date(isoDate).toISOString() : undefined });
  };

  const setPriority = (p: 'low' | 'medium' | 'high') => {
    updateTodo(todo.id, { priority: p });
  };

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    addSubtask(todo.id, newSubtask.trim());
    setNewSubtask('');
  };

  const subtasks = todo.subtasks ?? [];
  const completedSubtasks = subtasks.filter((s) => s.completed).length;

  return (
    <>
      <div className={`${styles.row} ${todo.completed ? styles.completed : ''} ${expanded ? styles.expandedRow : ''}`}>
        {/* Checkbox */}
        <button
          className={styles.checkBtn}
          onClick={(e) => { e.stopPropagation(); toggleTodo(todo.id); }}
          title={todo.completed ? 'Marker som aktiv' : 'Marker som fullført'}
        >
          <div className={`${styles.checkbox} ${todo.completed ? styles.checked : ''}`}>
            {todo.completed && <Check size={11} />}
          </div>
        </button>

        {/* Main content */}
        <div
          className={styles.mainContent}
          onClick={() => !todo.completed && setExpanded((v) => !v)}
        >
          <div className={styles.topLine}>
            {!todo.completed && (
              <span className={styles.expandIcon}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
            <span className={`${styles.todoText} ${todo.completed ? styles.strikethrough : ''}`}>
              {todo.content}
            </span>
          </div>

          <div className={styles.badges}>
            <Badge variant={PRIORITY_VARIANTS[todo.priority]} size="sm">
              {PRIORITY_LABELS[todo.priority]}
            </Badge>
            {todo.dueDate && (
              <Badge
                variant={isOverdue(todo.dueDate) ? 'danger' : isToday(todo.dueDate) ? 'warning' : 'default'}
                size="sm"
              >
                {isToday(todo.dueDate) ? 'I dag' : isOverdue(todo.dueDate) ? `Forfalt ${formatDate(todo.dueDate)}` : formatDate(todo.dueDate)}
              </Badge>
            )}
            {todo.linkedJiraIssue && (
              <a
                href={`${getJiraBaseUrl()}/browse/${todo.linkedJiraIssue}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={styles.jiraLink}
              >
                <Badge variant="primary" size="sm">
                  <LinkIcon size={10} />
                  {todo.linkedJiraIssue}
                </Badge>
              </a>
            )}
            {subtasks.length > 0 && (
              <Badge variant="default" size="sm">
                {completedSubtasks}/{subtasks.length}
              </Badge>
            )}
          </div>
        </div>

        {/* Hover actions */}
        {!todo.completed && (
          <div className={styles.actions}>
            <button
              className={styles.actionBtn}
              onClick={(e) => { e.stopPropagation(); setShowJiraPicker(true); }}
              title="Koble Jira-issue"
            >
              <LinkIcon size={14} />
            </button>
            <button
              className={`${styles.actionBtn} ${styles.deleteBtn}`}
              onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }}
              title="Slett"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
        {todo.completed && (
          <div className={styles.actions}>
            <button
              className={`${styles.actionBtn} ${styles.deleteBtn}`}
              onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }}
              title="Slett"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Expanded panel */}
      {expanded && !todo.completed && (
        <div className={styles.expandedPanel}>
          {/* Inline content editing */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Tittel</label>
            {editingContent ? (
              <input
                ref={contentInputRef}
                className={styles.inlineInput}
                value={contentDraft}
                onChange={(e) => setContentDraft(e.target.value)}
                onBlur={saveContent}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveContent();
                  if (e.key === 'Escape') { setContentDraft(todo.content); setEditingContent(false); }
                }}
              />
            ) : (
              <div
                className={styles.editableText}
                onClick={() => setEditingContent(true)}
                title="Klikk for å redigere"
              >
                {todo.content}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Notater</label>
            <textarea
              className={styles.notesArea}
              placeholder="Legg til notater..."
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={saveNotes}
              rows={3}
            />
          </div>

          {/* Priority */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Prioritet</label>
            <div className={styles.priorityBtns}>
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  className={`${styles.priorityBtn} ${styles[`priority_${p}`]} ${todo.priority === p ? styles.priorityActive : ''}`}
                  onClick={() => setPriority(p)}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Forfallsdato</label>
            <div className={styles.dateRow}>
              <button className={styles.dateShortcut} onClick={() => setDueDate(todayISO())}>I dag</button>
              <button className={styles.dateShortcut} onClick={() => setDueDate(tomorrowISO())}>I morgen</button>
              <button className={styles.dateShortcut} onClick={() => setDueDate(nextWeekISO())}>Neste uke</button>
              <input
                type="date"
                className={styles.dateInput}
                value={todo.dueDate?.split('T')[0] ?? ''}
                onChange={(e) => setDueDate(e.target.value || undefined)}
              />
              {todo.dueDate && (
                <button className={styles.clearDate} onClick={() => setDueDate(undefined)}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Jira link */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Jira-kobling</label>
            {todo.linkedJiraIssue ? (
              <div className={styles.jiraRow}>
                <a
                  href={`${getJiraBaseUrl()}/browse/${todo.linkedJiraIssue}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.jiraLink}
                >
                  <Badge variant="primary" size="sm">
                    <LinkIcon size={10} />
                    {todo.linkedJiraIssue}
                  </Badge>
                </a>
                <button className={styles.changeJira} onClick={() => setShowJiraPicker(true)}>Endre</button>
                <button className={styles.clearJira} onClick={() => unlinkFromJiraIssue(todo.id)}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button className={styles.linkJiraBtn} onClick={() => setShowJiraPicker(true)}>
                <LinkIcon size={14} /> Koble til Jira-issue
              </button>
            )}
          </div>

          {/* Subtasks */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>
              Deloppgaver {subtasks.length > 0 && `(${completedSubtasks}/${subtasks.length})`}
            </label>
            {subtasks.length > 0 && (
              <ul className={styles.subtaskList}>
                {subtasks.map((st) => (
                  <li key={st.id} className={styles.subtaskItem}>
                    <button
                      className={styles.subtaskCheck}
                      onClick={() => toggleSubtask(todo.id, st.id)}
                    >
                      <div className={`${styles.miniCheckbox} ${st.completed ? styles.miniChecked : ''}`}>
                        {st.completed && <Check size={9} />}
                      </div>
                    </button>
                    <span className={`${styles.subtaskText} ${st.completed ? styles.subtaskDone : ''}`}>
                      {st.content}
                    </span>
                    <button
                      className={styles.subtaskDelete}
                      onClick={() => deleteSubtask(todo.id, st.id)}
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.addSubtaskRow}>
              <input
                className={styles.subtaskInput}
                placeholder="Legg til deloppgave..."
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSubtask();
                  if (e.key === 'Escape') setNewSubtask('');
                }}
              />
              <button className={styles.addSubtaskBtn} onClick={handleAddSubtask} disabled={!newSubtask.trim()}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <JiraIssuePicker
        isOpen={showJiraPicker}
        onClose={() => setShowJiraPicker(false)}
        onSelect={(key) => linkToJiraIssue(todo.id, key)}
      />
    </>
  );
}
