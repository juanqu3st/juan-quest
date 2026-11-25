import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import {
    checkRemoteContentUpdate,
    ensureSilentOfflineCache,
    isFullOfflineBundleReady,
    syncAllOfflineResources,
} from '../utils/offlinePack';
import { useToast } from './ToastContext';

const PwaContext = createContext(null);
/* global __APP_VERSION__, __APP_BUILD_ID__ */
const CURRENT_APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? String(__APP_VERSION__) : '1.2.0';
const CURRENT_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? String(__APP_BUILD_ID__) : '';

function detectStandalone() {
    if (typeof window === 'undefined') return false;
    return (
        window.matchMedia?.('(display-mode: standalone)')?.matches ||
        window.matchMedia?.('(display-mode: minimal-ui)')?.matches ||
        window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
        window.navigator.standalone === true ||
        document.referrer.startsWith('android-app://')
    );
}

function detectIos() {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

async function checkRemoteAppBuildChanged() {
    if (!CURRENT_BUILD_ID || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        return { changed: false, version: null };
    }
    try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return { changed: false, version: null };
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('json')) return { changed: false, version: null };
        const data = await res.json();
        return {
            changed: Boolean(data?.build && String(data.build) !== CURRENT_BUILD_ID),
            version: data?.version ? String(data.version) : null,
        };
    } catch {
        return { changed: false, version: null };
    }
}

async function waitForWaitingWorker(registration, timeoutMs = 2500) {
    if (!registration) return null;
    if (registration.waiting) return registration.waiting;
    const installing = registration.installing;
    if (!installing) return null;

    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(registration.waiting || null), timeoutMs);
        installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') {
                clearTimeout(timer);
                resolve(registration.waiting || installing);
            }
        });
    });
}

