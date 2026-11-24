import axiosClient from './axiosClient';

export const teacherApi = {
    listSessions: () => axiosClient.get('/teacher/sessions').then((r) => r.data),
    createSession: (payload) => axiosClient.post('/teacher/sessions', payload).then((r) => r.data),
    getSessionLobby: (sessionId) => axiosClient.get(`/teacher/sessions/${sessionId}`).then((r) => r.data),
    deleteSession: (sessionId) => axiosClient.delete(`/teacher/sessions/${sessionId}`).then((r) => r.data),
    toggleLock: (sessionId) => axiosClient.post(`/teacher/sessions/${sessionId}/lock`).then((r) => r.data),
    updateSessionStatus: (sessionId, status) =>
        axiosClient.post(`/teacher/sessions/${sessionId}/status`, { status }).then((r) => r.data),
    renameGroup: (groupId, payload) => {
        const body = typeof payload === 'string' ? { group_name: payload } : payload;
        return axiosClient.patch(`/teacher/groups/${groupId}`, body).then((r) => r.data);
    },

    getMonitor: (sessionId) => axiosClient.get(`/teacher/sessions/${sessionId}/monitor`).then((r) => r.data),
    importOfflineResult: (sessionId, qr_payload, allow_manual = false) =>
        axiosClient
            .post(`/teacher/sessions/${sessionId}/offline-import`, { qr_payload, allow_manual })
            .then((r) => r.data),
    resetParticipant: (sessionId, studentId, map_number = null) =>
        axiosClient
            .post(`/teacher/sessions/${sessionId}/participants/${studentId}/reset`, { map_number })
            .then((r) => r.data),
    exportCsv: (sessionId) =>
        axiosClient
            .get(`/teacher/sessions/${sessionId}/export`, { responseType: 'blob' })
            .then((r) => r.data),

    getCms: () => axiosClient.get('/teacher/cms').then((r) => r.data),
    updateLesson: (lessonId, formData) =>
        axiosClient
            .post(`/teacher/cms/lessons/${lessonId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
            .then((r) => r.data),
    updateMap: (mapId, payload) => {
        if (payload instanceof FormData) {
            return axiosClient
                .post(`/teacher/cms/maps/${mapId}`, payload, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                .then((r) => r.data);
        }
        return axiosClient.put(`/teacher/cms/maps/${mapId}`, payload).then((r) => r.data);
    },
    storeChallenge: (mapId, formData) =>
        axiosClient
            .post(`/teacher/cms/maps/${mapId}/challenges`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
            .then((r) => r.data),
    updateChallenge: (challengeId, formData) =>
        axiosClient
            .post(`/teacher/cms/challenges/${challengeId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
            .then((r) => r.data),
    deleteChallenge: (challengeId) =>
        axiosClient.delete(`/teacher/cms/challenges/${challengeId}`).then((r) => r.data),
};
