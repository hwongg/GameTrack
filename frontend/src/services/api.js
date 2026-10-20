const API_URL = import.meta.env.VITE_API_URL || '/api';
let accessToken = null;
let refreshPromise = null;

export function setAccessToken(token) { accessToken = token || null; }
export function getAccessToken() { return accessToken; }

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    }).then(async response => {
      if (!response.ok) {
        accessToken = null;
        return null;
      }
      const data = await response.json();
      accessToken = data.accessToken || null;
      return accessToken;
    }).catch(() => {
      accessToken = null;
      return null;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
  if (response.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
    }
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.detail || 'Ocurrió un error al consultar la API.');
  }
  if (response.status === 204) return null;
  return response.json();
}
