import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

// Rank cameras so phones prefer their main rear lens while laptops pick their built-in webcam
function rankCamera(cam) {
    const label = String(cam?.label || '').toLowerCase();
    const isBack = /\b(back|rear|environment|world)\b/.test(label);
    const isFront = /\b(front|user|selfie|facetime)\b/.test(label);
    const isAuxLens = /\b(ultra|wide|macro|depth|tele|mono|ir|virtual)\b/.test(label);
    if (isBack && !isAuxLens) return 0;
    if (isBack) return 1;
    if (!isFront && !isAuxLens) return 2;
    if (!isFront) return 3;
    return 4;
}

function classifyCameraError(err) {
    const name = String(err?.name || '');
    const msg = String(err?.message || err || '');
    if (/NotAllowedError|PermissionDeniedError|Permission|denied/i.test(`${name} ${msg}`)) {
        return 'denied';
    }
    if (/NotFoundError|DevicesNotFoundError|Requested device not found|no camera/i.test(`${name} ${msg}`)) {
        return 'not_found';
    }
    if (/NotReadableError|TrackStartError|in use|busy|Could not start video source/i.test(`${name} ${msg}`)) {
        return 'busy';
    }
    return 'error';
}

/**
 * Minimalist Apple HIG / GCash-style QR Camera Scanner:
 * - Fixes html5-qrcode's strict 1-key cameraIdOrConfig constraint so BOTH phones (rear/front) and laptops (webcam) open reliably.
 * - StrictMode-safe async cleanup so hardware cameras never lock on quick remounts.
 * - Native browser camera permission flow + clean text-only caption states (zero neon lasers or icon spam).
 */
