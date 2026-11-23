import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { ensureSilentOfflineCache, isFullOfflineBundleReady, syncAllOfflineResources } from '../utils/offlinePack';
import { useToast } from './ToastContext';

const PwaContext = createContext(null);

function detectStandalone() {
    if (typeof window === 'undefined') return false;
    return (
        window.matchMedia?.('(display-mode: standalone)')?.matches ||
        window.navigator.standalone === true
    );
}

function detectIos() {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function PwaProvider({ children }) {
    const toastApi = useToast();
    const showToast = toastApi?.showToast;
    const [isOnline, setIsOnline] = useState(() =>
        typeof navigator === 'undefined' ? true : navigator.onLine !== false
    );
    const [isInstalled, setIsInstalled] = useState(() => detectStandalone());
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [installModalOpen, setInstallModalOpen] = useState(false);
    const [installPhase, setInstallPhase] = useState('idle'); // 'preparing' | 'tap_install' | 'ios_guide' | 'error'
    const [installProgress, setInstallProgress] = useState({ percent: 0, label: '' });
    const [installError, setInstallError] = useState('');
    const promptRef = useRef(null);

    const isIos = detectIos();

    useEffect(() => {
        const goOnline = () => {
            setIsOnline(true);
            ensureSilentOfflineCache();
        };
        const goOffline = () => setIsOnline(false);

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

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
            showToast?.('success', 'Na-install na ang JuanQuest App sa iyong device.', 'Na-install na!');
        };

        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onAppInstalled);

        // Quietly keep all 5 story videos + game data synced in background whenever online
        const silentTimer = setTimeout(() => {
            if (navigator.onLine !== false) {
                ensureSilentOfflineCache();
            }
        }, 1200);

        return () => {
            clearTimeout(silentTimer);
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onAppInstalled);
        };
    }, [showToast]);

    const canShowInstallButton = isOnline && !isInstalled && (Boolean(deferredPrompt) || isIos);

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
                showToast?.('success', 'Ini-install na ang JuanQuest App sa iyong device...', 'Ini-install...');
            }
            return true;
        } catch {
            // Browser expired user gesture during long video download — show single instant Install tap button
            return false;
        }
    }, [showToast]);

    /**
     * Seamless All-in-One App Installation:
     * - If all 5 videos & app files are already saved -> triggers native Install dialog immediately (0ms)!
     * - Otherwise downloads & verifies 100% of all 5 videos first, then triggers native Install immediately
     *   with ZERO confusing "Tapos" confirmation modal!
     */
    const startAppInstall = useCallback(async () => {
        setInstallError('');

        // Fast path: everything already saved in background -> native browser Install popup immediately!
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
        setInstallProgress({ percent: 6, label: 'Inihahanda ang JuanQuest App...' });

        try {
            await syncAllOfflineResources({
                includeVideos: true,
                strictVideos: true,
                onProgress: (p) => setInstallProgress(p),
            });

            if (promptRef.current) {
                const triggered = await triggerNativePrompt();
                if (!triggered) {
                    // Only if Chrome blocked async prompt after long download -> 1-tap instant Install button
                    setInstallPhase('tap_install');
                }
            } else if (isIos) {
                setInstallPhase('ios_guide');
            } else {
                setInstallModalOpen(false);
                setInstallPhase('idle');
            }
        } catch (err) {
            setInstallError(err?.message || 'Hindi natapos ang pag-download ng mga files. Pakisubukan muli.');
            setInstallPhase('error');
        }
    }, [isIos, triggerNativePrompt]);

    return (
        <PwaContext.Provider
            value={{
                isOnline,
                isInstalled,
                isIos,
                canShowInstallButton,
                startAppInstall,
            }}
        >
            {children}

            {/* Clean Seamless Installation Progress Modal (Auto-closes on Install — Zero "Tapos" screen!) */}
            {installModalOpen && (
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
                                            ? 'Kasama na lahat ng 3D mapa, larawan, at 5 video.'
                                            : installPhase === 'tap_install'
                                              ? 'Kumpleto na ang 5 story video at buong laro.'
                                              : installPhase === 'ios_guide'
                                                ? 'Kumpleto na ang files! Sundin ang 2 hakbang sa Safari:'
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
                                        {installProgress.label || 'Inihahanda ang mga files...'}
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
