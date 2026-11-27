import axiosClient from './axiosClient';

export const authApi = {
    previewSession: (joinCode) =>
        axiosClient.get('/auth/session-preview', { params: { join_code: joinCode } }).then((r) => r.data),
    joinByCode: (payload) => axiosClient.post('/auth/join', payload).then((r) => r.data),
    login: (payload) => axiosClient.post('/auth/login', payload).then((r) => r.data),
    me: () => axiosClient.get('/auth/me').then((r) => r.data),
    logout: () => axiosClient.post('/auth/logout').then((r) => r.data),
};
