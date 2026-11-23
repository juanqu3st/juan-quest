import axiosClient, { API_BASE_URL } from './axiosClient';

export const studentApi = {
    getWorld: () => axiosClient.get('/student/world').then((r) => r.data),
    getLeaderboard: () => axiosClient.get('/student/leaderboard').then((r) => r.data),
    joinSession: (join_code) => axiosClient.post('/student/join-session', { join_code }).then((r) => r.data),
    updateCharacter: (selected_character) =>
        axiosClient.post('/student/character', { selected_character }).then((r) => r.data),
    updateStatus: (activity_status) =>
        axiosClient.post('/student/status', { activity_status }).then((r) => r.data),
    renameGroup: (payload) => {
        const body = typeof payload === 'string' ? { group_name: payload } : payload;
        return axiosClient.patch('/student/group-name', body).then((r) => r.data);
    },
    startMap: (mapId) => axiosClient.post(`/student/maps/${mapId}/start`).then((r) => r.data),
    syncMap: (mapId, elapsed_seconds) =>
        axiosClient.post(`/student/maps/${mapId}/sync`, { elapsed_seconds }).then((r) => r.data),
    syncMapKeepalive: (mapId, elapsed_seconds) => {
        const token = localStorage.getItem('juanquest_token');
        if (!token || !mapId) return;
        try {
            fetch(`${API_BASE_URL.replace(/\/$/, '')}/student/maps/${mapId}/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ elapsed_seconds }),
                keepalive: true,
            }).catch(() => {});
        } catch {
            // ignore keepalive failure on teardown
        }
    },
    submitChallenge: (mapId, payload) =>
        axiosClient.post(`/student/maps/${mapId}/submit`, payload).then((r) => r.data),
    resolveLifeline: (mapId, action) =>
        axiosClient.post(`/student/maps/${mapId}/lifeline`, { action }).then((r) => r.data),
    timeoutMap: (mapId) => axiosClient.post(`/student/maps/${mapId}/timeout`).then((r) => r.data),
};
