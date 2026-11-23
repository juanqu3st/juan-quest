// Persists the student's active stage screen, timer, and unsent draft choices
// across page reloads or closing & reopening the browser.

const PREFIX = 'juanquest_resume_v1_';

function keyFor(userId) {
    return `${PREFIX}${userId || 'anon'}`;
}

export function loadStageResume(userId) {
    if (!userId) return null;
    try {
        const raw = localStorage.getItem(keyFor(userId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

export function saveStageResume(userId, patch) {
    if (!userId) return;
    try {
        const prev = loadStageResume(userId) || {};
        const next = {
            ...prev,
            ...patch,
            drafts: {
                ...(prev.drafts || {}),
                ...(patch.drafts || {}),
            },
            updatedAt: Date.now(),
        };
        localStorage.setItem(keyFor(userId), JSON.stringify(next));
    } catch {
        // ignore storage errors
    }
}

export function clearStageResume(userId) {
    if (!userId) return;
    try {
        localStorage.removeItem(keyFor(userId));
    } catch {
        // ignore storage errors
    }
}
