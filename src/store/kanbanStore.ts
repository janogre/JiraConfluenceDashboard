import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KanbanColumn, KanbanCard } from '../types';

interface KanbanState {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  addColumn: (column: Omit<KanbanColumn, 'id' | 'order'>) => void;
  updateColumn: (id: string, updates: Partial<KanbanColumn>) => void;
  deleteColumn: (id: string) => void;
  reorderColumns: (columns: KanbanColumn[]) => void;
  addCard: (card: Omit<KanbanCard, 'id' | 'order' | 'createdAt' | 'updatedAt'>) => void;
  updateCard: (id: string, updates: Partial<KanbanCard>) => void;
  deleteCard: (id: string) => void;
  moveCard: (cardId: string, targetColumnId: string, newOrder: number) => void;
  getCardsByColumn: (columnId: string) => KanbanCard[];
  linkJiraIssueToCard: (cardId: string, issueKey: string) => void;
  unlinkJiraIssueFromCard: (cardId: string) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

const defaultColumns: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog', order: 0, jiraStatusMapping: ['Backlog', 'Open'] },
  { id: 'todo', title: 'To Do', order: 1, jiraStatusMapping: ['To Do', 'Selected for Development'] },
  { id: 'in-progress', title: 'In Progress', order: 2, jiraStatusMapping: ['In Progress', 'In Development'] },
  { id: 'review', title: 'Review', order: 3, jiraStatusMapping: ['In Review', 'Code Review'] },
  { id: 'done', title: 'Done', order: 4, jiraStatusMapping: ['Done', 'Closed', 'Resolved'] },
];

export const useKanbanStore = create<KanbanState>()(
  persist(
    (set, get) => ({
      columns: defaultColumns,
      cards: [],

      addColumn: (column) =>
        set((state) => ({
          columns: [
            ...state.columns,
            {
              ...column,
              id: generateId(),
              order: state.columns.length,
            },
          ],
        })),

      updateColumn: (id, updates) =>
        set((state) => ({
          columns: state.columns.map((col) =>
            col.id === id ? { ...col, ...updates } : col
          ),
        })),

      deleteColumn: (id) =>
        set((state) => ({
          columns: state.columns.filter((col) => col.id !== id),
          cards: state.cards.filter((card) => card.columnId !== id),
        })),

      reorderColumns: (columns) => set({ columns }),

      addCard: (card) =>
        set((state) => {
          const columnCards = state.cards.filter((c) => c.columnId === card.columnId);
          const now = new Date().toISOString();
          return {
            cards: [
              ...state.cards,
              {
                ...card,
                id: generateId(),
                order: columnCards.length,
                createdAt: now,
                updatedAt: now,
              },
            ],
          };
        }),

      updateCard: (id, updates) =>
        set((state) => ({
          cards: state.cards.map((card) =>
            card.id === id
              ? { ...card, ...updates, updatedAt: new Date().toISOString() }
              : card
          ),
        })),

      deleteCard: (id) =>
        set((state) => ({
          cards: state.cards.filter((card) => card.id !== id),
        })),

      moveCard: (cardId, targetColumnId, newOrder) =>
        set((state) => {
          const card = state.cards.find((c) => c.id === cardId);
          if (!card) return state;

          const updatedCards = state.cards.map((c) => {
            if (c.id === cardId) {
              return {
                ...c,
                columnId: targetColumnId,
                order: newOrder,
                updatedAt: new Date().toISOString(),
              };
            }
            return c;
          });

          return { cards: updatedCards };
        }),

      getCardsByColumn: (columnId) => {
        return get()
          .cards.filter((card) => card.columnId === columnId)
          .sort((a, b) => a.order - b.order);
      },

      linkJiraIssueToCard: (cardId, issueKey) =>
        set((state) => ({
          cards: state.cards.map((card) =>
            card.id === cardId
              ? { ...card, linkedJiraIssue: issueKey, updatedAt: new Date().toISOString() }
              : card
          ),
        })),

      unlinkJiraIssueFromCard: (cardId) =>
        set((state) => ({
          cards: state.cards.map((card) =>
            card.id === cardId
              ? { ...card, linkedJiraIssue: undefined, updatedAt: new Date().toISOString() }
              : card
          ),
        })),
    }),
    {
      name: 'kanban-storage',
    }
  )
);
