import axios from 'axios';
const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 15000, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((config) => { if (typeof FormData !== 'undefined' && config.data instanceof FormData) config.headers.delete('Content-Type'); return config; });
api.interceptors.response.use((response) => response.data, (error) => {
  const message = error.response?.data?.message || error.response?.data?.error || error.message || 'Request failed. Please try again.';
  return Promise.reject(new Error(message));
});
export default api;
