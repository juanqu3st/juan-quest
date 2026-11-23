import { loadOfflinePack, sha256Hex } from './offlinePack';

const OFFLINE_STATE_KEY = 'juanquest_offline_state_v1';
const ONLINE_SNAPSHOT_KEY = 'juanquest_online_failover_snapshot_v1';
const SAVED_QR_HISTORY_KEY = 'juanquest_saved_qr_history_v1';
const COMPLETED_PINS_KEY = 'juanquest_offline_completed_pins_v1';
export const OFFLINE_TOKEN = 'juanquest-offline-session';

function loadCompletedPinsMap() {
    try {
        const raw = localStorage.getItem(COMPLETED_PINS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function saveCompletedPinsMap(mapObj) {
    try {
        localStorage.setItem(COMPLETED_PINS_KEY, JSON.stringify(mapObj));
    } catch {
        // ignore storage quota errors
    }
}

export function getCompletedPinLock(joinCode) {
    const clean = String(joinCode || '').trim().toUpperCase();
    if (!clean) return null;
    const map = loadCompletedPinsMap();
    const rec = map[clean];
    if (!rec || !rec.locked) return null;
    const savedEntry =
        loadSavedQrHistory().find((h) => h.id === rec.submission_id || h.join_code === clean) || null;
    return { ...rec, join_code: clean, savedQr: savedEntry };
}

export function markPinCompletedLocked(joinCode, { qrKey = '', submissionId = '', attempt = 1 } = {}) {
    const clean = String(joinCode || '').trim().toUpperCase();
    if (!clean) return;
    const map = loadCompletedPinsMap();
    const prev = map[clean] || {};
    map[clean] = {
        locked: true,
        attempts: Math.max(Number(prev.attempts || 0), Number(attempt || 1)),
        qr_key: qrKey || prev.qr_key || '',
        submission_id: submissionId || prev.submission_id || '',
        completed_at: new Date().toISOString(),
    };
    saveCompletedPinsMap(map);
}

export function getNextAttemptForPin(joinCode) {
    const clean = String(joinCode || '').trim().toUpperCase();
    if (!clean) return 1;
    const rec = loadCompletedPinsMap()[clean];
    if (!rec) return 1;
    return Math.max(1, Number(rec.attempts || 1) + 1);
}

export async function computeTeacherUnblockCode(joinCode, qrKey) {
    const clean = String(joinCode || '').trim().toUpperCase();
    const key = String(qrKey || '').trim();
    if (!clean || !key) return '';
    return (await sha256Hex(`jq-unblock|${clean}|${key}`)).slice(0, 6).toUpperCase();
}

/**
 * Verifies the teacher's 6-char offline unblock code locally (0 internet required!)
 * and unlocks the Class PIN on this device so the group can rejoin after a lag/freeze.
 */
export async function unlockPinWithTeacherCode(joinCode, enteredCode, fallbackQrKey = '') {
    const cleanCode = String(joinCode || '').trim().toUpperCase();
    const cleanEntered = String(enteredCode || '').replace(/\s+/g, '').toUpperCase();
    if (!cleanCode || cleanEntered.length < 4) {
        return { ok: false, message: 'Ilagay ang 6-character Teacher Unblock Code.' };
    }

    const map = loadCompletedPinsMap();
    const rec = map[cleanCode] || {};
    const key = String(rec.qr_key || fallbackQrKey || '').trim();

    let verified = false;
    if (key) {
        const expected = await computeTeacherUnblockCode(cleanCode, key);
        verified = cleanEntered === expected;
    } else {
        // Fallback when initial entry had no QR key (manual PIN entry)
        verified = cleanEntered === `${cleanCode}OK` || cleanEntered === 'UNBLOCK';
    }

    if (!verified) {
        return { ok: false, message: 'Maling Teacher Unblock Code. Itanong sa iyong guro ang tamang code.' };
    }

    const nextAttempt = Math.max(2, Number(rec.attempts || 1) + 1);
    map[cleanCode] = {
        ...rec,
        locked: false,
        attempts: nextAttempt - 1,
        unblocked_at: new Date().toISOString(),
    };
    saveCompletedPinsMap(map);
    return { ok: true, nextAttempt };
}

export function loadSavedQrHistory() {
    try {
        const raw = localStorage.getItem(SAVED_QR_HISTORY_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

export function saveResultQrToHistory(payload, meta = {}) {
    if (!payload || payload.t !== 'jqr1' || !payload.id) return;
    try {
        const current = loadSavedQrHistory().filter((item) => item?.id !== payload.id);
        const entry = {
            id: payload.id,
            join_code: String(payload.c || '').toUpperCase(),
            class_name: String(meta.className || payload.c || ''),
            group_name: String(payload.g || ''),
            leader_name: String(payload.l || ''),
            play_mode: payload.m === 'individual' ? 'individual' : 'group',
            saved_at: new Date().toISOString(),
            payload,
        };
        const next = [entry, ...current].slice(0, 5);
        localStorage.setItem(SAVED_QR_HISTORY_KEY, JSON.stringify(next));
    } catch {
        // ignore storage quota errors
    }
}

export function isOfflineUser() {
    try {
        if (localStorage.getItem('juanquest_token') === OFFLINE_TOKEN) return true;
        const raw = localStorage.getItem('juanquest_user');
        if (!raw) return false;
        return Boolean(JSON.parse(raw)?.offline_mode);
    } catch {
        return false;
    }
}

export function loadOfflineState() {
    try {
        const raw = localStorage.getItem(OFFLINE_STATE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveOfflineState(state) {
    try {
        localStorage.setItem(OFFLINE_STATE_KEY, JSON.stringify(state));
    } catch {
        // ignore storage restrictions
    }
}

export function clearOfflineSession() {
    try {
        localStorage.removeItem(OFFLINE_STATE_KEY);
        localStorage.removeItem(ONLINE_SNAPSHOT_KEY);
    } catch {
        // ignore
    }
}

/**
 * Quietly snapshots the authenticated online student's live session & 5-map progress
 * so that if Wi-Fi/data drops mid-game (e.g., at Mapa 3), gameplay seamlessly fails over
 * to the local offline engine without losing any completed maps, hearts, or questions!
 */
export function snapshotOnlineWorldForFailover(world) {
    if (!world || world.offline_mode || !world.session) return;
    try {
        const rawUser = localStorage.getItem('juanquest_user');
        const user = rawUser ? JSON.parse(rawUser) : null;
        const progressByMapId = {};
        let maxUnlocked = 1;

        for (const m of world.maps || []) {
            if (m.is_unlocked && m.map_number > maxUnlocked) {
                maxUnlocked = m.map_number;
            }
            if (m.progress) {
                const p = m.progress;
                progressByMapId[m.id] = {
                    score: Number(p.score ?? 0),
                    mistakes_count: Number(p.mistakes_count ?? 0),
                    hearts_remaining: Number(p.hearts_remaining ?? m.max_hearts ?? 3),
                    time_limit_used: Number(p.time_limit_used ?? m.time_limit_seconds ?? 60),
                    time_taken_seconds: Number(p.time_taken_seconds ?? 0),
                    attempts: Number(p.attempts ?? 1),
                    is_completed: Boolean(p.is_completed),
                    completed_challenge_ids: p.completed_challenge_ids || [],
                    failed_challenge_ids: p.failed_challenge_ids || [],
                    pending_lifeline: p.pending_lifeline || null,
                    finish_reason: p.finish_reason || null,
                    earned_points: Number(p.earned_points ?? p.score ?? 0),
                    completed_at: p.completed_at || null,
                };
            }
        }

        const snapshot = {
            session: {
                id: world.session.id || 0,
                join_code: String(world.session.join_code || '').trim().toUpperCase(),
                class_name: String(world.session.class_name || world.session.join_code || '').trim(),
                play_mode: world.session.play_mode === 'individual' ? 'individual' : 'group',
                status: world.session.status || 'active',
                qr_key: String(world.session.offline_qr_key || '').trim(),
                manual_entry: !world.session.offline_qr_key,
                group_id: world.session.group_id ?? null,
                group_name: world.session.group_name ?? null,
                group_number: world.session.group_number ?? null,
                member_names: world.session.member_names ?? null,
                leader_name: String(world.session.leader_name || user?.name || '').trim(),
                can_rename_group: false,
            },
            character: user?.selected_character || 'juan',
            currentMapNumber: Math.max(maxUnlocked, Number(user?.current_map_number || 1)),
            progressByMapId,
        };

        localStorage.setItem(ONLINE_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
        // ignore storage quota errors
    }
}

/**
 * Keeps the online failover snapshot up to date after every single online start/submit/lifeline/sync.
 */
export function patchOnlineFailoverProgress(mapId, resOrProgress) {
    if (!mapId || !resOrProgress) return;
    try {
        const raw = localStorage.getItem(ONLINE_SNAPSHOT_KEY);
        if (!raw) return;
        const snap = JSON.parse(raw);
        const existing = snap.progressByMapId[mapId] || {
            score: 0,
            mistakes_count: 0,
            hearts_remaining: 3,
            time_limit_used: 60,
            time_taken_seconds: 0,
            attempts: 1,
            is_completed: false,
            completed_challenge_ids: [],
            failed_challenge_ids: [],
            pending_lifeline: null,
            finish_reason: null,
            earned_points: 0,
            completed_at: null,
        };

        const p = resOrProgress.progress || resOrProgress;
        snap.progressByMapId[mapId] = {
            ...existing,
            ...(p.score !== undefined ? { score: Number(p.score) } : {}),
            ...(p.final_score !== undefined && p.final_score !== null ? { score: Number(p.final_score) } : {}),
            ...(p.projected_score !== undefined ? { earned_points: Number(p.projected_score) } : {}),
            ...(p.earned_points !== undefined ? { earned_points: Number(p.earned_points) } : {}),
            ...(p.hearts_remaining !== undefined ? { hearts_remaining: Number(p.hearts_remaining) } : {}),
            ...(p.mistakes_count !== undefined ? { mistakes_count: Number(p.mistakes_count) } : {}),
            ...(p.time_limit_used !== undefined ? { time_limit_used: Number(p.time_limit_used) } : {}),
            ...(p.time_taken_seconds !== undefined ? { time_taken_seconds: Number(p.time_taken_seconds) } : {}),
            ...(p.completed_challenge_ids ? { completed_challenge_ids: p.completed_challenge_ids } : {}),
            ...(p.failed_challenge_ids ? { failed_challenge_ids: p.failed_challenge_ids } : {}),
            ...(p.pending_lifeline !== undefined ? { pending_lifeline: p.pending_lifeline } : {}),
            ...(p.finish_reason !== undefined ? { finish_reason: p.finish_reason } : {}),
            ...(p.is_completed !== undefined ? { is_completed: Boolean(p.is_completed) } : {}),
            ...(p.level_ended ? { is_completed: true, completed_at: new Date().toISOString() } : {}),
        };

        if (resOrProgress.current_map_number && Number(resOrProgress.current_map_number) > snap.currentMapNumber) {
            snap.currentMapNumber = Number(resOrProgress.current_map_number);
        }

        localStorage.setItem(ONLINE_SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {
        // ignore storage errors
    }
}

/**
 * Seamlessly transitions an active Online student into Offline Mode mid-game when Wi-Fi/data drops.
 * Preserves all prior map progress + current map questions/hearts/timer and ends with a Verified Result QR!
 */
export function activateMidGameOfflineFailover(activeMapId = null, liveElapsedSeconds = null) {
    if (isOfflineUser()) {
        return { activated: true, alreadyOffline: true };
    }

    const pack = loadOfflinePack();
    if (!pack || !Array.isArray(pack.maps) || pack.maps.length === 0) {
        return { activated: false, reason: 'no_pack' };
    }

    let snap = null;
    try {
        const raw = localStorage.getItem(ONLINE_SNAPSHOT_KEY);
        snap = raw ? JSON.parse(raw) : null;
    } catch {
        snap = null;
    }

    if (!snap || !snap.session || !snap.session.join_code) {
        return { activated: false, reason: 'no_snapshot' };
    }

    // Do not failover while still waiting for teacher go-signal or after session already finished
    if (snap.session.status === 'waiting' || snap.session.status === 'finished') {
        return { activated: false, reason: 'session_not_active' };
    }

    const progressByMapId = { ...(snap.progressByMapId || {}) };
    if (activeMapId && typeof liveElapsedSeconds === 'number' && progressByMapId[activeMapId]) {
        progressByMapId[activeMapId] = {
            ...progressByMapId[activeMapId],
            time_taken_seconds: Math.max(
                Number(progressByMapId[activeMapId].time_taken_seconds || 0),
                Math.max(0, liveElapsedSeconds)
            ),
        };
    }

    const state = {
        submissionId: makeShortId(),
        attempt: 1,
        session: {
            ...snap.session,
            status: 'active',
            failover_from_online: true,
        },
        character: snap.character || 'juan',
        currentMapNumber: Math.max(1, Number(snap.currentMapNumber || 1)),
        progressByMapId,
    };

    saveOfflineState(state);

    try {
        localStorage.setItem('juanquest_token', OFFLINE_TOKEN);
        const rawUser = localStorage.getItem('juanquest_user');
        const prevUser = rawUser ? JSON.parse(rawUser) : {};
        const nextUser = {
            ...prevUser,
            name: prevUser.name || snap.session.leader_name || 'Manlalaro',
            role: 'student',
            selected_character: state.character,
            current_map_number: state.currentMapNumber,
            offline_mode: true,
            failover_from_online: true,
        };
        localStorage.setItem('juanquest_user', JSON.stringify(nextUser));

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('juanquest:failover-offline', { detail: { user: nextUser } }));
        }
    } catch {
        // ignore
    }

    return { activated: true, alreadyOffline: false };
}

function makeShortId() {
    const rand = Math.random().toString(36).slice(2, 7);
    return `jq_${Date.now().toString(36)}_${rand}`;
}

export function startOfflineSession({
    joinCode,
    className,
    playMode = 'group',
    qrKey = '',
    groupName = '',
    leaderName,
    memberNames = '',
    manualEntry = false,
}) {
    const pack = loadOfflinePack();
    if (!pack || !Array.isArray(pack.maps) || pack.maps.length === 0) {
        throw new Error('Hindi pa handa ang mga file ng laro sa device na ito. Kumonekta muna sandali sa internet at buksan ang app.');
    }

    const cleanCode = String(joinCode || '').trim().toUpperCase();
    const cleanLeader = String(leaderName || '').replace(/\s+/g, ' ').trim();
    const cleanGroup = String(groupName || '').replace(/\s+/g, ' ').trim();
    const cleanMembers = String(memberNames || '').trim();
    const mode = playMode === 'individual' ? 'individual' : 'group';

    const attempt = getNextAttemptForPin(cleanCode);

    const state = {
        submissionId: makeShortId(),
        attempt,
        session: {
            id: 0,
            join_code: cleanCode,
            class_name: String(className || cleanCode).trim(),
            play_mode: mode,
            status: 'active',
            qr_key: String(qrKey || '').trim(),
            manual_entry: Boolean(manualEntry || !qrKey),
            group_id: mode === 'group' ? 1 : null,
            group_name: mode === 'group' ? cleanGroup || cleanLeader : null,
            group_number: null,
            member_names: mode === 'group' && cleanMembers !== '' ? cleanMembers : null,
            leader_name: cleanLeader,
            can_rename_group: false,
        },
        character: 'juan',
        currentMapNumber: 1,
        progressByMapId: {},
    };

    saveOfflineState(state);

    const user = {
        id: 'offline-player',
        name: cleanLeader,
        email: null,
        role: 'student',
        section: state.session.class_name,
        selected_character: 'juan',
        current_map_number: 1,
        activity_status: 'exploring_world',
        offline_mode: true,
    };

    return { token: OFFLINE_TOKEN, user };
}

function getMapAndPack(mapId) {
    const pack = loadOfflinePack();
    const state = loadOfflineState();
    if (!pack || !state) {
        throw new Error('Hindi mahanap ang offline session.');
    }
    const map = (pack.maps || []).find((m) => Number(m.id) === Number(mapId));
    if (!map) {
        throw new Error('Hindi mahanap ang mapa.');
    }
    return { pack, state, map };
}

function formatProgressResource(map, p) {
    if (!p) return null;
    const completedIds = p.completed_challenge_ids || [];
    const failedIds = p.failed_challenge_ids || [];
    const resolvedIds = Array.from(new Set([...completedIds, ...failedIds]));
    const timeLimit = Number(p.time_limit_used || map.time_limit_seconds || 60);
    const taken = Number(p.time_taken_seconds || 0);

    return {
        id: map.id,
        map_id: map.id,
        score: Number(p.score || 0),
        mistakes_count: Number(p.mistakes_count || 0),
        hearts_remaining: Number(p.hearts_remaining ?? map.max_hearts ?? 3),
        time_limit_used: timeLimit,
        time_taken_seconds: taken,
        remaining_seconds: Math.max(0, timeLimit - taken),
        attempts: Number(p.attempts || 1),
        is_completed: Boolean(p.is_completed),
        completed_challenge_ids: completedIds,
        failed_challenge_ids: failedIds,
        resolved_challenge_ids: resolvedIds,
        pending_lifeline: p.pending_lifeline || null,
        finish_reason: p.finish_reason || null,
        earned_points: Number(p.earned_points ?? p.score ?? 0),
        completed_at: p.completed_at || null,
    };
}

export async function getOfflineWorld() {
    const pack = loadOfflinePack();
    const state = loadOfflineState();
    if (!pack || !state) {
        throw new Error('Walang aktibong offline session.');
    }

    let totalScore = 0;
    let completedCount = 0;

    const maps = (pack.maps || []).map((map) => {
        const rawProg = state.progressByMapId[map.id] || null;
        const progress = formatProgressResource(map, rawProg);
        if (progress?.is_completed) {
            totalScore += progress.score;
            completedCount += 1;
        }
        return {
            ...map,
            is_unlocked: map.map_number <= state.currentMapNumber,
            progress,
        };
    });

    return {
        offline_mode: true,
        lesson: pack.lesson,
        maps,
        total_score: totalScore,
        max_total_score: pack.max_total_score || 50,
        completed_count: completedCount,
        session: state.session,
        leaderboard: { play_mode: state.session.play_mode, groups: [], individuals: [] },
    };
}

export async function updateOfflineCharacter(selected_character) {
    const state = loadOfflineState();
    if (state) {
        state.character = selected_character === 'pedro' ? 'pedro' : 'juan';
        saveOfflineState(state);
    }
    return { selected_character: state?.character || 'juan' };
}

export async function startOfflineMap(mapId) {
    const { state, map } = getMapAndPack(mapId);
    if (map.map_number > state.currentMapNumber) {
        throw new Error(`Kailangan munang tapusin ang Mapa ${state.currentMapNumber}.`);
    }

    const existing = state.progressByMapId[map.id];
    if (existing?.is_completed) {
        throw new Error('Nakumpleto na ang mapang ito at hindi na maaaring ulitin.');
    }

    if (!existing) {
        state.progressByMapId[map.id] = {
            score: 0,
            mistakes_count: 0,
            hearts_remaining: map.max_hearts ?? 3,
            time_limit_used: Math.max(15, Number(map.time_limit_seconds || 60)),
            time_taken_seconds: 0,
            attempts: 1,
            is_completed: false,
            completed_challenge_ids: [],
            failed_challenge_ids: [],
            pending_lifeline: null,
            finish_reason: null,
            earned_points: 0,
            completed_at: null,
        };
        saveOfflineState(state);
    }

    const p = state.progressByMapId[map.id];
    const formatted = formatProgressResource(map, p);
    return {
        progress: formatted,
        projected_score: formatted.earned_points ?? formatted.score ?? 0,
        max_score: Number(map.perfect_score ?? 10),
    };
}

export async function syncOfflineMap(mapId, elapsed_seconds) {
    const { state, map } = getMapAndPack(mapId);
    const p = state.progressByMapId[map.id];
    if (!p || p.is_completed) return { progress: formatProgressResource(map, p) };

    const isBoard = ['sequence', 'matching'].includes(map.strategy_type);
    const totalCh = Math.max(1, (map.challenges || []).length);
    const maxSec = isBoard ? p.time_limit_used : Math.max(p.time_limit_used * totalCh, 3600);
    p.time_taken_seconds = Math.max(p.time_taken_seconds || 0, Math.min(maxSec, Math.max(0, Number(elapsed_seconds || 0))));
    saveOfflineState(state);

    return { progress: formatProgressResource(map, p) };
}

function pointsPerChallenge(map, totalChallenges) {
    const count = Math.max(1, totalChallenges);
    return Math.max(1, Math.round(Number(map.perfect_score || 10) / count));
}

async function evaluateOfflineChallenge(strategyType, challenge, submission, salt) {
    const ah = challenge.answer_hash || {};
    const id = challenge.id;

    if (strategyType === 'multiple_choice' || strategyType === 'decision_quest') {
        const pts = strategyType === 'multiple_choice' ? 1 : 2;
        const choice = String(submission.choice || '').trim().toUpperCase();
        const digest = await sha256Hex(`${id}:choice:${choice}:${salt}`);
        const ok = digest === ah.hash;
        return { is_correct: ok, earned_points: ok ? pts : 0 };
    }

    if (strategyType === 'four_pics') {
        const word = String(submission.word || '').trim().replace(/\s+/g, '').toUpperCase();
        const digest = await sha256Hex(`${id}:word:${word}:${salt}`);
        const ok = digest === ah.hash;
        return { is_correct: ok, earned_points: ok ? 2 : 0 };
    }

    if (strategyType === 'sequence') {
        const submittedOrder = (submission.order || []).map((v) => Number(v));
        const slotHashes = ah.slot_hashes || {};
        const total = Number(ah.total || Object.keys(slotHashes).length);
        let correctPositions = 0;

        for (let i = 0; i < total; i += 1) {
            if (submittedOrder[i] !== undefined) {
                const digest = await sha256Hex(`${id}:seq:${i}:${submittedOrder[i]}:${salt}`);
                if (digest === slotHashes[i] || digest === slotHashes[String(i)]) {
                    correctPositions += 1;
                }
            }
        }
        const allMatch = total > 0 && submittedOrder.length === total && correctPositions === total;
        return {
            is_correct: allMatch,
            earned_points: Math.min(10, correctPositions * 2),
            details: { correct_positions: correctPositions, total_positions: total },
        };
    }

    if (strategyType === 'matching') {
        const submittedPairs = submission.pairs || {};
        const pairHashes = ah.pair_hashes || {};
        const keys = Object.keys(pairHashes);
        const total = Number(ah.total || keys.length);
        const matched = {};
        let correctCount = 0;

        for (const leftId of keys) {
            const val = String(submittedPairs[leftId] ?? '').trim().toUpperCase();
            const digest = await sha256Hex(`${id}:match:${leftId}:${val}:${salt}`);
            const ok = digest === pairHashes[leftId];
            matched[leftId] = ok;
            if (ok) correctCount += 1;
        }
        const allMatch = total > 0 && Object.keys(submittedPairs).length === total && correctCount === total;
        return {
            is_correct: allMatch,
            earned_points: Math.min(10, correctCount * 2),
            details: { pair_status: matched, correct_pairs: correctCount, total_pairs: total },
        };
    }

    return { is_correct: false, earned_points: 0 };
}

function finalizeOfflineProgress(state, pack, map, p, reason) {
    const perfect = Number(map.perfect_score ?? 10);
    const minFloor = Number(map.min_floor_score ?? 2);
    const earned = Number(p.earned_points ?? p.score ?? 0);
    p.score = Math.min(perfect, Math.max(minFloor, earned));
    p.earned_points = p.score;
    p.is_completed = true;
    p.pending_lifeline = null;
    p.finish_reason = reason;
    p.completed_at = new Date().toISOString();

    const maxMapNum = Math.max(...(pack.maps || []).map((m) => m.map_number), 5);
    const nextNum = Math.min(maxMapNum, map.map_number + 1);
    if (nextNum > state.currentMapNumber) {
        state.currentMapNumber = nextNum;
    }
}

function buildOfflineResponse(state, map, p, isCorrect, feedback, mapCompleted, details = null, finishReason = null, lifelinePrompt = false) {
    const perfect = Number(map.perfect_score ?? 10);
    const minFloor = Number(map.min_floor_score ?? 2);
    const projected = p.is_completed ? p.score : Math.min(perfect, Number(p.earned_points ?? p.score ?? 0));
    const completedIds = p.completed_challenge_ids || [];
    const failedIds = p.failed_challenge_ids || [];
    const resolvedIds = Array.from(new Set([...completedIds, ...failedIds]));

    return {
        is_correct: isCorrect,
        feedback,
        details,
        level_ended: mapCompleted,
        map_completed: mapCompleted,
        finish_reason: finishReason,
        awaiting_lifeline: lifelinePrompt,
        lifeline_prompt: lifelinePrompt,
        pending_lifeline: p.is_completed ? null : (p.pending_lifeline || null),
        hearts_remaining: p.hearts_remaining,
        mistakes_count: Number(p.mistakes_count || 0),
        earned_points: projected,
        projected_score: projected,
        max_score: perfect,
        final_score: mapCompleted ? p.score : null,
        min_floor_score: minFloor,
        completed_challenge_ids: completedIds,
        failed_challenge_ids: failedIds,
        resolved_challenge_ids: resolvedIds,
        current_map_number: state.currentMapNumber,
        next_map_number: state.currentMapNumber,
        progress: formatProgressResource(map, p),
    };
}

export async function submitOfflineChallenge(mapId, payload) {
    const { pack, state, map } = getMapAndPack(mapId);
    if (!state.progressByMapId[map.id]) {
        await startOfflineMap(mapId);
    }
    const freshState = loadOfflineState();
    const p = freshState.progressByMapId[map.id];
    if (p.is_completed) {
        throw new Error('Nakumpleto na ang mapang ito at naitala na ang iyong puntos.');
    }
    if (p.pending_lifeline) {
        throw new Error('Pumili muna kung gagamit ka ng puso upang sumagot muli o tutuloy sa susunod.');
    }

    const challenge = (map.challenges || []).find((c) => Number(c.id) === Number(payload.challenge_id));
    if (!challenge) {
        throw new Error('Hindi mahanap ang tanong.');
    }

    const completedIds = p.completed_challenge_ids || [];
    const failedIds = p.failed_challenge_ids || [];
    if (completedIds.includes(challenge.id) || failedIds.includes(challenge.id)) {
        return buildOfflineResponse(freshState, map, p, completedIds.includes(challenge.id), map.feedback_correct, false);
    }

    const totalChallenges = (map.challenges || []).length;
    const isBoard = ['sequence', 'matching'].includes(map.strategy_type);
    const maxSec = isBoard ? p.time_limit_used : Math.max(p.time_limit_used * Math.max(1, totalChallenges), 3600);
    p.time_taken_seconds = Math.max(
        p.time_taken_seconds || 0,
        Math.min(maxSec, Math.max(0, Number(payload.elapsed_seconds || 0)))
    );

    const check = await evaluateOfflineChallenge(map.strategy_type, challenge, payload.submission || {}, pack.pack_salt);
    const prevEarned = Number(p.earned_points || 0);

    // CASE 1: CORRECT
    if (check.is_correct) {
        const nextCompleted = Array.from(new Set([...completedIds, challenge.id]));
        p.completed_challenge_ids = nextCompleted;
        p.failed_challenge_ids = failedIds;
        p.pending_lifeline = null;

        let earnedPoints = isBoard
            ? Number(map.perfect_score ?? 10)
            : Math.min(Number(map.perfect_score ?? 10), nextCompleted.length * pointsPerChallenge(map, totalChallenges));

        const resolvedCount = new Set([...nextCompleted, ...failedIds]).size;
        const allResolved = resolvedCount >= Math.max(1, totalChallenges);
        if (allResolved && failedIds.length === 0) {
            earnedPoints = Number(map.perfect_score ?? 10);
        }
        p.earned_points = earnedPoints;
        p.score = earnedPoints;

        if (allResolved) {
            finalizeOfflineProgress(freshState, pack, map, p, 'completed');
        }
        saveOfflineState(freshState);

        return buildOfflineResponse(
            freshState,
            map,
            p,
            true,
            map.feedback_correct,
            allResolved,
            check.details || null,
            allResolved ? 'completed' : null,
            false
        );
    }

    // CASE 2: WRONG -> Check Heart Lifeline
    const boardAttemptEarned = isBoard
        ? Math.min(Number(map.perfect_score ?? 10), Math.max(prevEarned, Number(check.earned_points || 0)))
        : prevEarned;

    // 2A: Still has hearts -> pause for HeartLifelineModal
    if (p.hearts_remaining > 0) {
        const ptsAtStake = isBoard
            ? Math.max(0, Number(map.perfect_score ?? 10) - boardAttemptEarned)
            : pointsPerChallenge(map, totalChallenges);
        p.pending_lifeline = {
            challenge_id: challenge.id,
            is_board: isBoard,
            attempt_earned: boardAttemptEarned,
            points_at_stake: ptsAtStake,
            wrong_choice: payload.submission?.choice ?? null,
        };
        saveOfflineState(freshState);

        return buildOfflineResponse(
            freshState,
            map,
            p,
            false,
            map.feedback_wrong,
            false,
            check.details || null,
            null,
            true
        );
    }

    // 2B: 0 hearts remaining -> auto 0 pts for this item and immediately advance/finish
    p.mistakes_count = Number(p.mistakes_count || 0) + 1;
    p.pending_lifeline = null;

    if (isBoard) {
        p.earned_points = boardAttemptEarned;
        p.score = boardAttemptEarned;
        finalizeOfflineProgress(freshState, pack, map, p, 'completed');
        saveOfflineState(freshState);
        return buildOfflineResponse(
            freshState,
            map,
            p,
            false,
            'Ubos na ang iyong mga puso! Naitala na ang iyong nakuha sa mapang ito.',
            true,
            check.details || null,
            'completed',
            false
        );
    }

    const nextFailed = Array.from(new Set([...failedIds, challenge.id]));
    p.failed_challenge_ids = nextFailed;
    const resolvedCount = new Set([...completedIds, ...nextFailed]).size;
    const allResolved = resolvedCount >= Math.max(1, totalChallenges);

    if (allResolved) {
        finalizeOfflineProgress(freshState, pack, map, p, 'completed');
    }
    saveOfflineState(freshState);

    return buildOfflineResponse(
        freshState,
        map,
        p,
        false,
        allResolved
            ? 'Natapos na ang lahat ng tanong. Naitala na ang iyong kabuuang puntos!'
            : 'Ubos na ang iyong mga puso — 0 puntos sa tanong na ito. Tumuloy sa susunod!',
        allResolved,
        check.details || null,
        allResolved ? 'completed' : null,
        false
    );
}

export async function resolveOfflineLifeline(mapId, action) {
    const { pack, state, map } = getMapAndPack(mapId);
    const p = state.progressByMapId[map.id];
    if (!p || p.is_completed || !p.pending_lifeline) {
        throw new Error('Walang nakabinbing desisyon para sa puso.');
    }

    const pending = p.pending_lifeline;
    const challengeId = Number(pending.challenge_id);
    const isBoard = Boolean(pending.is_board);
    const attemptEarned = Number(pending.attempt_earned || 0);
    const totalChallenges = (map.challenges || []).length;

    if (action === 'use_heart') {
        if (p.hearts_remaining <= 0) {
            throw new Error('Wala ka nang natitirang puso.');
        }
        p.hearts_remaining = Math.max(0, p.hearts_remaining - 1);
        p.mistakes_count = Number(p.mistakes_count || 0) + 1;
        p.pending_lifeline = null;
        saveOfflineState(state);

        return {
            ...buildOfflineResponse(
                state,
                map,
                p,
                false,
                `Gumamit ka ng 1 puso (${p.hearts_remaining} natira). Pumili muli ng tamang sagot!`,
                false
            ),
            action: 'use_heart',
            lifeline_action: 'use_heart',
        };
    }

    // action === 'skip'
    p.mistakes_count = Number(p.mistakes_count || 0) + 1;
    p.pending_lifeline = null;

    if (isBoard) {
        p.earned_points = attemptEarned;
        p.score = attemptEarned;
        finalizeOfflineProgress(state, pack, map, p, 'completed');
        saveOfflineState(state);

        return {
            ...buildOfflineResponse(
                state,
                map,
                p,
                false,
                `Itinala ang iyong ${p.score} / ${map.perfect_score ?? 10} puntos at naitabi ang natirang puso.`,
                true,
                null,
                'completed'
            ),
            action: 'skip',
            lifeline_action: 'skip',
        };
    }

    const nextFailed = Array.from(new Set([...(p.failed_challenge_ids || []), challengeId]));
    p.failed_challenge_ids = nextFailed;
    const resolvedCount = new Set([...(p.completed_challenge_ids || []), ...nextFailed]).size;
    const allResolved = resolvedCount >= Math.max(1, totalChallenges);

    if (allResolved) {
        finalizeOfflineProgress(state, pack, map, p, 'completed');
    }
    saveOfflineState(state);

    return {
        ...buildOfflineResponse(
            state,
            map,
            p,
            false,
            allResolved
                ? `Natapos na ang mapa. Naitala ang iyong ${p.score} / ${map.perfect_score ?? 10} puntos.`
                : '0 pts sa tanong na ito — naitabi ang iyong puso. Tumuloy sa susunod na tanong.',
            allResolved,
            null,
            allResolved ? 'completed' : null
        ),
        action: 'skip',
        lifeline_action: 'skip',
    };
}

export async function timeoutOfflineMap(mapId) {
    const { pack, state, map } = getMapAndPack(mapId);
    if (!state.progressByMapId[map.id]) {
        await startOfflineMap(mapId);
    }
    const freshState = loadOfflineState();
    const p = freshState.progressByMapId[map.id];
    if (p.is_completed) {
        return buildOfflineResponse(
            freshState,
            map,
            p,
            false,
            'Nakumpleto na ang mapang ito.',
            true,
            null,
            'already_completed'
        );
    }

    const isBoard = ['sequence', 'matching'].includes(map.strategy_type);
    const totalCh = Math.max(1, (map.challenges || []).length);
    const maxSec = isBoard ? p.time_limit_used : Math.max(p.time_limit_used * totalCh, 3600);
    p.time_taken_seconds = Math.min(maxSec, Math.max(p.time_taken_seconds || 0, p.time_limit_used));
    p.hearts_remaining = 0;

    finalizeOfflineProgress(freshState, pack, map, p, 'timeout');
    saveOfflineState(freshState);

    return buildOfflineResponse(
        freshState,
        map,
        p,
        false,
        `Naubos na ang oras. Naitala ang iyong ${p.score} puntos (minimum ${map.min_floor_score ?? 2} pts) upang makapagpatuloy.`,
        true,
        null,
        'timeout'
    );
}

/**
 * Canonical Result QR string matching backend OfflineQrService::buildResultCanonicalString().
 */
export function buildResultCanonicalString(data) {
    const code = String(data.c || '').trim().toUpperCase();
    const mode = data.m === 'individual' ? 'individual' : 'group';
    const group = String(data.g || '').trim();
    const leader = String(data.l || '').trim();
    const scores = (data.s || []).map((v) => Number(v || 0)).join(',');
    const hearts = (data.h || []).map((v) => Number(v || 0)).join(',');
    const times = (data.tm || []).map((v) => Number(v || 0)).join(',');
    const subId = String(data.id || '').trim();
    const att = Math.max(1, Number(data.att || 1));
    const base = `${code}|${mode}|${group}|${leader}|${scores}|${hearts}|${times}|${subId}`;
    return att > 1 ? `${base}|att=${att}` : base;
}

export async function verifyOfflineResultSignature(data, sessionQrKey) {
    if (!data || data.t !== 'jqr1') return false;
    if (data.sig === 'manual') return false;
    if (!sessionQrKey) return false;
    const canonical = buildResultCanonicalString(data);
    const expected = (await sha256Hex(`${canonical}|${sessionQrKey}`)).slice(0, 16);
    return String(data.sig || '').toLowerCase() === expected;
}

/**
 * Generate the compact tamper-checked Result QR payload for the Teacher Scanner.
 */
export async function buildSignedResultQrPayload() {
    const pack = loadOfflinePack();
    const state = loadOfflineState();
    if (!pack || !state) return null;

    const maps = [...(pack.maps || [])].sort((a, b) => a.map_number - b.map_number);
    const scores = [];
    const hearts = [];
    const times = [];
    const reasons = [];

    for (const m of maps) {
        const p = state.progressByMapId[m.id];
        scores.push(Number(p?.score ?? 0));
        hearts.push(Number(p?.hearts_remaining ?? 0));
        times.push(Number(p?.time_taken_seconds ?? 0));
        reasons.push(p?.finish_reason === 'timeout' ? 't' : 'c');
    }

    const attempt = Math.max(1, Number(state.attempt || 1));
    const base = {
        t: 'jqr1',
        c: state.session.join_code,
        m: state.session.play_mode,
        g: state.session.group_name || '',
        l: state.session.leader_name,
        mb: state.session.member_names || '',
        s: scores,
        h: hearts,
        tm: times,
        fr: reasons,
        id: state.submissionId,
        ...(attempt > 1 ? { att: attempt } : {}),
    };

    const qrKey = state.session.qr_key || '';
    const sig =
        !state.session.manual_entry && qrKey
            ? (await sha256Hex(`${buildResultCanonicalString(base)}|${qrKey}`)).slice(0, 16)
            : 'manual';

    const signedPayload = { ...base, sig };

    // Auto-archive completed 5-map Result QR in device backup history & lock PIN against silent replay
    const allMapsCompleted = maps.length > 0 && maps.every((m) => Boolean(state.progressByMapId[m.id]?.is_completed));
    if (allMapsCompleted) {
        saveResultQrToHistory(signedPayload, { className: state.session.class_name });
        markPinCompletedLocked(state.session.join_code, {
            qrKey,
            submissionId: state.submissionId,
            attempt,
        });
    }

    return signedPayload;
}
