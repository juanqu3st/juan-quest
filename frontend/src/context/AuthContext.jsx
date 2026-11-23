import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { authApi } from '../api/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const raw = localStorage.getItem('juanquest_user');
        return raw ? JSON.parse(raw) : null;
    });
    const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('juanquest_token')));

    useEffect(() => {
        const token = localStorage.getItem('juanquest_token');
        if (!token) {
            setLoading(false);
            return;
        }
        authApi
            .me()
            .then((res) => {
                setUser(res.user);
                localStorage.setItem('juanquest_user', JSON.stringify(res.user));
            })
            .catch(() => {
                localStorage.removeItem('juanquest_token');
                localStorage.removeItem('juanquest_user');
                setUser(null);
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
        try {
            await authApi.logout();
        } catch {
            // Clear client token regardless
        }
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
