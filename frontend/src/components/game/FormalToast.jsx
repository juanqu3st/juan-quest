import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, Lock } from 'lucide-react';

const STYLES = {
    success: {
        box: 'bg-emerald-50 border-emerald-200 text-emerald-950',
        title: 'text-[#15803D]',
        icon: 'text-[#15803D]',
        Icon: CheckCircle2,
    },
    error: {
        box: 'bg-rose-50 border-rose-200 text-rose-950',
        title: 'text-rose-700',
        icon: 'text-rose-600',
        Icon: AlertCircle,
    },
    warning: {
        box: 'bg-amber-50 border-amber-200 text-amber-950',
        title: 'text-amber-800',
        icon: 'text-amber-600',
        Icon: AlertCircle,
    },
    locked: {
        box: 'bg-white border-stone-200 text-stone-800',
        title: 'text-[#C2410C]',
        icon: 'text-[#C2410C]',
        Icon: Lock,
    },
    info: {
        box: 'bg-white border-stone-200 text-stone-800',
        title: 'text-stone-900',
        icon: 'text-stone-600',
        Icon: Info,
    },
};

/**
 * Clean, flat, minimal auto-dismiss toast — no X button, consistent top-center placement across all pages and modals.
 */
export default function FormalToast({ toast, position = 'top' }) {
    const cfg = STYLES[toast?.type] || STYLES.info;
    const Icon = cfg.Icon;
    const isTop = position === 'top';

    return (
        <div
            aria-live="polite"
            className={`fixed ${
                isTop
                    ? 'top-[calc(env(safe-area-inset-top)+4.25rem)] sm:top-[calc(env(safe-area-inset-top)+4.75rem)]'
                    : 'bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]'
            } inset-x-3 sm:inset-x-4 z-[90] pointer-events-none flex justify-center px-safe`}
        >
            <AnimatePresence mode="wait">
                {toast && (
                    <motion.div
                        key={toast.id}
                        role="status"
                        initial={{ opacity: 0, y: isTop ? -10 : 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: isTop ? -8 : 8 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className={`w-full max-w-md border ${cfg.box} backdrop-blur-md rounded-2xl px-4 py-3 shadow-md flex items-start gap-2.5`}
                    >
                        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.icon}`} />
                        <p className="text-[13px] leading-snug flex-1">
                            {toast.title && (
                                <span className={`font-bold mr-1.5 ${cfg.title}`}>{toast.title}</span>
                            )}
                            <span className={!toast.title && toast.type === 'success' ? `font-bold ${cfg.title}` : ''}>
                                {toast.message}
                            </span>
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