export default function QrScannerBox({ active = true, onScan, cooldownMs = 1500, className = '' }) {
    const rawId = useId();
    const containerId = `jq-qr-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const onScanRef = useRef(onScan);
    const lastScanRef = useRef({ text: '', at: 0 });
    const cleanupPromiseRef = useRef(Promise.resolve());

    const [status, setStatus] = useState('starting'); // starting | live | needs_permission | denied | busy | not_found | insecure | unsupported | error
    const [cameras, setCameras] = useState([]);
    const [cameraIndex, setCameraIndex] = useState(0);
    const [retryTick, setRetryTick] = useState(0);

    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    const requestPermissionAndRetry = useCallback(async () => {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
            setStatus('insecure');
            return;
        }
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setStatus('unsupported');
            return;
        }

        setStatus('starting');
        try {
            // Directly invoked inside user gesture so Chrome/Edge/Safari always show the native Allow Camera dialog
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            stream.getTracks().forEach((t) => t.stop());
            setRetryTick((t) => t + 1);
        } catch (err) {
            const kind = classifyCameraError(err);
            setStatus(kind);
        }
    }, []);

    useEffect(() => {
        if (!active) return undefined;

        let cancelled = false;
        let scanner = null;
        let started = false;

        const stopAndClear = async (instance, wasStarted) => {
            if (!instance) return;
            if (wasStarted) {
                try {
                    await instance.stop();
                } catch {
                    // ignore stop error
                }
            }
            try {
                instance.clear();
            } catch {
                // ignore DOM clear error
            }
        };

        const startCamera = async () => {
            // Wait for any previous mount's camera stop() to release the webcam/sensor first (StrictMode-safe!)
            await cleanupPromiseRef.current;
            if (cancelled) return;

            if (typeof window !== 'undefined' && !window.isSecureContext) {
                setStatus('insecure');
                return;
            }
            if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
                setStatus('unsupported');
                return;
            }

            setStatus('starting');

            // Check Permissions API when supported (non-fatal on Safari/Firefox)
            try {
                if (navigator.permissions?.query) {
                    const perm = await navigator.permissions.query({ name: 'camera' });
                    if (cancelled) return;
                    if (perm.state === 'denied') {
                        setStatus('denied');
                        return;
                    }
                }
            } catch {
                // Continue directly to getUserMedia probe
            }

            // Step 1: Acquire camera permission (triggers browser Allow dialog if 'prompt') and unlock device labels
            try {
                let probeStream = null;
                try {
                    probeStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' } },
                        audio: false,
                    });
                } catch (envErr) {
                    const envKind = classifyCameraError(envErr);
                    if (envKind === 'denied') throw envErr;
                    probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                }
                probeStream.getTracks().forEach((t) => t.stop());
                // Brief release pause so mobile camera HALs finish closing the probe track before Html5Qrcode opens it
                await new Promise((resolve) => setTimeout(resolve, 150));
            } catch (err) {
                if (!cancelled) {
                    const kind = classifyCameraError(err);
                    if (kind === 'denied') {
                        // Distinguish "Permission dismissed" (still 'prompt') vs hard-blocked ('denied')
                        let permState = 'denied';
                        try {
                            if (navigator.permissions?.query) {
                                const p = await navigator.permissions.query({ name: 'camera' });
                                permState = p.state;
                            }
                        } catch {
                            // fall back to checking error message
                            if (/dismiss/i.test(String(err?.message || ''))) permState = 'prompt';
                        }
                        if (!cancelled) {
                            setStatus(permState === 'prompt' ? 'needs_permission' : 'denied');
                        }
                    } else {
                        setStatus(kind);
                    }
                }
                return;
            }

            if (cancelled) return;

            // Step 2: Enumerate real cameras (sorted rear-first for phones, built-in webcam for laptops)
            let detected = [];
            try {
                const rawList = await Html5Qrcode.getCameras();
                if (Array.isArray(rawList) && rawList.length > 0) {
                    detected = [...rawList].sort((a, b) => rankCamera(a) - rankCamera(b));
                }
            } catch {
                detected = [];
            }

            if (cancelled) return;
            setCameras(detected);

            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = '';

            scanner = new Html5Qrcode(containerId, {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                useBarCodeDetectorIfSupported: true,
                verbose: false,
            });

            // Clean full-frame scanning without html5-qrcode's clunky default shaded box (our minimalist cutout handles framing)
            const scanConfig = {
                fps: 15,
                qrbox: (w, h) => {
                    const edge = Math.max(150, Math.min(260, Math.floor(Math.min(w, h) * 0.68)));
                    return { width: edge, height: edge };
                },
                disableFlip: false,
            };

            const onDecode = (decodedText) => {
                const now = Date.now();
                if (decodedText === lastScanRef.current.text && now - lastScanRef.current.at < cooldownMs) {
                    return;
                }
                lastScanRef.current = { text: decodedText, at: now };
                onScanRef.current?.(decodedText);
            };

            // Step 3: Build strictly valid 1-key / deviceId candidates for html5-qrcode.start()
            const candidates = [];
            if (detected.length > 0) {
                const safeIdx = cameraIndex % detected.length;
                candidates.push(detected[safeIdx].id);
                for (let i = 0; i < detected.length; i += 1) {
                    if (i !== safeIdx) candidates.push(detected[i].id);
                }
            }
            candidates.push({ facingMode: 'environment' });
            candidates.push({ facingMode: 'user' });

            let lastErr = null;
            for (const camConfig of candidates) {
                if (cancelled) break;
                try {
                    await scanner.start(camConfig, scanConfig, onDecode, () => {});
                    started = true;
                    break;
                } catch (err) {
                    lastErr = err;
                    if (classifyCameraError(err) === 'denied') {
                        break;
                    }
                }
            }

            if (cancelled) {
                cleanupPromiseRef.current = stopAndClear(scanner, started);
                return;
            }

            if (started) {
                setStatus('live');
            } else {
                await stopAndClear(scanner, false);
                setStatus(classifyCameraError(lastErr));
            }
        };

        startCamera();

        return () => {
            cancelled = true;
            if (scanner) {
                const inst = scanner;
                const wasStarted = started;
                cleanupPromiseRef.current = stopAndClear(inst, wasStarted);
            }
        };
    }, [active, containerId, cooldownMs, cameraIndex, retryTick]);

    const handleSwitchCamera = () => {
        if (cameras.length < 2) return;
        setCameraIndex((prev) => (prev + 1) % cameras.length);
    };

    const isLive = status === 'live';
    const isErrorState =
        status === 'needs_permission' ||
        status === 'denied' ||
        status === 'busy' ||
        status === 'not_found' ||
        status === 'insecure' ||
        status === 'unsupported' ||
        status === 'error';

    const stateCopy = {
        needs_permission: {
            title: 'Buksan ang Camera',
            caption: 'Kailangan ng pahintulot sa camera para ma-scan ang QR code. Piliin ang Allow kapag lumabas ang pop-up.',
            button: 'Payagan ang Camera',
            primary: true,
        },
        denied: {
            title: 'Naka-off ang Camera',
            caption: 'I-on ang Camera sa Site Settings ng browser sa itaas (address bar), tapos pindutin ang Subukan Ulit.',
            button: 'Subukan Ulit',
            primary: false,
        },
        busy: {
            title: 'Ginagamit ang Camera',
            caption: 'May ibang app o tab na gumagamit ng camera ngayon. Isara muna ito, tapos pindutin ang Subukan Ulit.',
            button: 'Subukan Ulit',
            primary: false,
        },
        not_found: {
            title: 'Walang Nakitang Camera',
            caption: 'Walang nahanap na camera sa device na ito. Gumamit na lang ng larawan o manual input sa ibaba.',
            button: 'Subukan Ulit',
            primary: false,
        },
        insecure: {
            title: 'Kailangan ng HTTPS',
            caption: 'Buksan ang app sa HTTPS o localhost para payagan ng browser na mabuksan ang camera.',
            button: 'Subukan Ulit',
            primary: false,
        },
        unsupported: {
            title: 'Hindi Suportado ang Camera',
            caption: 'Hindi suportado ng browser na ito ang live camera. Gumamit na lang ng larawan o manual input sa ibaba.',
            button: 'Subukan Ulit',
            primary: false,
        },
        error: {
            title: 'Hindi Mabuksan ang Camera',
            caption: 'Tiyaking naka-allow ang camera sa browser, tapos pindutin ang Subukan Ulit.',
            button: 'Payagan ang Camera',
            primary: true,
        },
    }[status];

    return (
        <div
            className={`relative rounded-2xl overflow-hidden border border-stone-200 ${
                isErrorState ? 'bg-white' : 'bg-black'
            } ${className}`}
            style={{ minHeight: '272px' }}
        >
            {/* Force clean edge-to-edge live video & hide html5-qrcode's default gray shaded border */}
            <style>{`
                #${containerId} { width: 100%; height: 272px; position: relative; }
                #${containerId} video { width: 100% !important; height: 272px !important; object-fit: cover !important; display: block; }
                #${containerId} #qr-shaded-region { display: none !important; }
                #${containerId} img { display: none !important; }
            `}</style>

            <div id={containerId} className="w-full h-[272px]" />

            {/* Live Apple HIG / GCash Minimalist Viewfinder Cutout + 4 Clean White Corners + Single Caption */}
            {isLive && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    {/* Pixel-exact square cutout at ANY phone/laptop width (box-shadow scrim surrounds the crisp clear center!) */}
                    <div
                        className="absolute left-1/2 -translate-x-1/2 rounded-2xl"
                        style={{
                            top: '38px',
                            width: '176px',
                            height: '176px',
                            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.46)',
                        }}
                    >
                        <span className="absolute top-0 left-0 w-5 h-5 border-t-[2.5px] border-l-[2.5px] border-white/95 rounded-tl-xl" />
                        <span className="absolute top-0 right-0 w-5 h-5 border-t-[2.5px] border-r-[2.5px] border-white/95 rounded-tr-xl" />
                        <span className="absolute bottom-0 left-0 w-5 h-5 border-b-[2.5px] border-l-[2.5px] border-white/95 rounded-bl-xl" />
                        <span className="absolute bottom-0 right-0 w-5 h-5 border-b-[2.5px] border-r-[2.5px] border-white/95 rounded-br-xl" />
                    </div>

                    {/* Quiet text-only camera switch control (only when multiple cameras exist) */}
                    {cameras.length > 1 && (
                        <button
                            type="button"
                            onClick={handleSwitchCamera}
                            className="pointer-events-auto absolute top-3 right-3 px-3 py-1 rounded-full bg-black/55 hover:bg-black/70 border border-white/20 text-white/95 text-[11px] font-semibold backdrop-blur-sm transition cursor-pointer"
                        >
                            Palitan ang Camera
                        </button>
                    )}

                    {/* Single clean minimalist caption */}
                    <p
                        className="absolute inset-x-4 bottom-3.5 text-center text-xs font-medium text-white/95"
                        style={{ textShadow: '0 1px 4px rgba(0, 0, 0, 0.65)' }}
                    >
                        Itapat ang QR code sa loob ng frame
                    </p>
                </div>
            )}

            {/* Minimal Loading State */}
            {status === 'starting' && (
                <div className="absolute inset-0 bg-stone-950/90 flex items-center justify-center px-6 text-center">
                    <p className="text-xs font-medium text-stone-200">Binubuksan ang camera...</p>
                </div>
            )}

            {/* Clean Apple HIG Flat Permission / Blocked / Diagnostic States (Pure Typography, Zero Icon Spam) */}
            {isErrorState && stateCopy && (
                <div className="absolute inset-0 bg-white px-6 py-7 flex flex-col items-center justify-center text-center gap-2.5">
                    <p className="text-sm font-bold text-stone-900">{stateCopy.title}</p>
                    <p className="text-xs text-stone-600 leading-relaxed max-w-[260px]">{stateCopy.caption}</p>
                    <button
                        type="button"
                        onClick={requestPermissionAndRetry}
                        className={`mt-2 h-9 px-5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                            stateCopy.primary
                                ? 'bg-stone-900 hover:bg-stone-800 text-white'
                                : 'bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-900'
                        }`}
                    >
                        {stateCopy.button}
                    </button>
                </div>
            )}
        </div>
    );
}