export function PwaProvider({ children }) {
    const toastApi = useToast();
    const showToast = toastApi?.showToast;
    const [isOnline, setIsOnline] = useState(() =>
        typeof navigator === 'undefined' ? true : navigator.onLine !== false
    );
    const [isInstalled, setIsInstalled] = useState(() => detectStandalone());
    const [gameplayActive, setGameplayActive] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);

    // Install modal state (Clean native feel — zero verbose/technical descriptions!)
    const [installModalOpen, setInstallModalOpen] = useState(false);
    const [installPhase, setInstallPhase] = useState('idle'); // 'preparing' | 'tap_install' | 'ios_guide' | 'error'
    const [installProgress, setInstallProgress] = useState({ percent: 0, label: '' });
    const [installError, setInstallError] = useState('');

    // Force Update modal state for Installed PWA when online and a new build or content change is found
    const [swNeedsRefresh, setSwNeedsRefresh] = useState(false);
    const [buildNeedsUpdate, setBuildNeedsUpdate] = useState(false);
    const [remoteVersion, setRemoteVersion] = useState(null);
    const [contentNeedsUpdate, setContentNeedsUpdate] = useState(false);
    const [updatingApp, setUpdatingApp] = useState(false);
    const [updateProgress, setUpdateProgress] = useState({ percent: 0, label: '' });
    const [updateError, setUpdateError] = useState('');

    const promptRef = useRef(null);
    const swRegistrationRef = useRef(null);
    const updateSwFnRef = useRef(null);
    const isInstalledRef = useRef(isInstalled);
    isInstalledRef.current = isInstalled;
    const lastVisibilityCheckRef = useRef(0);

    const isIos = detectIos();

    const checkInstalledUpdates = useCallback(async () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        // Ask Service Worker to check server for a newer app build right now
        if (swRegistrationRef.current) {
            swRegistrationRef.current.update().catch(() => {});
            if (isInstalledRef.current && swRegistrationRef.current.waiting) {
                setSwNeedsRefresh(true);
            }
        }

        if (isInstalledRef.current) {
            const [buildInfo, contentCheck] = await Promise.all([
                checkRemoteAppBuildChanged(),
                checkRemoteContentUpdate(),
            ]);
            if (buildInfo?.changed) {
                setBuildNeedsUpdate(true);
                if (buildInfo.version) setRemoteVersion(buildInfo.version);
            }
            if (contentCheck?.hasUpdate) {
                setContentNeedsUpdate(true);
            }
        } else {
            ensureSilentOfflineCache();
        }
    }, []);

    useEffect(() => {
        // Register PWA Service Worker with prompt control so installed apps get Force Update UI!
        const updateSW = registerSW({
            immediate: true,
            onNeedRefresh() {
                if (isInstalledRef.current) {
                    setSwNeedsRefresh(true);
                } else {
                    // Normal browser tab updates seamlessly without blocking
                    updateSW(true).catch(() => {});
                }
            },
            onRegisteredSW(_swUrl, registration) {
                swRegistrationRef.current = registration || null;
                if (registration) {
                    if (isInstalledRef.current && registration.waiting) {
                        setSwNeedsRefresh(true);
                    }
                    if (navigator.onLine !== false) {
                        registration.update().catch(() => {});
                    }
                }
            },
        });
        updateSwFnRef.current = updateSW;

        const goOnline = () => {
            setIsOnline(true);
            checkInstalledUpdates();
        };
        const goOffline = () => setIsOnline(false);

        const onVisibility = () => {
            if (document.visibilityState === 'visible' && navigator.onLine !== false) {
                const now = Date.now();
                // Throttle tab-focus update checks to once every 60s to avoid spamming /version.json & /offline/pack
                if (now - lastVisibilityCheckRef.current >= 60000) {
                    lastVisibilityCheckRef.current = now;
                    checkInstalledUpdates();
                }
            }
        };

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        document.addEventListener('visibilitychange', onVisibility);

        const onBeforeInstall = (e) => {
            e.preventDefault();
            promptRef.current = e;
            setDeferredPrompt(e);
        };
        const onAppInstalled = () => {
            setIsInstalled(true);
            setDeferredPrompt(null);
            promptRef.current = null;
            setInstallModalOpen(false);
            setInstallPhase('idle');
            showToast?.('success', 'Na-install na ang JuanQuest App.', 'Na-install na!');
        };

        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onAppInstalled);

        // Fast initial update check (~350ms after opening installed app!)
        const initialTimer = setTimeout(() => {
            if (navigator.onLine !== false) {
                checkInstalledUpdates();
            }
        }, 350);

        return () => {
            clearTimeout(initialTimer);
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onAppInstalled);
        };
    }, [checkInstalledUpdates, showToast]);

    const canShowInstallButton = isOnline && !isInstalled && (Boolean(deferredPrompt) || isIos);
    const showForceUpdateModal =
        isInstalled &&
        isOnline &&
        !gameplayActive &&
        (swNeedsRefresh || buildNeedsUpdate || contentNeedsUpdate);

    const triggerNativePrompt = useCallback(async () => {
        const promptEvent = promptRef.current;
        if (!promptEvent) {
            setInstallModalOpen(false);
            return false;
        }
        try {
            await promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            setInstallModalOpen(false);
            setInstallPhase('idle');
            if (choice?.outcome === 'accepted') {
                setIsInstalled(true);
                setDeferredPrompt(null);
                promptRef.current = null;
                showToast?.('success', 'Ini-install na ang JuanQuest App...', 'Ini-install...');
            }
            return true;
        } catch {
            return false;
        }
    }, [showToast]);

    /**
     * Clean Seamless App Installation (no technical asset descriptions, no confusing "Tapos" modal).
     */
    const startAppInstall = useCallback(async () => {
        setInstallError('');

        const alreadyReady = await isFullOfflineBundleReady().catch(() => false);
        if (alreadyReady) {
            if (promptRef.current) {
                const ok = await triggerNativePrompt();
                if (ok) return;
            } else if (isIos) {
                setInstallModalOpen(true);
                setInstallPhase('ios_guide');
                return;
            }
        }

        setInstallModalOpen(true);
        setInstallPhase('preparing');
        setInstallProgress({ percent: 6, label: 'Inihahanda ang JuanQuest...' });

        try {
            await syncAllOfflineResources({
                includeVideos: true,
                strictVideos: true,
                onProgress: (p) => setInstallProgress(p),
            });

            if (promptRef.current) {
                const triggered = await triggerNativePrompt();
                if (!triggered) {
                    setInstallPhase('tap_install');
                }
            } else if (isIos) {
                setInstallPhase('ios_guide');
            } else {
                setInstallModalOpen(false);
                setInstallPhase('idle');
            }
        } catch (err) {
            setInstallError(
                err?.message || 'Hindi natapos ang pag-download ng app. Pakisuri ang internet at subukan muli.'
            );
            setInstallPhase('error');
        }
    }, [isIos, triggerNativePrompt]);

    /**
     * Force Update Handler for Installed PWA:
     * Shows smooth visual progress (0% -> 100%), downloads latest content & media,
     * and activates the newest Service Worker build immediately without loops.
     */
    const handleForceUpdate = useCallback(async () => {
        if (updatingApp) return;
        setUpdateError('');
        setUpdatingApp(true);
        setUpdateProgress({ percent: 8, label: 'Nagda-download ng update...' });

        try {
            await syncAllOfflineResources({
                includeVideos: true,
                strictVideos: true,
                onProgress: (p) => {
                    const scaled = Math.min(90, Math.max(10, Math.round((p.percent || 0) * 0.9)));
                    setUpdateProgress({
                        percent: scaled,
                        label: scaled >= 82 ? 'Inilalapat ang update...' : 'Nagda-download ng update...',
                    });
                },
            });

            if (swNeedsRefresh || buildNeedsUpdate) {
                setUpdateProgress({ percent: 94, label: 'Inilalapat ang bagong bersyon...' });
                const reg = swRegistrationRef.current;
                if (reg) {
                    await reg.update().catch(() => {});
                }
                const waiting = await waitForWaitingWorker(reg, 2500);
                setUpdateProgress({ percent: 100, label: 'Nire-restart ang app...' });

                if (waiting) {
                    if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.addEventListener(
                            'controllerchange',
                            () => window.location.reload(),
                            { once: true }
                        );
                    }
                    waiting.postMessage({ type: 'SKIP_WAITING' });
                    updateSwFnRef.current?.(true).catch(() => {});
                    setTimeout(() => window.location.reload(), 1200);
                    return;
                }

                // Fallback when version.json is newer than running JS but browser hasn't queued a waiting SW yet
                if (reg) {
                    await reg.unregister().catch(() => {});
                }
                window.location.reload();
                return;
            }

            setUpdateProgress({ percent: 100, label: 'Na-update na!' });
            setContentNeedsUpdate(false);
            setSwNeedsRefresh(false);
            setBuildNeedsUpdate(false);
            setUpdatingApp(false);
            showToast?.('success', 'Na-update na sa pinakabagong bersyon ang JuanQuest.', 'Updated!');
        } catch (err) {
            setUpdateError(
                err?.message || 'Hindi natapos ang pag-update. Pakisuri ang iyong internet at subukan muli.'
            );
            setUpdatingApp(false);
        }
    }, [swNeedsRefresh, buildNeedsUpdate, updatingApp, showToast]);

    return (
        <PwaContext.Provider
            value={{
                isOnline,
                isInstalled,
                isIos,
                appVersion: CURRENT_APP_VERSION,
                canShowInstallButton,
                startAppInstall,
                setGameplayActive,
            }}
        >
            {children}

            {/* Clean Force Update Modal (Shown ONLY when installed app opens online and an update is available) */}
            {showForceUpdateModal && (
                <div className="fixed inset-0 z-[95] bg-stone-900/65 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white border border-stone-200 shadow-2xl p-6 text-center space-y-5">
                        <div className="space-y-2.5">
                            <img
                                src="/logo.svg"
                                alt="JuanQuest"
                                className="w-14 h-14 mx-auto select-none"
                            />
                            <div>
                                <h3 className="text-base font-extrabold text-stone-900">
                                    {updatingApp ? 'Ina-update ang JuanQuest' : 'May Bagong Update'}
                                </h3>
                                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                                    {updatingApp
                                        ? 'Pakihintay habang inilalapat ang pinakabagong bersyon ng laro.'
                                        : remoteVersion
                                          ? `May bagong bersyon ng JuanQuest (v${remoteVersion}). I-update muna ang laro upang magpatuloy.`
                                          : 'May bagong bersyon ng JuanQuest. I-update muna ang laro upang magpatuloy.'}
                                </p>
                            </div>
                        </div>

                        {updatingApp ? (
                            <div className="space-y-2 text-left">
                                <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden border border-stone-200/70">
                                    <div
                                        className="h-full bg-[#C2410C] rounded-full transition-all duration-300"
                                        style={{ width: `${Math.max(8, updateProgress.percent)}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-stone-600 font-medium">
                                        {updateProgress.label || 'Nagda-download ng update...'}
                                    </span>
                                    <span className="font-bold text-[#C2410C] tabular-nums">
                                        {updateProgress.percent}%
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {updateError && (
                                    <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 text-left">
                                        {updateError}
                                    </p>
                                )}
                                <button
                                    type="button"
                                    onClick={handleForceUpdate}
                                    className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    <span>I-update ang Laro</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Clean Seamless Installation Progress Modal (Zero technical descriptions, zero "Tapos" screen!) */}
            {installModalOpen && !showForceUpdateModal && (
                <div className="fixed inset-0 z-[90] bg-stone-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white border border-stone-200 shadow-2xl p-5 sm:p-6 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <img src="/logo.svg" alt="JuanQuest" className="w-11 h-11 shrink-0" />
                                <div>
                                    <h3 className="text-sm font-extrabold text-stone-900">
                                        {installPhase === 'ios_guide'
                                            ? 'Idagdag sa Home Screen'
                                            : installPhase === 'tap_install'
                                              ? 'Handa nang I-install'
                                              : 'Ini-install ang JuanQuest'}
                                    </h3>
                                    <p className="text-xs text-stone-500 mt-0.5">
                                        {installPhase === 'preparing'
                                            ? 'Pakihintay habang inihahanda ang app.'
                                            : installPhase === 'tap_install'
                                              ? 'Pindutin ang button sa ibaba upang ituloy.'
                                              : installPhase === 'ios_guide'
                                                ? 'Sundin ang 2 hakbang sa Safari upang idagdag:'
                                                : 'May problema sa koneksyon habang nagda-download.'}
                                    </p>
                                </div>
                            </div>
                            {installPhase !== 'preparing' && (
                                <button
                                    type="button"
                                    onClick={() => setInstallModalOpen(false)}
                                    aria-label="Isara"
                                    className="w-8 h-8 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 inline-flex items-center justify-center cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {installPhase === 'preparing' && (
                            <div className="space-y-2.5 pt-1">
                                <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden border border-stone-200/70">
                                    <div
                                        className="h-full bg-[#C2410C] rounded-full transition-all duration-300"
                                        style={{ width: `${Math.max(5, installProgress.percent)}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-stone-600 font-medium truncate pr-2">
                                        {installProgress.label || 'Inihahanda ang JuanQuest...'}
                                    </span>
                                    <span className="font-bold text-[#C2410C] tabular-nums shrink-0">
                                        {installProgress.percent}%
                                    </span>
                                </div>
                            </div>
                        )}

                        {installPhase === 'tap_install' && (
                            <div className="pt-1">
                                <button
                                    type="button"
                                    onClick={triggerNativePrompt}
                                    className="w-full min-h-[46px] rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer transition"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>I-install Ngayon</span>
                                </button>
                            </div>
                        )}

                        {installPhase === 'ios_guide' && (
                            <div className="space-y-3 pt-1">
                                <div className="rounded-xl bg-[#FAF8F5] border border-stone-200 p-3.5 space-y-2 text-xs text-stone-700">
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-[#C2410C] text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                            1
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            Pindutin ang <Share className="w-3.5 h-3.5 text-[#C2410C]" />{' '}
                                            <strong>Share</strong> button sa ibaba ng Safari.
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-[#C2410C] text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                            2
                                        </span>
                                        <span>
                                            Piliin ang <strong>Add to Home Screen</strong> → <strong>Add</strong>.
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setInstallModalOpen(false)}
                                    className="w-full min-h-[42px] rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold cursor-pointer transition"
                                >
                                    Naintindihan
                                </button>
                            </div>
                        )}

                        {installPhase === 'error' && (
                            <div className="space-y-3 pt-1">
                                <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                                    {installError}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setInstallModalOpen(false)}
                                        className="flex-1 min-h-[40px] rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 cursor-pointer"
                                    >
                                        Isara
                                    </button>
                                    <button
                                        type="button"
                                        onClick={startAppInstall}
                                        className="flex-1 min-h-[40px] rounded-xl bg-[#C2410C] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Subukan Ulit
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </PwaContext.Provider>
    );
}

export function usePwa() {
    return useContext(PwaContext);
}
