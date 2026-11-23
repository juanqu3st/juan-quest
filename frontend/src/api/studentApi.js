import axiosClient, { API_BASE_URL } from './axiosClient';
import {
    getOfflineWorld,
    isOfflineUser,
    resolveOfflineLifeline,
    startOfflineMap,
    submitOfflineChallenge,
    syncOfflineMap,
    timeoutOfflineMap,
    updateOfflineCharacter,
} from '../utils/offlineEngine';

export const studentApi = {
    getWorld: () =>
        isOfflineUser() ? getOfflineWorld() : axiosClient.get('/student/world').then((r) => r.data),
    getLeaderboard: () =>
        isOfflineUser()
            ? Promise.resolve({ play_mode: 'group', groups: [], individuals: [] })
            : axiosClient.get('/student/leaderboard').then((r) => r.data),
    joinSession: (join_code) => axiosClient.post('/student/join-session', { join_code }).then((r) => r.data),
    updateCharacter: (selected_character) =>
        isOfflineUser()
            ? updateOfflineCharacter(selected_character)
            : axiosClient.post('/student/character', { selected_character }).then((r) => r.data),
    updateStatus: (activity_status) =>
        isOfflineUser()
            ? Promise.resolve({ ok: true })
            : axiosClient.post('/student/status', { activity_status }).then((r) => r.data),
    renameGroup: (payload) => {
        const body = typeof payload === 'string' ? { group_name: payload } : payload;
        return axiosClient.patch('/student/group-name', body).then((r) => r.data);
    },
    startMap: (mapId) =>
        isOfflineUser() ? startOfflineMap(mapId) : axiosClient.post(`/student/maps/${mapId}/start`).then((r) => r.data),
    syncMap: (mapId, elapsed_seconds) =>
        isOfflineUser()
            ? syncOfflineMap(mapId, elapsed_seconds)
            : axiosClient.post(`/student/maps/${mapId}/sync`, { elapsed_seconds }).then((r) => r.data),
    syncMapKeepalive: (mapId, elapsed_seconds) => {
        if (isOfflineUser()) {
            syncOfflineMap(mapId, elapsed_seconds).catch(() => {});
            return;
        }
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
        isOfflineUser()
            ? submitOfflineChallenge(mapId, payload)
            : axiosClient.post(`/student/maps/${mapId}/submit`, payload).then((r) => r.data),
    resolveLifeline: (mapId, action) =>
        isOfflineUser()
            ? resolveOfflineLifeline(mapId, action)
            : axiosClient.post(`/student/maps/${mapId}/lifeline`, { action }).then((r) => r.data),
    timeoutMap: (mapId) =>
        isOfflineUser()
            ? timeoutOfflineMap(mapId)
            : axiosClient.post(`/student/maps/${mapId}/timeout`).then((r) => r.data),
};
