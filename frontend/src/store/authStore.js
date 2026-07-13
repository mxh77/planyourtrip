import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import API_URL from '../api/config';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      pendingVerificationEmail: null,

      register: async (email, password, name) => {
        const res = await axios.post(`${API_URL}/api/auth/register`, { email, password, name }, { timeout: 10000 });
        if (res.data.requiresVerification) {
          set({ pendingVerificationEmail: email });
        }
        return res.data;
      },

      verifyEmail: async (email, code) => {
        const res = await axios.post(`${API_URL}/api/auth/verify-email`, { email, code }, { timeout: 10000 });
        set({ user: res.data.user, token: res.data.token, refreshToken: res.data.refreshToken, pendingVerificationEmail: null });
        return res.data;
      },

      resendVerification: async (email) => {
        const res = await axios.post(`${API_URL}/api/auth/resend-verification`, { email }, { timeout: 10000 });
        return res.data;
      },

      forgotPassword: async (email) => {
        const res = await axios.post(`${API_URL}/api/auth/forgot-password`, { email }, { timeout: 10000 });
        return res.data;
      },

      resetPassword: async (email, code, newPassword) => {
        const res = await axios.post(`${API_URL}/api/auth/reset-password`, { email, code, newPassword }, { timeout: 10000 });
        return res.data;
      },

      login: async (email, password) => {
        console.log('[AUTH] login URL:', `${API_URL}/api/auth/login`);
        try {
          const res = await axios.post(`${API_URL}/api/auth/login`, { email, password }, { timeout: 10000 });
          set({ user: res.data.user, token: res.data.token, refreshToken: res.data.refreshToken, pendingVerificationEmail: null });
          return res.data;
        } catch (e) {
          console.error('[AUTH] login error:', e.message, e.code, e.response?.status);
          if (e.response?.data?.requiresVerification) {
            set({ pendingVerificationEmail: email });
          }
          throw e;
        }
      },

      // Renouvelle silencieusement l'access token via le refresh token
      // Retourne le nouveau token ou null si le refresh token est invalide/expiré
      silentRefresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return null;
        try {
          const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken }, { timeout: 10000 });
          set({ token: res.data.token, refreshToken: res.data.refreshToken });
          return res.data.token;
        } catch {
          // Refresh token invalide/expiré → on déconnecte
          set({ user: null, token: null, refreshToken: null });
          return null;
        }
      },

      logout: async () => {
        const { refreshToken } = get();
        if (refreshToken) {
          axios.post(`${API_URL}/api/auth/logout`, { refreshToken }).catch(() => {});
        }
        set({ user: null, token: null, refreshToken: null, pendingVerificationEmail: null });
      },

      updateUser: (updates) => {
        set((state) => ({ user: { ...state.user, ...updates } }));
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

