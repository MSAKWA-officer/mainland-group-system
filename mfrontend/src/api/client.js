
import axios from 'axios';
import i18n from '../i18n';

let token = null;

export const setToken = (value) => {
  token = value;
};

export const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    'https://mainland-group-system.onrender.com/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach access token to API requests
api.interceptors.request.use(
  (config) => {
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Refresh access token only once at a time
let inflight = null;

export const refreshOnce = () => {
  if (!inflight) {
    inflight = api
      .post('/auth/refresh')
      .then((response) => {
        const accessToken = response.data.accessToken;
        setToken(accessToken);
        return accessToken;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
};

// Avoid repeatedly refreshing when authentication endpoints fail
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || '';
    const isAuthEndpoint = url.includes('/auth/');

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;

      try {
        await refreshOnce();
        return api(originalRequest);
      } catch (refreshError) {
        setToken(null);
        window.dispatchEvent(
          new Event('auth:expired')
        );

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Convert API errors to readable messages
export const errMsg = (error) => {
  const apiError = error.response?.data?.error;

  if (
    i18n.resolvedLanguage !== 'en' &&
    apiError?.code &&
    i18n.exists(`errors:${apiError.code}`)
  ) {
    return i18n.t(`errors:${apiError.code}`);
  }

  if (apiError?.message) {
    return apiError.message;
  }

  if (error.request && !error.response) {
    return i18n.t('errors:NETWORK_ERROR');
  }

  return error.message || i18n.t('errors:UNKNOWN');
};

// Extract validation errors from API responses
export const fieldErrs = (error) => {
  const details =
    error.response?.data?.error?.details || [];

  return Object.fromEntries(
    details.map((detail) => [
      detail.field,
      detail.message,
    ])
  );
};
