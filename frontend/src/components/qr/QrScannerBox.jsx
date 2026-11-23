import { useEffect, useId, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Clean camera QR scanner using html5-qrcode (Android Chrome, iOS Safari, Desktop webcam)
 * with graceful teardown and cooldown debouncing between scans.
 */
export default function QrScannerBox({ active = true, onScan, cooldownMs = 1800, className = '' }) {
    const rawId = useId();
    const containerId = `jq-qr-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const onScanRef = useRef(onScan);
    const lastScanRef = useRef({ text: '', at: 0 });
    const [camError, setCamError] = useState('');
    const [starting, setStarting] = useState(true);
    const [retryTick, setRetryTick] = useState(0);

    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    useEffect(() => {
        if (!active) return undefined;

        let cancelled = false;
        let scanner = null;
        let started = false;

        setStarting(true);
        setCamError('');

        const startCamera = async () => {
            try {
                scanner = new Html5Qrcode(containerId, { verbose: false });
                await scanner.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: { width: 220, height: 220 },
                        aspectRatio: 1.0,
                    },
                    (decodedText) => {
                        const now = Date.now();
                        if (
                            decodedText === lastScanRef.current.text &&
                            now - lastScanRef.current.at < cooldownMs
                        ) {
                            return;
                        }
                        lastScanRef.current = { text: decodedText, at: now };
                        onScanRef.current?.(decodedText);
                    },
                    () => {
                        // ignore non-QR frame ticks
                    }
                );
                started = true;
                if (!cancelled) setStarting(false);
            } catch (err) {
                if (!cancelled) {
                    setStarting(false);
                    const msg = String(err?.message || err || '');
                    if (/Permission|NotAllowed/i.test(msg)) {
                        setCamError('Walang pahintulot sa camera. Payagan ang camera o gamitin ang manual input sa ibaba.');
                    } else {
                        setCamError('Hindi mabuksan ang camera sa device na ito. Gamitin ang manual input sa ibaba.');
                    }
                }
            }
        };

        startCamera();

        return () => {
            cancelled = true;
            if (scanner) {
                const cleanup = started ? scanner.stop().catch(() => {}) : Promise.resolve();
                cleanup.finally(() => {
                    try {
                        scanner.clear();
                    } catch {
                        // ignore DOM cleanup error
                    }
                });
            }
        };
    }, [active, containerId, cooldownMs, retryTick]);

    return (
        <div className={`relative rounded-2xl overflow-hidden bg-stone-900 border border-stone-200 ${className}`}>
            <div id={containerId} className="w-full min-h-[240px]" />

            {starting && !camError && (
                <div className="absolute inset-0 bg-stone-900/90 flex flex-col items-center justify-center gap-2 text-stone-200 text-xs font-medium">
                    <Camera className="w-6 h-6 text-amber-400 animate-pulse" />
                    <span>Binubuksan ang camera...</span>
                </div>
            )}

            {camError && (
                <div className="absolute inset-0 bg-stone-900/95 p-5 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center">
                        <CameraOff className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-stone-200 leading-relaxed max-w-xs">{camError}</p>
                    <button
                        type="button"
                        onClick={() => setRetryTick((t) => t + 1)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer transition"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Subukan Ulit ang Camera
                    </button>
                </div>
            )}
        </div>
    );
}
