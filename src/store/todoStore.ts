import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TodoItem, TodoSubtask } from '../types';

interface TodoState {
  todos: TodoItem[];
  addTodo: (todo: Omit<TodoItem, 'id' | 'createdAt' | 'updatedAt' | 'completed'>) => string;
  updateTodo: (id: string, updates: Partial<TodoItem>) => void;
  deleteTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
  linkToJiraIssue: (todoId: string, issueKey: string) => void;
  unlinkFromJiraIssue: (todoId: string) => void;
  getTodosByJiraIssue: (issueKey: string) => TodoItem[];
  getActiveTodos: () => TodoItem[];
  getCompletedTodos: () => TodoItem[];
  addSubtask: (todoId: string, content: string) => void;
  toggleSubtask: (todoId: string, subtaskId: string) => void;
  deleteSubtask: (todoId: string, subtaskId: string) => void;
  reorderActiveTodos: (fromIndex: number, toIndex: number) => void;
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

      getTodosByJiraIssue: (issueKey) => {
        return get().todos.filter((todo) => todo.linkedJiraIssue === issueKey);
      },

      getActiveTodos: () => {
        return get()
          .todos.filter((todo) => !todo.completed)
          .sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            if (a.dueDate && b.dueDate) {
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
      },

      getCompletedTodos: () => {
        return get()
          .todos.filter((todo) => todo.completed)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      },

      addSubtask: (todoId, content) => {
        const subtask: TodoSubtask = {
          id: generateId(),
          content,
          completed: false,
        };
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === todoId
              ? {
                  ...todo,
                  subtasks: [...(todo.subtasks ?? []), subtask],
                  updatedAt: new Date().toISOString(),
                }
              : todo
          ),
        }));
      },

      toggleSubtask: (todoId, subtaskId) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === todoId
              ? {
                  ...todo,
                  subtasks: (todo.subtasks ?? []).map((st) =>
                    st.id === subtaskId ? { ...st, completed: !st.completed } : st
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : todo
          ),
        })),

      deleteSubtask: (todoId, subtaskId) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === todoId
              ? {
                  ...todo,
                  subtasks: (todo.subtasks ?? []).filter((st) => st.id !== subtaskId),
                  updatedAt: new Date().toISOString(),
                }
              : todo
          ),
        })),

      reorderActiveTodos: (fromIndex, toIndex) => {
        const state = get();
        const active = state.todos.filter((t) => !t.completed);
        const completed = state.todos.filter((t) => t.completed);
        const reordered = [...active];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        set({ todos: [...reordered, ...completed] });
      },
    }),
    {
      name: 'todo-storage',
    }
  )
);
