import { useState } from 'react';
import {
  Plus,
  Check,
  Trash2,
  Link as LinkIcon,
  Calendar,
  Flag,
  Edit2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardContent, Button, Input, Modal, Badge } from '../../components/common';
import { useTodoStore } from '../../store/todoStore';
import type { TodoItem } from '../../types';
import styles from './Todos.module.css';

export function Todos() {
  const {
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    getActiveTodos,
    getCompletedTodos,
  } = useTodoStore();

  const [newTodoContent, setNewTodoContent] = useState('');
  const [newTodoPriority, setNewTodoPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const activeTodos = getActiveTodos();
  const completedTodos = getCompletedTodos();

  const handleAddTodo = () => {
    if (!newTodoContent.trim()) return;

    addTodo({
      content: newTodoContent.trim(),
      priority: newTodoPriority,
    });

    setNewTodoContent('');
    setNewTodoPriority('medium');
  };

  const handleUpdateTodo = () => {
    if (!editingTodo) return;
    updateTodo(editingTodo.id, editingTodo);
    setEditingTodo(null);
  };

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'danger';
      case 'medium':
        return 'warning';
      default:
        return 'default';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className={styles.container}>
      {/* Add Todo Section */}
      <Card>
        <CardHeader>
          <h3>Add New Todo</h3>
        </CardHeader>
        <CardContent>
          <div className={styles.addTodoForm}>
            <Input
              placeholder="What needs to be done?"
              value={newTodoContent}
              onChange={(e) => setNewTodoContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTodo();
              }}
              className={styles.todoInput}
            />
            <select
              value={newTodoPriority}
              onChange={(e) => setNewTodoPriority(e.target.value as 'low' | 'medium' | 'high')}
              className={styles.prioritySelect}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <Button onClick={handleAddTodo} icon={<Plus size={16} />}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Todos */}
      <Card>
        <CardHeader>
          <div className={styles.cardHeaderContent}>
            <h3>Active ({activeTodos.length})</h3>
          </div>
        </CardHeader>
        <CardContent>
          {activeTodos.length === 0 ? (
            <p className={styles.empty}>No active todos. Add one above!</p>
          ) : (
            <ul className={styles.todoList}>
              {activeTodos.map((todo) => (
                <li key={todo.id} className={styles.todoItem}>
                  <button
                    className={styles.checkButton}
                    onClick={() => toggleTodo(todo.id)}
                  >
                    <div className={styles.checkbox} />
                  </button>

                  <div className={styles.todoContent}>
                    <span className={styles.todoText}>{todo.content}</span>
                    <div className={styles.todoMeta}>
                      <Badge
                        variant={getPriorityVariant(todo.priority)}
                        size="sm"
                      >
                        <Flag size={10} />
                        {todo.priority}
                      </Badge>
                      {todo.dueDate && (
                        <Badge
                          variant={isOverdue(todo.dueDate) ? 'danger' : 'default'}
                          size="sm"
                        >
                          <Calendar size={10} />
                          {formatDate(todo.dueDate)}
                        </Badge>
                      )}
                      {todo.linkedJiraIssue && (
                        <Badge variant="primary" size="sm">
                          <LinkIcon size={10} />
                          {todo.linkedJiraIssue}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className={styles.todoActions}>
                    <button
                      className={styles.actionButton}
                      onClick={() => setEditingTodo(todo)}
                      title="Rediger"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      className={`${styles.actionButton} ${styles.deleteAction}`}
                      onClick={() => deleteTodo(todo.id)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Completed Todos */}
      <Card>
        <CardHeader>
          <button
            className={styles.expandButton}
            onClick={() => setShowCompleted(!showCompleted)}
          >
            {showCompleted ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            <h3>Completed ({completedTodos.length})</h3>
          </button>
        </CardHeader>
        {showCompleted && (
          <CardContent>
            {completedTodos.length === 0 ? (
              <p className={styles.empty}>No completed todos yet.</p>
            ) : (
              <ul className={styles.todoList}>
                {completedTodos.map((todo) => (
                  <li key={todo.id} className={`${styles.todoItem} ${styles.completed}`}>
                    <button
                      className={styles.checkButton}
                      onClick={() => toggleTodo(todo.id)}
                    >
                      <div className={`${styles.checkbox} ${styles.checked}`}>
                        <Check size={12} />
                      </div>
                    </button>

                    <div className={styles.todoContent}>
                      <span className={styles.todoText}>{todo.content}</span>
                    </div>

                    <div className={styles.todoActions}>
                      <button
                        className={`${styles.actionButton} ${styles.deleteAction}`}
                        onClick={() => deleteTodo(todo.id)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        )}
      </Card>

      {/* Edit Todo Modal */}
      {editingTodo && (
        <Modal
          isOpen={!!editingTodo}
          onClose={() => setEditingTodo(null)}
          title="Edit Todo"
          size="sm"
        >
          <div className={styles.editForm}>
            <Input
              label="Content"
              value={editingTodo.content}
              onChange={(e) =>
                setEditingTodo({ ...editingTodo, content: e.target.value })
              }
            />

            <div className={styles.formField}>
              <label className={styles.formLabel}>Priority</label>
              <select
                value={editingTodo.priority}
                onChange={(e) =>
                  setEditingTodo({
                    ...editingTodo,
                    priority: e.target.value as 'low' | 'medium' | 'high',
                  })
                }
                className={styles.prioritySelect}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <Input
              label="Due Date"
              type="date"
              value={editingTodo.dueDate?.split('T')[0] || ''}
              onChange={(e) =>
                setEditingTodo({
                  ...editingTodo,
                  dueDate: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : undefined,
                })
              }
            />

            <Input
              label="Linked Jira Issue"
              value={editingTodo.linkedJiraIssue || ''}
              onChange={(e) =>
                setEditingTodo({
                  ...editingTodo,
                  linkedJiraIssue: e.target.value || undefined,
                })
              }
              placeholder="e.g., PROJ-123"
            />

            <div className={styles.editActions}>
              <Button onClick={handleUpdateTodo}>Save</Button>
              <Button variant="ghost" onClick={() => setEditingTodo(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
