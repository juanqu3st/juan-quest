import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { clearOfflineSession, OFFLINE_TOKEN } from '../utils/offlineEngine';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const raw = localStorage.getItem('juanquest_user');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState(() => {
        const token = localStorage.getItem('juanquest_token');
        return Boolean(token && token !== OFFLINE_TOKEN);
    });

    useEffect(() => {
        const token = localStorage.getItem('juanquest_token');
        if (!token || token === OFFLINE_TOKEN) {
            setLoading(false);
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setLoading(false);
            return;
        }
        authApi
            .me()
            .then((res) => {
                setUser(res.user);
                localStorage.setItem('juanquest_user', JSON.stringify(res.user));
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    localStorage.removeItem('juanquest_token');
                    localStorage.removeItem('juanquest_user');
                    setUser(null);
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const saveAuth = (token, nextUser) => {
        localStorage.setItem('juanquest_token', token);
        localStorage.setItem('juanquest_user', JSON.stringify(nextUser));
        setUser(nextUser);
    };

    const updateUser = (patch) => {
        setUser((prev) => {
            const updated = { ...prev, ...patch };
            localStorage.setItem('juanquest_user', JSON.stringify(updated));
            return updated;
        });
    };

    const logout = async () => {
        const token = localStorage.getItem('juanquest_token');
        if (token && token !== OFFLINE_TOKEN) {
            try {
                await authApi.logout();
            } catch {
                // Clear client token regardless
            }
        }
        clearOfflineSession();
        localStorage.removeItem('juanquest_token');
        localStorage.removeItem('juanquest_user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, saveAuth, updateUser, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

export function ProtectedRoute({ role, children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] text-sm font-semibold text-slate-600">
                Naghahanda ng sesyon...
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (role && user.role !== role) {
        return <Navigate to={user.role === 'teacher' ? '/teacher/monitor' : '/student/world'} replace />;
    }

    return children;
}
