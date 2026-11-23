import axiosClient, { API_BASE_URL } from './axiosClient';
import {
    activateMidGameOfflineFailover,
    getOfflineWorld,
    isOfflineUser,
    patchOnlineFailoverProgress,
    resolveOfflineLifeline,
    snapshotOnlineWorldForFailover,
    startOfflineMap,
    submitOfflineChallenge,
    syncOfflineMap,
    timeoutOfflineMap,
    updateOfflineCharacter,
} from '../utils/offlineEngine';

function isNetworkDisconnectError(err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return !err?.response || err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED';
}

export const studentApi = {
    getWorld: async () => {
        if (isOfflineUser()) return getOfflineWorld();
        try {
            const data = await axiosClient.get('/student/world').then((r) => r.data);
            snapshotOnlineWorldForFailover(data);
            return data;
        } catch (err) {
            if (isNetworkDisconnectError(err)) {
                const fo = activateMidGameOfflineFailover();
                if (fo.activated) return getOfflineWorld();
            }
            throw err;
        }
    },
    getLeaderboard: () =>
        isOfflineUser()
            ? Promise.resolve({ play_mode: 'group', groups: [], individuals: [] })
            : axiosClient.get('/student/leaderboard').then((r) => r.data),
    joinSession: (join_code) => axiosClient.post('/student/join-session', { join_code }).then((r) => r.data),
    updateCharacter: async (selected_character) => {
        if (isOfflineUser()) return updateOfflineCharacter(selected_character);
        try {
            return await axiosClient.post('/student/character', { selected_character }).then((r) => r.data);
        } catch (err) {
            if (isNetworkDisconnectError(err) && activateMidGameOfflineFailover().activated) {
                return updateOfflineCharacter(selected_character);
            }
            throw err;
        }
    },
    updateStatus: (activity_status) =>
        isOfflineUser()
            ? Promise.resolve({ ok: true })
            : axiosClient.post('/student/status', { activity_status }).then((r) => r.data),
    renameGroup: (payload) => {
        const body = typeof payload === 'string' ? { group_name: payload } : payload;
        return axiosClient.patch('/student/group-name', body).then((r) => r.data);
    },
    startMap: async (mapId) => {
        if (isOfflineUser()) return startOfflineMap(mapId);
        try {
            const data = await axiosClient.post(`/student/maps/${mapId}/start`).then((r) => r.data);
            patchOnlineFailoverProgress(mapId, data);
            return data;
        } catch (err) {
            if (isNetworkDisconnectError(err) && activateMidGameOfflineFailover(mapId).activated) {
                return startOfflineMap(mapId);
            }
            throw err;
        }
    },
    syncMap: async (mapId, elapsed_seconds) => {
        if (isOfflineUser()) return syncOfflineMap(mapId, elapsed_seconds);
        try {
            const data = await axiosClient.post(`/student/maps/${mapId}/sync`, { elapsed_seconds }).then((r) => r.data);
            patchOnlineFailoverProgress(mapId, data);
            return data;
        } catch (err) {
            if (isNetworkDisconnectError(err) && activateMidGameOfflineFailover(mapId, elapsed_seconds).activated) {
                return syncOfflineMap(mapId, elapsed_seconds);
            }
            throw err;
        }
    },
    syncMapKeepalive: (mapId, elapsed_seconds) => {
        if (isOfflineUser()) {
            syncOfflineMap(mapId, elapsed_seconds).catch(() => {});
            return;
        }
        patchOnlineFailoverProgress(mapId, { time_taken_seconds: elapsed_seconds });
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
    submitChallenge: async (mapId, payload) => {
        if (isOfflineUser()) return submitOfflineChallenge(mapId, payload);
        try {
            const data = await axiosClient.post(`/student/maps/${mapId}/submit`, payload).then((r) => r.data);
            patchOnlineFailoverProgress(mapId, data);
            return data;
        } catch (err) {
            if (
                isNetworkDisconnectError(err) &&
                activateMidGameOfflineFailover(mapId, payload?.elapsed_seconds).activated
            ) {
                return submitOfflineChallenge(mapId, payload);
            }
            throw err;
        }
    },
    resolveLifeline: async (mapId, action) => {
        if (isOfflineUser()) return resolveOfflineLifeline(mapId, action);
        try {
            const data = await axiosClient.post(`/student/maps/${mapId}/lifeline`, { action }).then((r) => r.data);
            patchOnlineFailoverProgress(mapId, data);
            return data;
        } catch (err) {
            if (isNetworkDisconnectError(err) && activateMidGameOfflineFailover(mapId).activated) {
                return resolveOfflineLifeline(mapId, action);
            }
            throw err;
        }
    },
    timeoutMap: async (mapId) => {
        if (isOfflineUser()) return timeoutOfflineMap(mapId);
        try {
            const data = await axiosClient.post(`/student/maps/${mapId}/timeout`).then((r) => r.data);
            patchOnlineFailoverProgress(mapId, data);
            return data;
        } catch (err) {
            if (isNetworkDisconnectError(err) && activateMidGameOfflineFailover(mapId).activated) {
                return timeoutOfflineMap(mapId);
            }
            throw err;
        }
    },
};
