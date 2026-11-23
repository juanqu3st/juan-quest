import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import FormalToast from '../components/game/FormalToast';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toast, setToast] = useState(null);
    const timerRef = useRef(null);

    const dismissToast = useCallback(() => {
        clearTimeout(timerRef.current);
        setToast(null);
    }, []);

    const showToast = useCallback((type, message, title = '', durationMs) => {
        clearTimeout(timerRef.current);
        const ms = durationMs ?? (type === 'error' ? 3600 : 2800);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setToast({ id, type, title, message, durationMs: ms });
        timerRef.current = setTimeout(() => setToast(null), ms);
    }, []);

    useEffect(() => () => clearTimeout(timerRef.current), []);

    return (
        <ToastContext.Provider value={{ toast, showToast, dismissToast }}>
            {children}
            <FormalToast toast={toast} position="top" />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return ctx;
}
