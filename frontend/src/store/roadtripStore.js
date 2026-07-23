import { create } from 'zustand';
import {
  localCreateRoadtrip, localUpdateRoadtrip, localDeleteRoadtrip,
  localCreateStep, localUpdateStep, localDeleteStep,
  localCreateActivity, localDeleteActivity,
  localCreateAccommodation,
  localCreateExpense, localUpdateExpense, localDeleteExpense,
} from '../powersync/localWrite';
import { useAuthStore } from './authStore';

// Accès direct au store sans hook (utilisable hors composant React)
const getUserId = () => useAuthStore.getState().user?.id;

export const useRoadtripStore = create(() => ({

  // ─── Roadtrips ─────────────────────────────────────────────────────────────

  createRoadtrip: (data) => localCreateRoadtrip(data, getUserId()),

  updateRoadtrip: (id, data) => localUpdateRoadtrip(id, data),

  deleteRoadtrip: (id) => localDeleteRoadtrip(id),

  // ─── Steps ─────────────────────────────────────────────────────────────────

  createStep: (data) => localCreateStep(data, getUserId()),

  updateStep: (id, data) => localUpdateStep(id, data),

  deleteStep: (id) => localDeleteStep(id),

  // ─── Activities ────────────────────────────────────────────────────────────

  createActivity: (data) => localCreateActivity(data, getUserId()),

  deleteActivity: (id) => localDeleteActivity(id),

  // ─── Accommodation ─────────────────────────────────────────────────────────

  createAccommodation: (data) => localCreateAccommodation(data, getUserId()),

  // ─── Expenses ──────────────────────────────────────────────────────────────

  createExpense: (data) => localCreateExpense(data, getUserId()),

  updateExpense: (id, data) => localUpdateExpense(id, data),

  deleteExpense: (id) => localDeleteExpense(id),
}));

