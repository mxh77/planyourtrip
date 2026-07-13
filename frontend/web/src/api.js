import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Injecte le token depuis localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Sur 401 : tente un refresh silencieux
let refreshing = false;
let queue = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthRoute = original?.url?.startsWith('/auth/');
    if (err.response?.status === 401 && !original._retry && !isAuthRoute) {
      original._retry = true;

      if (refreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject, config: original });
        });
      }

      refreshing = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('no refresh token');

        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        localStorage.setItem('token', data.token);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);

        api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
        queue.forEach(({ resolve, config }) => {
          config.headers.Authorization = `Bearer ${data.token}`;
          resolve(api(config));
        });
        queue = [];
        return api(original);
      } catch {
        queue.forEach(({ reject }) => reject(err));
        queue = [];
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export default api;
