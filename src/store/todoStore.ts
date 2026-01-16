import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TodoItem } from '../types';

interface TodoState {
  todos: TodoItem[];
  addTodo: (todo: Omit<TodoItem, 'id' | 'createdAt' | 'updatedAt' | 'completed'>) => string;
  updateTodo: (id: string, updates: Partial<TodoItem>) => void;
  deleteTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
  linkToKanbanCard: (todoId: string, cardId: string) => void;
  unlinkFromKanbanCard: (todoId: string) => void;
  linkToJiraIssue: (todoId: string, issueKey: string) => void;
  unlinkFromJiraIssue: (todoId: string) => void;
  getTodosByKanbanCard: (cardId: string) => TodoItem[];
  getTodosByJiraIssue: (issueKey: string) => TodoItem[];
  getActiveTodos: () => TodoItem[];
  getCompletedTodos: () => TodoItem[];
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: [],

      addTodo: (todo) => {
        const id = generateId();
        const now = new Date().toISOString();
        set((state) => ({
          todos: [
            ...state.todos,
            {
              ...todo,
              id,
              completed: false,
              createdAt: now,
              updatedAt: now,
            },
          ],
        }));
        return id;
      },

      updateTodo: (id, updates) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id
              ? { ...todo, ...updates, updatedAt: new Date().toISOString() }
              : todo
          ),
        })),

      deleteTodo: (id) =>
        set((state) => ({
          todos: state.todos.filter((todo) => todo.id !== id),
        })),

      toggleTodo: (id) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id
              ? { ...todo, completed: !todo.completed, updatedAt: new Date().toISOString() }
              : todo
          ),
        })),

      linkToKanbanCard: (todoId, cardId) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === todoId
              ? { ...todo, linkedKanbanCard: cardId, updatedAt: new Date().toISOString() }
              : todo
          ),
        })),

      unlinkFromKanbanCard: (todoId) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === todoId
              ? { ...todo, linkedKanbanCard: undefined, updatedAt: new Date().toISOString() }
              : todo
          ),
        })),

      linkToJiraIssue: (todoId, issueKey) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === todoId
              ? { ...todo, linkedJiraIssue: issueKey, updatedAt: new Date().toISOString() }
              : todo
          ),
        })),

      unlinkFromJiraIssue: (todoId) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === todoId
              ? { ...todo, linkedJiraIssue: undefined, updatedAt: new Date().toISOString() }
              : todo
          ),
        })),

      getTodosByKanbanCard: (cardId) => {
        return get().todos.filter((todo) => todo.linkedKanbanCard === cardId);
      },

      getTodosByJiraIssue: (issueKey) => {
        return get().todos.filter((todo) => todo.linkedJiraIssue === issueKey);
      },

      getActiveTodos: () => {
        return get()
          .todos.filter((todo) => !todo.completed)
          .sort((a, b) => {
            // Sort by priority first (high > medium > low)
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            // Then by due date
            if (a.dueDate && b.dueDate) {
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            // Then by creation date
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
      },

      getCompletedTodos: () => {
        return get()
          .todos.filter((todo) => todo.completed)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      },
    }),
    {
      name: 'todo-storage',
    }
  )
);
