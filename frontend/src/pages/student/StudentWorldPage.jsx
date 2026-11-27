import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, CheckCircle2, ChevronDown, HelpCircle, Home, LogOut, QrCode, Sparkles, Star, Trophy, Users, WifiOff } from 'lucide-react';
import { studentApi } from '../../api/studentApi';
import { useAuth } from '../../context/AuthContext';
import { usePwa } from '../../context/PwaContext';
import { useToast } from '../../context/ToastContext';
import { useSmartPoll } from '../../hooks/useSmartPoll';
import { clearStageResume, loadStageResume } from '../../utils/stageResume';
import { activateMidGameOfflineFailover } from '../../utils/offlineEngine';
import { unlockAudio } from '../../utils/gameAudio';
import { getCharacterMeta, normalizeCharacterKey } from '../../utils/characters';
import { PAHINGAHAN_STOP } from '../../components/three/worldConfig';
import WorldMapCanvas from '../../components/three/WorldMapCanvas';
import StageModal from '../../components/game/StageModal';
import PadlockUnlockOverlay from '../../components/game/PadlockUnlockOverlay';
import LeaderboardDrawer from '../../components/game/LeaderboardDrawer';
import GameCompletionModal from '../../components/game/GameCompletionModal';
import MyGroupModal from '../../components/game/MyGroupModal';
import StudentOnboardingGuide from '../../components/game/StudentOnboardingGuide';
import CharacterPickerModal from '../../components/game/CharacterPickerModal';

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
    const { setGameplayActive } = usePwa();
    const { showToast } = useToast();

    // Suppress PWA Force Update overlay while the student is actively inside the 3D world / game timer
    useEffect(() => {
        setGameplayActive?.(true);
        return () => setGameplayActive?.(false);
    }, [setGameplayActive]);
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
    const [outroOpen, setOutroOpen] = useState(false);
    const [outroReplayMode, setOutroReplayMode] = useState(false);
    const [completionOpen, setCompletionOpen] = useState(false);
    const [groupModalOpen, setGroupModalOpen] = useState(false);
    const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
    const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
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
    const guideSeenKey = `juanquest_guide_seen_${user?.id}`;
    const [tourActive, setTourActive] = useState(() => {
        if (loadStageResume(user?.id)) return false;
        return !localStorage.getItem(tourKey);
    });
    const [tourMapIndex, setTourMapIndex] = useState(0);
    const [guideOpen, setGuideOpen] = useState(() => {
        if (loadStageResume(user?.id)) return false;
        const sawTour = Boolean(localStorage.getItem(tourKey));
        const sawGuide = Boolean(localStorage.getItem(guideSeenKey));
        return sawTour && !sawGuide;
    });
    const [guideStep, setGuideStep] = useState(null);
    const [leaderboardOpen, setLeaderboardOpen] = useState(false);

    const worldVersionRef = useRef(null);

    const loadWorld = useCallback(async ({ conditional = false } = {}) => {
        try {
            lastWorldFetchRef.current = Date.now();
            const sinceVer = conditional ? worldVersionRef.current : null;
            const data = await studentApi.getWorld(sinceVer);
            if (data?.version) {
                worldVersionRef.current = data.version;
            }
            if (data?.unchanged) {
                return null;
            }
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
                const allDoneOnLoad =
                    (data.maps || []).length > 0 && (data.completed_count || 0) >= (data.maps || []).length;
                if (allDoneOnLoad) {
                    setTourActive(false);
                    setGuideOpen(false);
                }
                const initialStop = allDoneOnLoad ? PAHINGAHAN_STOP : current;
                setCharMapNumber(initialStop);
                setTargetMapNumber(initialStop);

                const canPlaySession = !nextStatus || nextStatus === 'active';
                const saved = loadStageResume(user?.id);
                const activeServerMap = (data.maps || []).find(
                    (m) => m.progress && !m.progress.is_completed
                );
                if (canPlaySession && activeServerMap) {
                    setTourActive(false);
                    setGuideOpen(false);
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
                        setGuideOpen(false);
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
        const refreshOnResume = () => {
            if (document.visibilityState === 'hidden') return;
            if (Date.now() - lastWorldFetchRef.current > 5000) {
                loadWorld().catch(() => {});
            }
        };
        window.addEventListener('focus', refreshOnResume);
        document.addEventListener('visibilitychange', refreshOnResume);
        return () => {
            window.removeEventListener('focus', refreshOnResume);
            document.removeEventListener('visibilitychange', refreshOnResume);
        };
    }, [loadWorld]);

    // Smart conditional poll ONLY while waiting in lobby & tab is visible:
    // sends ?since_ver= so 100 waiting students trigger 0 MySQL queries until Teacher clicks Start or updates groups!
    useSmartPoll({
        enabled: Boolean(
            world?.session?.status === 'waiting' &&
                !world?.offline_mode &&
                !activeStageMapId &&
                !completionOpen
        ),
        baseIntervalMs: 3000,
        maxIntervalMs: 12000,
        resetKey: world?.session?.id || null,
        onTick: async () => Boolean(await loadWorld({ conditional: true })),
    });

    // Lightweight 20s heartbeat while online so Teacher Live Monitor immediately detects disconnected devices (>45s)
    useEffect(() => {
        if (!world || world.offline_mode || world.session?.status === 'finished') return undefined;
        const heartbeat = setInterval(() => {
            if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
            const status = activeStageMapId ? 'in_game' : 'exploring_world';
            studentApi.updateStatus(status).catch(() => {});
        }, 20000);
        return () => clearInterval(heartbeat);
    }, [world?.offline_mode, world?.session?.status, activeStageMapId]);

    // Seamless Online -> Offline mid-game failover listener (continues playing without reset -> Result QR at end!)
    useEffect(() => {
        const handleFailoverTriggered = () => {
            setWorld((prev) => (prev ? { ...prev, offline_mode: true } : prev));
            setLeaderboardOpen(false);
            setGroupModalOpen(false);
            showToast(
                'warning',
                'Nawala ang internet — tuloy lang ang laro! Ipakita ang Result QR sa guro pagkatapos ng Mapa 5.',
                'Offline Mode.'
            );
        };

        const handleBrowserOffline = () => {
            if (!world || world.offline_mode || world.session?.status !== 'active') return;
            const res = activateMidGameOfflineFailover(activeStageMapId);
            if (!res.activated) {
                showToast(
                    'warning',
                    'Naputol ang koneksyon. Huwag isara ang app habang naghihintay ng signal.',
                    'Walang Signal.'
                );
            }
        };

        window.addEventListener('juanquest:failover-offline', handleFailoverTriggered);
        window.addEventListener('offline', handleBrowserOffline);
        return () => {
            window.removeEventListener('juanquest:failover-offline', handleFailoverTriggered);
            window.removeEventListener('offline', handleBrowserOffline);
        };
    }, [world?.offline_mode, world?.session?.status, activeStageMapId, showToast]);

    const finishTour = () => {
        setTourActive(false);
        localStorage.setItem(tourKey, '1');
        if (!localStorage.getItem(guideSeenKey)) {
            setGuideOpen(true);
        }
    };

    const finishGuide = () => {
        setGuideOpen(false);
        localStorage.setItem(guideSeenKey, '1');
    };

    const finishOutro = () => {
        const wasReplay = outroReplayMode;
        setOutroOpen(false);
        setOutroReplayMode(false);
        if (!wasReplay) {
            setCompletionOpen(true);
        }
    };

    const handleCloseCompletion = () => {
        setCompletionOpen(false);
        const totalMapsCount = (world?.maps || []).length;
        const doneAll = totalMapsCount > 0 && (world?.completed_count || 0) >= totalMapsCount;
        if (doneAll && charMapNumber !== PAHINGAHAN_STOP && !isWalking) {
            walkTo(PAHINGAHAN_STOP, false);
        }
    };

    const handleSelectPahingahan = () => {
        if (tourActive || guideOpen || outroOpen || activeStageMapId || unlockingStage || completionOpen || groupModalOpen) return;
        const totalMapsCount = (world?.maps || []).length;
        const doneAll = totalMapsCount > 0 && (world?.completed_count || 0) >= totalMapsCount;
        if (!doneAll) {
            showToast(
                'info',
                `Tapusin muna ang lahat ng 5 mapa upang makapagpahinga si ${activeCharMeta.shortName} sa bagong kubo at duyan.`,
                'Pahingahan.'
            );
            return;
        }
        if (isWalking) {
            if (targetMapNumber !== PAHINGAHAN_STOP) {
                walkTo(PAHINGAHAN_STOP, false);
            }
            return;
        }
        if (charMapNumber !== PAHINGAHAN_STOP) {
            walkTo(PAHINGAHAN_STOP, false);
            return;
        }
        setCompletionOpen(true);
    };

    const activeCharMeta = getCharacterMeta(user?.selected_character);

    const handleSwitchCharacter = async (char) => {
        const nextKey = normalizeCharacterKey(char);
        if (normalizeCharacterKey(user?.selected_character) === nextKey) return;
        updateUser({ selected_character: nextKey });
        const meta = getCharacterMeta(nextKey);
        showToast('info', `Si ${meta.name} na ang gamit mong karakter.`);
        await studentApi.updateCharacter(nextKey).catch(() => {});
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
        if (tourActive || guideOpen || outroOpen || activeStageMapId || unlockingStage || completionOpen || groupModalOpen) return;

        const sessionStatus = world?.session?.status;
        if (sessionStatus === 'waiting') {
            showToast(
                'warning',
                'Hindi pa nagsisimula ang laro. Antabayanan ang go-signal ng iyong guro bago pumasok sa mapa.',
                'Naghihintay sa Guro.'
            );
            return;
        }
        if (sessionStatus === 'finished' && !map.progress?.is_completed) {
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
            setOutroReplayMode(false);
            setOutroOpen(true);
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
    const isRestingAtPahingahan = allMapsCompleted && charMapNumber === PAHINGAHAN_STOP && !isWalking;
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
                isResting={isRestingAtPahingahan}
                allMapsCompleted={allMapsCompleted}
                tourActive={tourActive}
                guideStep={guideStep}
                isSessionWaiting={isWaitingSession}
                hideScores={isOfflineMode}
                openedMapIds={openedMapIds}
                unlockingMapId={unlockingStage?.map?.id || null}
                lockScreenProjectorRef={lockScreenProjectorRef}
                paused={Boolean(activeStageMap || canvasPausedForUnlock || completionOpen || groupModalOpen)}
                onEnterMap={handleEnterMap}
                onSelectPahingahan={handleSelectPahingahan}
                onArrived={handleArrived}
                onTourCardChange={setTourMapIndex}
                onTourFinish={finishTour}
            />

            {/* Minimal Typography-Only Caption During First-Visit Fly-Over Tour */}
            {tourActive && (
                <div
                    className="pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4"
                    style={{ top: 'max(18px, env(safe-area-inset-top))' }}
                >
                    <div
                        className="px-4 py-1.5 rounded-full text-xs sm:text-[13px] font-semibold text-[#FAF8F5] tracking-tight"
                        style={{
                            backgroundColor: 'rgba(20, 18, 16, 0.58)',
                            border: '1px solid rgba(255, 255, 255, 0.16)',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                        }}
                    >
                        {(() => {
                            if (!tourMapIndex) return 'Barrio ni Juan Osong';
                            const found = maps.find((m) => m.map_number === tourMapIndex);
                            return found ? `Mapa ${found.map_number} · ${found.title}` : `Mapa ${tourMapIndex}`;
                        })()}
                    </div>
                </div>
            )}

            {/* Single-Row Responsive Top HUD (Hidden during tour, intro & outro for clean framing) */}
            {!guideOpen && !outroOpen && !tourActive && (
            <div className="pointer-events-none fixed top-0 inset-x-0 z-20 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4 flex items-start justify-between gap-2">
                {/* Left Dock: Identity + View-Only Group Pill + Score */}
                <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-stone-200/90 shadow-sm rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-2 sm:gap-3 min-w-0 max-w-[calc(100%-148px)] sm:max-w-none">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-orange-50 border border-orange-200/80 text-[#C2410C] text-[10px] sm:text-[11px] font-extrabold flex items-center justify-center shrink-0">
                        {getInitials(isGroupMode ? world.session?.group_name || user.name : user.name)}
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <p className="text-[11px] sm:text-xs font-bold text-stone-900 leading-tight truncate max-w-[105px] sm:max-w-[180px]">
                                {isGroupMode ? world.session?.group_name || user.name : user.name}
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
                            <button
                                type="button"
                                onClick={() => {
                                    if (!isOfflineMode) {
                                        loadWorld().catch(() => {});
                                    }
                                    setGroupModalOpen(true);
                                }}
                                className="mt-0.5 inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold bg-stone-100 hover:bg-stone-200/80 text-stone-700 transition cursor-pointer max-w-full"
                            >
                                <Users className="w-3 h-3 text-[#C2410C] shrink-0" />
                                <span className="max-w-[95px] sm:max-w-[145px] truncate">
                                    {world.session.group_number
                                        ? `Pangkat #${world.session.group_number} · Miyembro`
                                        : 'Mga Miyembro'}
                                </span>
                            </button>
                        ) : world.session ? (
                            <p className="text-[10px] sm:text-[11px] font-medium text-stone-500 mt-0.5 truncate max-w-[115px] sm:max-w-[160px]">
                                {world.session.class_name}
                            </p>
                        ) : null}
                    </div>

                    <div className="h-6 sm:h-7 w-px bg-stone-200/90 shrink-0" />

                    <div className="inline-flex items-center gap-1 sm:gap-1.5 pr-0.5 sm:pr-1 text-[11px] sm:text-xs font-extrabold text-stone-900 tabular-nums shrink-0">
                        {isOfflineMode ? (
                            <>
                                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#15803D] shrink-0" />
                                <span>
                                    {world.completed_count || 0}
                                    <span className="font-medium text-stone-400">/{maps.length || 5}</span>
                                </span>
                            </>
                        ) : (
                            <>
                                <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 fill-amber-400 shrink-0" />
                                <span>
                                    {world.total_score}
                                    <span className="font-medium text-stone-400">/{world.max_total_score}</span>
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Right Dock: Compact 40px+ Icons on Phone; Character Picker + Labels on Tablet/Desktop */}
                <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-stone-200/90 shadow-sm rounded-2xl p-1 flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => setCharacterPickerOpen(true)}
                        aria-label="Pumili ng Karakter"
                        title="Pumili ng Karakter"
                        className="hidden sm:inline-flex items-center gap-1.5 min-h-[34px] pl-1.5 pr-2.5 py-1 rounded-xl bg-[#FAF5EB] hover:bg-orange-50 border border-stone-200/90 hover:border-[#C2410C]/40 text-stone-800 text-xs font-bold transition cursor-pointer"
                    >
                        <img
                            src={activeCharMeta.portraitUrl}
                            alt={activeCharMeta.name}
                            className="w-6 h-6 rounded-lg object-contain bg-[#F2E6D0] shrink-0"
                        />
                        <span>{activeCharMeta.shortName}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                    </button>

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

                    <button
                        type="button"
                        onClick={() => setGuideOpen(true)}
                        aria-label="Gabay sa Paglalaro"
                        title="Gabay sa Paglalaro"
                        className="min-w-[38px] min-h-[38px] sm:min-h-[34px] px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-orange-50 text-stone-700 hover:text-[#C2410C] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                        <HelpCircle className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#C2410C]" />
                        <span className="hidden sm:inline">Gabay</span>
                    </button>

                    <div className="hidden sm:block h-5 w-px bg-stone-200/90 mx-0.5" />

                    <button
                        type="button"
                        onClick={() => setLogoutConfirmOpen(true)}
                        aria-label="Lumabas"
                        title="Lumabas"
                        className="min-w-[38px] min-h-[38px] sm:min-h-[34px] px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-rose-50 text-stone-500 hover:text-rose-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                        <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">Lumabas</span>
                    </button>
                </div>
            </div>
            )}

            {/* Single Sleek Bottom Thumb-Zone Dock (NO duplicate Edit Pangkat button!) */}
            <div className="pointer-events-none fixed bottom-0 inset-x-0 z-20 px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] flex justify-center">
                {tourActive ? (
                    <button
                        type="button"
                        onClick={finishTour}
                        className="pointer-events-auto min-h-[42px] px-6 rounded-full text-[#FAF8F5] font-semibold text-xs sm:text-[13px] shadow-md cursor-pointer transition hover:opacity-100 active:scale-95"
                        style={{
                            backgroundColor: 'rgba(20, 18, 16, 0.72)',
                            border: '1px solid rgba(255, 255, 255, 0.22)',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                        }}
                    >
                        Laktawan
                    </button>
                ) : (
                    !isWalking && !completionOpen && !guideOpen && !outroOpen && (
                        allMapsCompleted ? (
                            <div className="pointer-events-auto w-full max-w-md sm:w-auto sm:max-w-2xl bg-white/95 backdrop-blur-md border border-stone-200/90 shadow-md rounded-2xl px-2.5 sm:px-3 py-2 flex items-center justify-between sm:justify-center gap-2 text-xs">
                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                    {charMapNumber !== PAHINGAHAN_STOP && (
                                        <button
                                            type="button"
                                            onClick={() => walkTo(PAHINGAHAN_STOP, false)}
                                            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white font-bold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                                        >
                                            <Home className="w-3.5 h-3.5 shrink-0" />
                                            <span>Balik sa Duyan</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setOutroReplayMode(true);
                                            setOutroOpen(true);
                                        }}
                                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#FAF5EB] hover:bg-orange-50 border border-stone-200/90 text-stone-800 hover:text-[#C2410C] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-[#C2410C] shrink-0" />
                                        <span>Outro</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCompletionOpen(true)}
                                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-bold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                                    >
                                        {isOfflineMode ? (
                                            <QrCode className="w-3.5 h-3.5 shrink-0" />
                                        ) : (
                                            <Award className="w-3.5 h-3.5 shrink-0" />
                                        )}
                                        <span>{isOfflineMode ? 'Result QR' : 'Resulta'}</span>
                                    </button>
                                </div>

                                {/* Mobile Thumb-Zone Character Picker Trigger */}
                                <button
                                    type="button"
                                    onClick={() => setCharacterPickerOpen(true)}
                                    className="sm:hidden min-h-[36px] pl-1.5 pr-2.5 py-1 rounded-xl bg-[#FAF5EB] border border-stone-200 text-stone-800 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                                >
                                    <img
                                        src={activeCharMeta.portraitUrl}
                                        alt={activeCharMeta.name}
                                        className="w-6 h-6 rounded-lg object-contain bg-[#F2E6D0] shrink-0"
                                    />
                                    <span>{activeCharMeta.shortName}</span>
                                    <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                                </button>
                            </div>
                        ) : (
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
                                                : 'Pindutin ang mapa upang magsimula'}
                                    </span>
                                </span>

                                {/* Mobile Thumb-Zone Character Picker Trigger (Hidden on sm+ where it's in top-right) */}
                                <button
                                    type="button"
                                    onClick={() => setCharacterPickerOpen(true)}
                                    className="sm:hidden min-h-[36px] pl-1.5 pr-2.5 py-1 rounded-xl bg-[#FAF5EB] border border-stone-200 text-stone-800 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                                >
                                    <img
                                        src={activeCharMeta.portraitUrl}
                                        alt={activeCharMeta.name}
                                        className="w-6 h-6 rounded-lg object-contain bg-[#F2E6D0] shrink-0"
                                    />
                                    <span>{activeCharMeta.shortName}</span>
                                    <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                                </button>
                            </div>
                        )
                    )
                )}
            </div>

            <CharacterPickerModal
                open={characterPickerOpen}
                selectedKey={user?.selected_character || 'juan'}
                onSelect={handleSwitchCharacter}
                onClose={() => setCharacterPickerOpen(false)}
            />

            {isGroupMode && (
                <MyGroupModal
                    open={groupModalOpen}
                    onClose={() => setGroupModalOpen(false)}
                    session={world.session}
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
                onClose={handleCloseCompletion}
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
                    isOfflineMode={isOfflineMode}
                    initialResume={resumePayload}
                    onClose={handleCloseStage}
                    onStageFinished={handleStageFinished}
                    onQuitSession={() => {
                        clearStageResume(user?.id);
                        setActiveStageMapId(null);
                        logout();
                    }}
                    onOfflineMapReset={async (resetAll) => {
                        clearStageResume(user?.id);
                        await loadWorld().catch(() => {});
                        if (resetAll) {
                            setCharMapNumber(1);
                            setTargetMapNumber(1);
                        }
                    }}
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

            <StudentOnboardingGuide
                key="juan-intro"
                mode="intro"
                open={guideOpen && !outroOpen && !tourActive && !activeStageMap && !unlockingStage && !completionOpen && !logoutConfirmOpen}
                onboardingVoiceovers={world?.lesson?.onboarding_voiceovers}
                onClose={finishGuide}
                onStepChange={setGuideStep}
            />

            <StudentOnboardingGuide
                key="juan-outro"
                mode="outro"
                open={outroOpen && !tourActive && !activeStageMap && !unlockingStage && !completionOpen && !logoutConfirmOpen}
                outroVoiceovers={world?.lesson?.outro_voiceovers}
                isOfflineMode={isOfflineMode}
                onClose={finishOutro}
            />

            {/* Logout Confirmation Modal (Prevents accidental loss of offline progress or unsent Result QR) */}
            {logoutConfirmOpen && (
                <div
                    className="fixed inset-0 z-[70] bg-stone-900/55 backdrop-blur-[2px] flex items-center justify-center p-4"
                    onClick={() => setLogoutConfirmOpen(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-white border border-stone-200 shadow-2xl p-6 space-y-4 text-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 mx-auto flex items-center justify-center">
                            <LogOut className="w-5 h-5" />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="text-base font-extrabold text-stone-900">
                                Sigurado ka bang lalabas?
                            </h3>
                            <p className="text-xs text-stone-500 leading-relaxed">
                                {isOfflineMode
                                    ? allMapsCompleted
                                        ? 'Tiyaking na-download o na-scan na ng iyong guro ang Result QR. May backup din ito sa Offline Login screen sakaling kailanganin muli.'
                                        : 'Nasa Offline Mode ka ngayon. Kapag lumabas ka bago matapos ang Mapa 5, mabubura ang kasalukuyang progreso sa device na ito.'
                                    : 'Maaari kang pumasok muli gamit ang parehong Class PIN at iyong pangalan.'}
                            </p>
                        </div>

                        <div className="space-y-2 pt-1">
                            {isOfflineMode && allMapsCompleted && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLogoutConfirmOpen(false);
                                        setCompletionOpen(true);
                                    }}
                                    className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-[#15803D] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                                >
                                    <QrCode className="w-3.5 h-3.5" />
                                    <span>Tingnan muna ang Result QR</span>
                                </button>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setLogoutConfirmOpen(false)}
                                    className="min-h-[42px] px-4 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold cursor-pointer transition"
                                >
                                    Kanselahin
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLogoutConfirmOpen(false);
                                        clearStageResume(user?.id);
                                        logout();
                                    }}
                                    className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition"
                                >
                                    Lumabas
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
