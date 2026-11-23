import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
export const STORAGE_BASE_URL = import.meta.env.VITE_STORAGE_URL || 'http://localhost:8000/storage';

export function resolveStorageUrl(relativePath) {
    if (!relativePath) return null;
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
    }
    const clean = relativePath.replace(/^\/?(storage\/)?/, '');
    return `${STORAGE_BASE_URL.replace(/\/$/, '')}/${clean}`;
}

/**
 * CORS-enabled media URL for video/audio streaming & Browser Cache API caching.
 * Uses external URLs (e.g. Cloudinary) directly, and routes local storage paths through /api/v1/media/*.
 */
export function resolveMediaUrl(relativePath) {
    if (!relativePath) return null;
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
    }
    const clean = relativePath.replace(/^\/?(storage\/)?/, '');
    return `${API_BASE_URL.replace(/\/$/, '')}/media/${clean}`;
}

const axiosClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        Accept: 'application/json',
    },
});

axiosClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('juanquest_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

axiosClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('juanquest_token');
            localStorage.removeItem('juanquest_user');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default axiosClient;
