import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Gamepad2, GraduationCap, Play } from 'lucide-react';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
    const navigate = useNavigate();
    const { user, loading, saveAuth } = useAuth();
    const [tab, setTab] = useState('student');
    const [joinCode, setJoinCode] = useState('');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    if (!loading && user) {
        return <Navigate to={user.role === 'teacher' ? '/teacher/monitor' : '/student/world'} replace />;
    }

    const handleStudentJoin = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const res = await authApi.joinByCode({ join_code: joinCode, full_name: fullName });
            saveAuth(res.token, res.user);
            navigate('/student/world');
        } catch (err) {
            const msg =
                err.response?.data?.errors?.join_code?.[0] ||
                err.response?.data?.errors?.full_name?.[0] ||
                err.response?.data?.message ||
                'Hindi makapasok. Suriin ang Code ng Klase at iyong pangalan.';
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    const handleEmailLogin = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const res = await authApi.login({ email, password });
            saveAuth(res.token, res.user);
            navigate(res.user.role === 'teacher' ? '/teacher/monitor' : '/student/world');
        } catch (err) {
            setError(err.response?.data?.errors?.email?.[0] || 'Mali ang email o password.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="relative min-h-dvh bg-[#FAF8F5] flex items-center justify-center px-4 py-8 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-hidden">
            {/* Subtle warm storybook backdrop glow */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[540px] h-[260px] rounded-full opacity-45 blur-3xl"
                style={{
                    background:
                        'radial-gradient(circle, rgba(251, 191, 36, 0.32) 0%, rgba(194, 65, 12, 0.14) 55%, rgba(250, 248, 245, 0) 100%)',
                }}
            />

            <div className="relative w-full max-w-[410px] space-y-6">
                {/* Compact Game Crest */}
                <div className="text-center space-y-2.5">
                    <img
                        src="/logo.svg"
                        alt="JuanQuest"
                        className="mx-auto w-16 h-16 sm:w-[72px] sm:h-[72px] select-none drop-shadow-xs"
                    />
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
                            JUANQUEST
                        </h1>
                        <p className="text-xs sm:text-sm font-medium text-stone-500 mt-0.5">
                            Si Juan Osong · Grade 7 Filipino
                        </p>
                    </div>
                </div>

                {/* Clean Single-Card Login Box */}
                <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm p-5 sm:p-6">
                    {/* Role Switcher */}
                    <div className="grid grid-cols-2 rounded-xl bg-[#FAF8F5] border border-stone-200/80 p-1 mb-5">
                        <button
                            type="button"
                            onClick={() => {
                                setTab('student');
                                setError('');
                            }}
                            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                                tab === 'student'
                                    ? 'bg-white text-[#C2410C] shadow-2xs border border-stone-200/70'
                                    : 'text-stone-500 hover:text-stone-800'
                            }`}
                        >
                            <Gamepad2 className="w-4 h-4" />
                            Manlalaro
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setTab('teacher');
                                setError('');
                            }}
                            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                                tab === 'teacher'
                                    ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/70'
                                    : 'text-stone-500 hover:text-stone-800'
                            }`}
                        >
                            <GraduationCap className="w-4 h-4" />
                            Guro
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                            {error}
                        </div>
                    )}

                    {tab === 'student' ? (
                        <form onSubmit={handleStudentJoin} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                    Code ng Klase
                                </label>
                                <input
                                    type="text"
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                    placeholder="Ilagay ang code"
                                    autoComplete="off"
                                    className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-base font-bold tracking-widest uppercase text-stone-900 placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-stone-400 focus:border-[#C2410C] outline-none transition"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                    Pangalan
                                </label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Ilagay ang iyong pangalan"
                                    autoComplete="name"
                                    className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#C2410C] outline-none transition"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={busy}
                                className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-60 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                            >
                                <Play className="w-4 h-4 fill-current" />
                                <span>{busy ? 'Pumapasok...' : 'Simulan ang Laro'}</span>
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Ilagay ang email"
                                    autoComplete="email"
                                    className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 outline-none transition"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Ilagay ang password"
                                    autoComplete="current-password"
                                    className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 outline-none transition"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={busy}
                                className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white font-bold text-sm transition cursor-pointer"
                            >
                                {busy ? 'Pumapasok...' : 'Buksan ang Portal'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
