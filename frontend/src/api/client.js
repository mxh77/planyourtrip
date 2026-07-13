import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import API_URL from './config';

const client = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject JWT token on every request
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// File de requêtes en attente pendant un refresh en cours
let isRefreshing = false;
let refreshQueue = [];

function processQueue(error, token = null) {
  refreshQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  refreshQueue = [];
}

// Auto-refresh on 401
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    console.error('[API ERROR]', {
      url: originalRequest?.url,
      baseURL: originalRequest?.baseURL,
      message: error.message,
      code: error.code,
      status: error.response?.status,
    });

    // 401 → tenter un refresh silencieux (une seule fois par requête)
    if (error.response?.status === 401 && !originalRequest._retried) {
      originalRequest._retried = true;

      if (isRefreshing) {
        // D'autres requêtes attendent déjà le refresh — les mettre en queue
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return client(originalRequest);
        });
      }

      isRefreshing = true;
      const newToken = await useAuthStore.getState().silentRefresh();
      isRefreshing = false;

      if (newToken) {
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return client(originalRequest);
      } else {
        processQueue(error);
        // silentRefresh a déjà vidé le store → navigation vers Login gérée par AppNavigator
      }
    }

    return Promise.reject(error);
  }
);

export default client;

