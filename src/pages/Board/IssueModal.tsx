import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ExternalLink, CheckSquare, Check } from 'lucide-react';
import { Badge, Modal, Button } from '../../components/common';
import { getTransitions, transitionIssue } from '../../services/jiraService';
import { useTodoStore } from '../../store/todoStore';
import type { JiraIssue } from '../../types';
import styles from './Board.module.css';

function getPriorityVariant(priority?: string): 'danger' | 'warning' | 'default' {
  switch (priority?.toLowerCase()) {
    case 'highest':
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    default:
      return 'default';
  }
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function toStatusCategory(key: string): 'new' | 'indeterminate' | 'done' {
  if (key === 'new' || key === 'done') return key;
  return 'indeterminate';
}

interface IssueModalProps {
  issue: JiraIssue;
  jiraBaseUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onTransitioned?: (issueKey: string, newStatus: { id: string; name: string; category: 'new' | 'indeterminate' | 'done' }) => void;
}

export function IssueModal({ issue, jiraBaseUrl, isOpen, onClose, onTransitioned }: IssueModalProps) {
  const [showTodoForm, setShowTodoForm] = useState(false);
  const [todoCreated, setTodoCreated] = useState(false);
  const [todoPriority, setTodoPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [todoDueDate, setTodoDueDate] = useState('');
  const { addTodo, getTodosByJiraIssue } = useTodoStore();
  const hasActiveTodo = getTodosByJiraIssue(issue.key).some((t) => !t.completed);

  const { data: transitions } = useQuery({
    queryKey: ['transitions', issue.key],
    queryFn: () => getTransitions(issue.key),
  });

  const { mutate: doTransition, isPending: changingStatus } = useMutation({
    mutationFn: (vars: { transitionId: string; toStatusId: string; toStatusName: string; toCategoryKey: string }) =>
      transitionIssue(issue.key, vars.transitionId),
    onSuccess: (_, vars) => {
      onTransitioned?.(issue.key, {
        id: vars.toStatusId,
        name: vars.toStatusName,
        category: toStatusCategory(vars.toCategoryKey),
      });
    },
  });

  const handleClose = () => {
    setShowTodoForm(false);
    setTodoCreated(false);
    setTodoPriority('medium');
    setTodoDueDate('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={issue.key} size="md">
      <div className={styles.modalContent}>
        <h2 className={styles.modalTitle}>{issue.summary}</h2>

        <div className={styles.modalMeta}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Status</span>
            <Badge
              variant={
                issue.status.category === 'done'
                  ? 'success'
                  : issue.status.category === 'indeterminate'
                  ? 'primary'
                  : 'default'
              }
            >
              {issue.status.name}
            </Badge>
          </div>
          {issue.priority && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Prioritet</span>
              <Badge variant={getPriorityVariant(issue.priority.name)}>
                {issue.priority.name}
              </Badge>
            </div>
          )}
          {issue.assignee && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Ansvarlig</span>
              <span>{issue.assignee.displayName}</span>
            </div>
          )}
          {issue.dueDate && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Frist</span>
              <span className={isOverdue(issue.dueDate) ? styles.overdue : ''}>
                {new Date(issue.dueDate).toLocaleDateString('nb-NO')}
              </span>
            </div>
          )}
          {issue.labels && issue.labels.length > 0 && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Etiketter</span>
              <div className={styles.modalLabels}>
                {issue.labels.map((label) => (
                  <span key={label} className={styles.cardLabel}>{label}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {issue.description && (
          <div className={styles.modalDescription}>
            <span className={styles.metaLabel}>Beskrivelse</span>
            <p>{issue.description}</p>
          </div>
        )}

        {transitions && transitions.length > 0 && (
          <div className={styles.modalSection}>
            <span className={styles.metaLabel}>Flytt til</span>
            <div className={styles.transitionButtons}>
              {transitions.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant="secondary"
                  disabled={changingStatus}
                  onClick={() =>
                    doTransition({
                      transitionId: t.id,
                      toStatusId: t.to.id,
                      toStatusName: t.to.name,
                      toCategoryKey: t.to.statusCategoryKey,
                    })
                  }
                >
                  {t.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {issue.links && issue.links.length > 0 && (
          <div className={styles.modalSection}>
            <span className={styles.metaLabel}>Avhengigheter</span>
            <div className={styles.dependencyList}>
              {issue.links.map((link) => {
                const linkedIssue = link.inwardIssue ?? link.outwardIssue;
                const direction = link.inwardIssue ? link.type.inward : link.type.outward;
                if (!linkedIssue) return null;
                const typeLower = link.type.name.toLowerCase();
                const isBlocked = !!link.inwardIssue && (typeLower.includes('block') || typeLower.includes('blokkerer'));
                const isBlocking = !!link.outwardIssue && (typeLower.includes('block') || typeLower.includes('blokkerer'));
                const depClass = isBlocked ? styles.depBlocked : isBlocking ? styles.depBlocking : styles.depRelated;
                return (
                  <div key={link.id} className={`${styles.dependencyItem} ${depClass}`}>
                    <span className={styles.depDirection}>{direction}</span>
                    {linkedIssue.issueType?.iconUrl && (
                      <img src={linkedIssue.issueType.iconUrl} alt="" className={styles.depIcon} />
                    )}
                    <a
                      href={`${jiraBaseUrl}/browse/${linkedIssue.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.depKey}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {linkedIssue.key}
                    </a>
                    <span className={styles.depSummary}>{linkedIssue.summary}</span>
                    <Badge
                      variant={
                        linkedIssue.status.category === 'done'
                          ? 'success'
                          : linkedIssue.status.category === 'indeterminate'
                          ? 'primary'
                          : 'default'
                      }
                      size="sm"
                    >
                      {linkedIssue.status.name}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showTodoForm && !todoCreated && (
          <div className={styles.todoForm}>
            <div className={styles.todoFormFields}>
              <div className={styles.todoFormField}>
                <label className={styles.todoFormLabel}>Prioritet</label>
                <select
                  className={styles.todoFormSelect}
                  value={todoPriority}
                  onChange={(e) => setTodoPriority(e.target.value as 'low' | 'medium' | 'high')}
                >
                  <option value="low">Lav</option>
                  <option value="medium">Middels</option>
                  <option value="high">Høy</option>
                </select>
              </div>
              <div className={styles.todoFormField}>
                <label className={styles.todoFormLabel}>Forfallsdato</label>
                <input
                  type="date"
                  className={styles.todoFormDate}
                  value={todoDueDate}
                  onChange={(e) => setTodoDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <div className={styles.modalActions}>
          {todoCreated ? (
            <span className={styles.todoCreatedConfirm}>
              <Check size={14} /> Todo opprettet!
            </span>
          ) : showTodoForm ? (
            <>
              <button
                className={styles.createTodoBtn}
                onClick={() => {
                  addTodo({
                    content: `[${issue.key}] ${issue.summary}`,
                    priority: todoPriority,
                    dueDate: todoDueDate ? new Date(todoDueDate).toISOString() : undefined,
                    linkedJiraIssue: issue.key,
                  });
                  setTodoCreated(true);
                  setShowTodoForm(false);
                  setTimeout(() => setTodoCreated(false), 2000);
                }}
              >
                <CheckSquare size={14} />
                Lagre todo
              </button>
              <button className={styles.cancelTodoBtn} onClick={() => setShowTodoForm(false)}>
                Avbryt
              </button>
            </>
          ) : (
            <button
              className={styles.createTodoBtn}
              onClick={() => {
                const p = issue.priority?.name?.toLowerCase();
                setTodoPriority(p === 'high' || p === 'highest' ? 'high' : p === 'medium' ? 'medium' : 'low');
                setTodoDueDate(issue.dueDate?.split('T')[0] ?? '');
                setShowTodoForm(true);
              }}
              disabled={hasActiveTodo}
              title={hasActiveTodo ? 'Aktiv todo finnes allerede' : 'Opprett todo'}
            >
              <CheckSquare size={14} />
              Opprett todo
            </button>
          )}
          <a
            href={`${jiraBaseUrl}/browse/${issue.key}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.openInJiraBtn}
          >
            Åpne i Jira
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </Modal>
  );
}
