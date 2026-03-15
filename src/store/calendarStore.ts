import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AbsenceEntry } from '../types';

interface CalendarState {
  absences: AbsenceEntry[];
  addAbsence: (entry: Omit<AbsenceEntry, 'id'>) => void;
  updateAbsence: (id: string, updates: Partial<AbsenceEntry>) => void;
  deleteAbsence: (id: string) => void;
  getAbsencesByPerson: (accountId: string) => AbsenceEntry[];
  getAbsencesByDateRange: (start: string, end: string) => AbsenceEntry[];
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      absences: [],

      addAbsence: (entry) =>
        set((state) => ({
          absences: [...state.absences, { ...entry, id: generateId() }],
        })),

      updateAbsence: (id, updates) =>
        set((state) => ({
          absences: state.absences.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),

      deleteAbsence: (id) =>
        set((state) => ({
          absences: state.absences.filter((a) => a.id !== id),
        })),

      getAbsencesByPerson: (accountId) =>
        get().absences.filter((a) => a.personAccountId === accountId),

      getAbsencesByDateRange: (start, end) => {
        const s = new Date(start);
        const e = new Date(end);
        return get().absences.filter((a) => {
          const as = new Date(a.startDate);
          const ae = new Date(a.endDate);
          return as <= e && ae >= s;
        });
      },
    }),
    { name: 'calendar-storage' }
  )
);
