import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExternalPortal } from '../types';

interface ExternalPortalState {
  portals: ExternalPortal[];
  addPortal: (portal: Omit<ExternalPortal, 'id' | 'createdAt'>) => void;
  updatePortal: (id: string, updates: Partial<Omit<ExternalPortal, 'id' | 'createdAt'>>) => void;
  deletePortal: (id: string) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export const useExternalPortalStore = create<ExternalPortalState>()(
  persist(
    (set) => ({
      portals: [],

      addPortal: (portal) =>
        set((state) => ({
          portals: [
            ...state.portals,
            { ...portal, id: generateId(), createdAt: new Date().toISOString() },
          ],
        })),

      updatePortal: (id, updates) =>
        set((state) => ({
          portals: state.portals.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      deletePortal: (id) =>
        set((state) => ({ portals: state.portals.filter((p) => p.id !== id) })),
    }),
    { name: 'external-portals-storage' }
  )
);
