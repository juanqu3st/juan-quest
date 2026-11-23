import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, FastForward, LogOut, Pencil, QrCode, Star, Trophy, User, Users, WifiOff } from 'lucide-react';
import { studentApi } from '../../api/studentApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { clearStageResume, loadStageResume } from '../../utils/stageResume';
import { unlockAudio } from '../../utils/gameAudio';
import WorldMapCanvas from '../../components/three/WorldMapCanvas';
import StageModal from '../../components/game/StageModal';
import PadlockUnlockOverlay from '../../components/game/PadlockUnlockOverlay';
import LeaderboardDrawer from '../../components/game/LeaderboardDrawer';
import GameCompletionModal from '../../components/game/GameCompletionModal';
import MyGroupModal from '../../components/game/MyGroupModal';

function loadOpenedMapIds(storageKey) {
    try {
        const raw = localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
        return new Set();
    }
}

function saveOpenedMapIds(storageKey, idSet) {
    try {
        localStorage.setItem(storageKey, JSON.stringify([...idSet]));
    } catch {
        // ignore storage quota restrictions
    }
}

function unlockedMax(maps) {
    return Math.max(1, ...(maps || []).filter((m) => m.is_unlocked).map((m) => m.map_number));
}

function getInitials(name = '') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'JQ';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function StudentWorldPage() {
    const { user, updateUser, logout } = useAuth();
    const { showToast } = useToast();
    const [world, setWorld] = useState(null);
    const [loadingWorld, setLoadingWorld] = useState(true);
    const [charMapNumber, setCharMapNumber] = useState(user?.current_map_number || 1);
    const [targetMapNumber, setTargetMapNumber] = useState(user?.current_map_number || 1);
    const [isWalking, setIsWalking] = useState(false);
    const [activeStageMapId, setActiveStageMapId] = useState(null);
    const [unlockingStage, setUnlockingStage] = useState(null);
    const [canvasPausedForUnlock, setCanvasPausedForUnlock] = useState(false);
    const [openedMapIds, setOpenedMapIds] = useState(() => new Set());
    const [resumePayload, setResumePayload] = useState(null);
    const [completionOpen, setCompletionOpen] = useState(false);
    const [groupModalOpen, setGroupModalOpen] = useState(false);
    const openOnArrivalRef = useRef(false);
    const lockScreenProjectorRef = useRef(new Map());
    const firstLoadRef = useRef(true);
    const prevSessionStatusRef = useRef(null);
    const lastWorldFetchRef = useRef(0);

    const openedStorageKey = `juanquest_opened_maps_${user?.id}_${world?.session?.id || 'solo'}`;

    useEffect(() => {
        if (!world) return;
        const stored = loadOpenedMapIds(openedStorageKey);
        for (const m of world.maps || []) {
            if (m.progress) stored.add(m.id);
        }
        setOpenedMapIds(stored);
    }, [openedStorageKey, world]);

    const tourKey = `juanquest_tour_seen_${user?.id}`;
    const [tourActive, setTourActive] = useState(() => {
        if (loadStageResume(user?.id)) return false;
        return !localStorage.getItem(tourKey);
    });
    const [leaderboardOpen, setLeaderboardOpen] = useState(false);

    const loadWorld = useCallback(async () => {
        try {
            lastWorldFetchRef.current = Date.now();
            const data = await studentApi.getWorld();
            setWorld(data);

            const nextStatus = data.session?.status || null;
            if (prevSessionStatusRef.current === 'waiting' && nextStatus === 'active') {
                setGroupModalOpen(false);
                showToast(
                    'success',
                    'Nagsimula na ang laro! Pindutin ang Mapa 1 upang magsimula.',
                    'Simula na!'
                );
            }
            prevSessionStatusRef.current = nextStatus;

            const current = unlockedMax(data.maps);
            updateUser({ current_map_number: current });

            if (firstLoadRef.current) {
                firstLoadRef.current = false;
                setCharMapNumber(current);
                setTargetMapNumber(current);

                const canPlaySession = !nextStatus || nextStatus === 'active';
                const saved = loadStageResume(user?.id);
                const activeServerMap = (data.maps || []).find(
                    (m) => m.progress && !m.progress.is_completed
                );
                if (canPlaySession && activeServerMap) {
                    setTourActive(false);
                    setCharMapNumber(activeServerMap.map_number);
                    setTargetMapNumber(activeServerMap.map_number);
                    setResumePayload(saved?.mapId === activeServerMap.id ? saved : null);
                    setActiveStageMapId(activeServerMap.id);
                } else if (canPlaySession && saved?.mapId) {
                    const savedMap = (data.maps || []).find(
                        (m) =>
                            m.id === saved.mapId &&
                            m.is_unlocked &&
                            !m.progress?.is_completed
                    );
                    if (savedMap && ['scene_guide', 'pre_game_lobby'].includes(saved.step)) {
                        setTourActive(false);
                        setCharMapNumber(savedMap.map_number);
                        setTargetMapNumber(savedMap.map_number);
                        setResumePayload(saved);
                        setActiveStageMapId(savedMap.id);
                    } else {
                        clearStageResume(user?.id);
                    }
                }
            }
            return data;
        } finally {
            setLoadingWorld(false);
        }
    }, [user?.id, showToast]);

    useEffect(() => {
        loadWorld();
        const onFocus = () => {
            if (Date.now() - lastWorldFetchRef.current > 5000) {
                loadWorld().catch(() => {});
            }
        };
        window.addEventListener('focus', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
        };
    }, [loadWorld]);

    // While session is waiting, quietly poll every 3s so group assignments, renames, and Teacher Start appear live
    useEffect(() => {
        if (world?.session?.status !== 'waiting' || activeStageMapId || completionOpen) {
            return undefined;
        }
        const timer = setInterval(() => {
            loadWorld().catch(() => {});
        }, 3000);
        return () => clearInterval(timer);
    }, [world?.session?.status, activeStageMapId, completionOpen, loadWorld]);

    const finishTour = () => {
        setTourActive(false);
        localStorage.setItem(tourKey, '1');
    };

    const handleSwitchCharacter = async (char) => {
        if ((user.selected_character || 'juan') === char) return;
        updateUser({ selected_character: char });
        const label = char === 'pedro' ? 'Pedro' : 'Juan';
        showToast('info', `Si ${label} na ang gamit mong karakter.`);
        await studentApi.updateCharacter(char).catch(() => {});
    };

    const walkTo = (mapNumber, openWhenThere) => {
        openOnArrivalRef.current = openWhenThere;
        setTargetMapNumber(mapNumber);
        setIsWalking(true);
    };

    const markMapOpened = useCallback(
        (mapId) => {
            setOpenedMapIds((prev) => {
                if (prev.has(mapId)) return prev;
                const next = new Set(prev);
                next.add(mapId);
                saveOpenedMapIds(openedStorageKey, next);
                return next;
            });
        },
        [openedStorageKey]
    );

    const openMapWithUnlockOrDirect = useCallback(
        (map, fallbackOrigin = null) => {
            if (!map) return;
            const alreadyOpened = openedMapIds.has(map.id) || Boolean(map.progress);
            if (!alreadyOpened) {
                unlockAudio();
                const projected = lockScreenProjectorRef.current.get(map.map_number)?.();
                const origin = projected || fallbackOrigin || {
                    x: window.innerWidth / 2,
                    y: window.innerHeight * 0.45,
                };
                setResumePayload(null);
                setUnlockingStage({ map, origin });
                return;
            }
            setResumePayload(null);
            setActiveStageMapId(map.id);
        },
        [openedMapIds]
    );

    useEffect(() => {
        if (!unlockingStage) {
            setCanvasPausedForUnlock(false);
            return undefined;
        }
        // Let Three.js render 1 frame with the roof padlock hidden, then freeze WebGL for locked 60fps unlock FX!
        const id = setTimeout(() => setCanvasPausedForUnlock(true), 40);
        return () => clearTimeout(id);
    }, [unlockingStage]);

    const handleEnterMap = (map, screenOrigin) => {
        if (tourActive || activeStageMapId || unlockingStage || completionOpen || groupModalOpen) return;

        const sessionStatus = world?.session?.status;
        if (sessionStatus === 'waiting') {
            showToast(
                'warning',
                'Hindi pa nagsisimula ang laro. Antabayanan ang go-signal ng iyong guro bago pumasok sa mapa.',
                'Naghihintay sa Guro.'
            );
            return;
        }
        if (sessionStatus === 'finished') {
            showToast(
                'locked',
                'Tapos na ang sesyon ng klase at sarado na ang mga mapa.',
                'Tapos na ang Laro.'
            );
            return;
        }

        if (!map.is_unlocked && !map.progress?.is_completed) {
            showToast('locked', `Tapusin muna ang Mapa ${map.map_number - 1} upang mabuksan ito.`, 'Naka-lock.');
            return;
        }
        const willPlayUnlockAnim = !openedMapIds.has(map.id) && !map.progress;
        // Skip silent world refresh during unlock animation so React/WebGL won't stall mid-flight!
        if (!willPlayUnlockAnim && Date.now() - lastWorldFetchRef.current > 3000) {
            loadWorld().catch(() => {});
        }
        if (isWalking) {
            if (targetMapNumber === map.map_number) openOnArrivalRef.current = true;
            else walkTo(map.map_number, true);
            return;
        }
        if (charMapNumber === map.map_number) {
            openMapWithUnlockOrDirect(map, screenOrigin);
            return;
        }
        walkTo(map.map_number, true);
    };

    const handleArrived = (arrived) => {
        setIsWalking(false);
        setCharMapNumber(arrived);
        if (!openOnArrivalRef.current) return;
        openOnArrivalRef.current = false;
        const dest = world?.maps?.find((m) => m.map_number === arrived);
        if (dest) {
            setTimeout(() => openMapWithUnlockOrDirect(dest), 220);
        }
    };

    const handleStageFinished = async (_nextMapNum, finishedMapNumber) => {
        setActiveStageMapId(null);
        setResumePayload(null);
        clearStageResume(user?.id);
        const data = await loadWorld().catch(() => null);
        if (!data) return;

        const totalMapsCount = (data.maps || []).length;
        const allDone = totalMapsCount > 0 && (data.completed_count || 0) >= totalMapsCount;
        if (allDone || (totalMapsCount > 0 && finishedMapNumber >= totalMapsCount)) {
            setCompletionOpen(true);
            return;
        }

        const next = unlockedMax(data.maps);
        if (next > charMapNumber) walkTo(next, false);
    };

    const handleCloseStage = () => {
        setActiveStageMapId(null);
        setResumePayload(null);
        clearStageResume(user?.id);
        loadWorld().catch(() => {});
    };

    const handleToggleLeaderboard = async () => {
        const next = !leaderboardOpen;
        setLeaderboardOpen(next);
        if (next) {
            try {
                const lb = await studentApi.getLeaderboard();
                setWorld((prev) => (prev ? { ...prev, leaderboard: lb } : prev));
            } catch {
                // keep cached leaderboard
            }
        }
    };

    if (loadingWorld || !world) {
        return (
            <div className="min-h-dvh bg-[#FAF8F5] flex items-center justify-center text-sm font-medium text-stone-600 px-4">
                Inihahanda ang mapa ng JuanQuest...
            </div>
        );
    }

    const maps = world.maps || [];
    const activeStageMap = activeStageMapId ? maps.find((m) => m.id === activeStageMapId) || null : null;
    const allMapsCompleted = maps.length > 0 && (world.completed_count || 0) >= maps.length;
    const isOfflineMode = Boolean(world.offline_mode);
    const sessionStatus = world.session?.status || null;
    const isGroupMode = world.session?.play_mode === 'group';
    const isWaitingSession = !isOfflineMode && sessionStatus === 'waiting';
    const isFinishedSession = !isOfflineMode && sessionStatus === 'finished';

    return (
        <div className="relative w-full h-dvh overflow-hidden bg-[#8CCCF5] select-none touch-none">
            <WorldMapCanvas
                maps={maps}
                characterKey={user.selected_character || 'juan'}
                currentMapNumber={user.current_map_number || 1}
                startMapNumber={charMapNumber}
                targetMapNumber={targetMapNumber}
                isWalking={isWalking}
                tourActive={tourActive}
                isSessionWaiting={isWaitingSession}
                openedMapIds={openedMapIds}
                unlockingMapId={unlockingStage?.map?.id || null}
                lockScreenProjectorRef={lockScreenProjectorRef}
                paused={Boolean(activeStageMap || canvasPausedForUnlock || completionOpen || groupModalOpen)}
                onEnterMap={handleEnterMap}
                onArrived={handleArrived}
                onTourCardChange={() => {}}
                onTourFinish={finishTour}
            />

            {/* Single-Row Responsive Top HUD (Zero overlap with Dynamic Island or Top-Center Toast) */}
            <div className="pointer-events-none fixed top-0 inset-x-0 z-20 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4 flex items-start justify-between gap-2">
                {/* Left Dock: Identity + ONLY ONE Clickable Group Chip + Score */}
                <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-stone-200/90 shadow-sm rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-2 sm:gap-3 min-w-0 max-w-[calc(100%-108px)] sm:max-w-none">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-orange-50 border border-orange-200/80 text-[#C2410C] text-[10px] sm:text-[11px] font-extrabold flex items-center justify-center shrink-0">
                        {getInitials(user.name)}
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <p className="text-[11px] sm:text-xs font-bold text-stone-900 leading-tight truncate max-w-[105px] sm:max-w-[180px]">
                                {user.name}
                            </p>
                            {isOfflineMode && (
                                <span
                                    title="Offline Mode"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold shrink-0"
                                >
                                    <WifiOff className="w-2.5 h-2.5" />
                                    <span className="hidden sm:inline">Offline</span>
                                </span>
                            )}
                            {isWaitingSession && (
                                <span
                                    title="Waiting"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    <span className="hidden sm:inline">Waiting</span>
                                </span>
                            )}
                            {isFinishedSession && (
                                <span className="px-1.5 py-0.5 rounded-md bg-stone-200 text-stone-700 text-[10px] font-bold shrink-0">
                                    Tapos
                                </span>
                            )}
                        </div>

                        {isGroupMode ? (
                            isOfflineMode ? (
                                <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold bg-stone-100 text-stone-700 max-w-full">
                                    <Users className="w-3 h-3 text-[#C2410C] shrink-0" />
                                    <span className="max-w-[90px] sm:max-w-[135px] truncate">
                                        {world.session.group_name || 'Aking Pangkat'}
                                    </span>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        loadWorld().catch(() => {});
                                        setGroupModalOpen(true);
                                    }}
                                    className={`mt-0.5 inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold transition cursor-pointer max-w-full ${
                                        world.session.can_rename_group
                                            ? 'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100'
                                            : 'bg-stone-100 hover:bg-stone-200/80 text-stone-700'
                                    }`}
                                >
                                    <Users className="w-3 h-3 text-[#C2410C] shrink-0" />
                                    <span className="max-w-[90px] sm:max-w-[135px] truncate">
                                        {world.session.group_name || 'Aking Pangkat'}
                                    </span>
                                    {world.session.can_rename_group && (
                                        <Pencil className="w-2.5 h-2.5 text-amber-700 ml-0.5 shrink-0" />
                                    )}
                                </button>
                            )
                        ) : world.session ? (
                            <p className="text-[10px] sm:text-[11px] font-medium text-stone-500 mt-0.5 truncate max-w-[115px] sm:max-w-[160px]">
                                {world.session.class_name}
                            </p>
                        ) : null}
                    </div>

                    <div className="h-6 sm:h-7 w-px bg-stone-200/90 shrink-0" />

                    <div className="inline-flex items-center gap-1 sm:gap-1.5 pr-0.5 sm:pr-1 text-[11px] sm:text-xs font-extrabold text-stone-900 tabular-nums shrink-0">
                        <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 fill-amber-400 shrink-0" />
                        <span>
                            {world.total_score}
                            <span className="font-medium text-stone-400">/{world.max_total_score}</span>
                        </span>
                    </div>
                </div>

                {/* Right Dock: Compact 40px+ Icons on Phone; Full Switcher + Labels on Tablet/Desktop */}
                <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-stone-200/90 shadow-sm rounded-2xl p-1 flex items-center gap-1 shrink-0">
                    <div className="hidden sm:flex bg-stone-100/90 rounded-xl p-0.5 items-center gap-0.5">
                        {['juan', 'pedro'].map((char) => (
                            <button
                                key={char}
                                type="button"
                                onClick={() => handleSwitchCharacter(char)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize inline-flex items-center gap-1 transition cursor-pointer ${
                                    (user.selected_character || 'juan') === char
                                        ? 'bg-[#C2410C] text-white shadow-2xs'
                                        : 'text-stone-600 hover:text-stone-900'
                                }`}
                            >
                                <User className="w-3.5 h-3.5" />
                                {char}
                            </button>
                        ))}
                    </div>

                    {allMapsCompleted && (
                        <button
                            type="button"
                            onClick={() => setCompletionOpen(true)}
                            aria-label={isOfflineMode ? 'Result QR' : 'Score Review'}
                            title={isOfflineMode ? 'Result QR' : 'Score Review'}
                            className="min-w-[38px] min-h-[38px] sm:min-h-[34px] px-2 sm:px-3 py-1.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                        >
                            {isOfflineMode ? (
                                <QrCode className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            ) : (
                                <Award className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            )}
                            <span className="hidden sm:inline">
                                {isOfflineMode ? 'Result QR' : 'Score Review'}
                            </span>
                        </button>
                    )}

                    {!isOfflineMode && (
                        <button
                            type="button"
                            onClick={handleToggleLeaderboard}
                            aria-label="Rankings"
                            title="Rankings"
                            className="min-w-[38px] min-h-[38px] sm:min-h-[34px] px-2 sm:px-3 py-1.5 rounded-xl hover:bg-stone-100 text-stone-700 hover:text-stone-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                        >
                            <Trophy className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#C2410C]" />
                            <span className="hidden sm:inline">Rankings</span>
                        </button>
                    )}

                    <div className="hidden sm:block h-5 w-px bg-stone-200/90 mx-0.5" />

                    <button
                        type="button"
                        onClick={() => {
                            clearStageResume(user?.id);
                            logout();
                        }}
                        aria-label="Lumabas"
                        title="Lumabas"
                        className="min-w-[38px] min-h-[38px] sm:min-h-[34px] px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-rose-50 text-stone-500 hover:text-rose-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                        <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">Lumabas</span>
                    </button>
                </div>
            </div>

            {/* Single Sleek Bottom Thumb-Zone Dock (NO duplicate Edit Pangkat button!) */}
            <div className="pointer-events-none fixed bottom-0 inset-x-0 z-20 px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] flex justify-center">
                {tourActive ? (
                    <button
                        type="button"
                        onClick={finishTour}
                        className="pointer-events-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold text-xs sm:text-sm inline-flex items-center gap-2 shadow-md cursor-pointer transition"
                    >
                        <FastForward className="w-4 h-4" />
                        <span>Laktawan</span>
                    </button>
                ) : (
                    !isWalking && !completionOpen && (
                        <div className="pointer-events-auto w-full max-w-md sm:w-auto sm:max-w-xl bg-white/95 backdrop-blur-md border border-stone-200/90 shadow-md rounded-2xl px-3.5 py-2 flex items-center justify-between sm:justify-center gap-3 text-xs">
                            <span className="inline-flex items-center gap-2 font-semibold text-stone-700 min-w-0">
                                {isWaitingSession && (
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                                )}
                                <span className="truncate">
                                    {isWaitingSession
                                        ? 'Naghihintay sa go-signal ng guro'
                                        : isFinishedSession
                                            ? 'Tapos na ang sesyon · Tingnan ang Rankings'
                                            : allMapsCompleted
                                                ? isOfflineMode
                                                    ? 'Tapos na! Pindutin ang Result QR sa itaas'
                                                    : 'Natapos mo na lahat ng mapa'
                                                : 'Pindutin ang mapa upang magsimula'}
                                </span>
                            </span>

                            {/* Mobile Thumb-Zone Character Switcher (Hidden on sm+ where it's in top-right) */}
                            <div className="sm:hidden bg-stone-100 rounded-xl p-0.5 inline-flex items-center gap-0.5 shrink-0">
                                {['juan', 'pedro'].map((char) => (
                                    <button
                                        key={char}
                                        type="button"
                                        onClick={() => handleSwitchCharacter(char)}
                                        className={`min-h-[34px] px-3 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                                            (user.selected_character || 'juan') === char
                                                ? 'bg-[#C2410C] text-white shadow-2xs'
                                                : 'text-stone-600'
                                        }`}
                                    >
                                        {char}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )
                )}
            </div>

            {!isOfflineMode && isGroupMode && (
                <MyGroupModal
                    open={groupModalOpen}
                    onClose={() => setGroupModalOpen(false)}
                    session={world.session}
                    onRenamed={async (newName) => {
                        await loadWorld().catch(() => {});
                        if (newName) {
                            showToast('success', `Na-save ang pangkat "${newName}".`, 'Na-save.');
                        }
                    }}
                />
            )}

            <LeaderboardDrawer
                open={leaderboardOpen}
                onClose={() => setLeaderboardOpen(false)}
                leaderboard={world.leaderboard}
                currentUserId={user.id}
                playMode={world.session?.play_mode}
                maxTotalScore={world.max_total_score || 50}
            />

            <GameCompletionModal
                open={completionOpen}
                user={user}
                world={world}
                onClose={() => setCompletionOpen(false)}
                onOpenRankings={() => {
                    setLeaderboardOpen(true);
                    studentApi
                        .getLeaderboard()
                        .then((lb) => setWorld((prev) => (prev ? { ...prev, leaderboard: lb } : prev)))
                        .catch(() => {});
                }}
            />

            {activeStageMap && (
                <StageModal
                    key={activeStageMap.id}
                    userId={user.id}
                    map={activeStageMap}
                    lesson={world.lesson}
                    totalMaps={maps.length || 5}
                    initialResume={resumePayload}
                    onClose={handleCloseStage}
                    onStageFinished={handleStageFinished}
                />
            )}

            {unlockingStage && (
                <PadlockUnlockOverlay
                    origin={unlockingStage.origin}
                    onRevealStage={() => {
                        markMapOpened(unlockingStage.map.id);
                        setResumePayload(null);
                        setActiveStageMapId(unlockingStage.map.id);
                    }}
                    onComplete={() => setUnlockingStage(null)}
                />
            )}
        </div>
    );
}
