import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Compass, GraduationCap, KeyRound, UserCheck } from 'lucide-react';
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
                'Hindi makapasok. Suriin ang iyong Join Code at Pangalan.';
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
        <div className="min-h-dvh bg-[#FAF8F5] flex items-center justify-center px-4 py-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="w-full max-w-4xl grid md:grid-cols-5 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
                {/* Left Folklore Information Panel (Compact header banner on mobile so form is immediately visible!) */}
                <div className="md:col-span-2 bg-[#1E293B] text-[#FAF8F5] px-5 py-4 md:p-7 flex flex-col justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-[11px] font-bold uppercase tracking-wider text-orange-300 mb-2.5 md:mb-5">
                            <Compass className="w-3.5 h-3.5" />
                            Grade 7 Filipino E-SIM
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                            JUANQUEST
                        </h1>
                        <p className="mt-0.5 md:mt-1 text-orange-300 font-semibold text-xs md:text-sm">
                            Kuwentong-Bayang Si Juan Osong
                        </p>
                        <p className="hidden md:block mt-5 text-sm text-slate-300 leading-relaxed">
                            Lakbayin ang 3D na mundo ng kuwentong-bayan, lutasin ang limang antas, ingatan ang tatlong puso, at makipagtulungan sa iyong pangkat.
                        </p>
                    </div>

                    <div className="hidden md:block mt-8 space-y-2.5 text-xs text-slate-300 border-t border-slate-700 pt-4">
                        <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-[#22C55E] shrink-0" />
                            <span>5 Interaktibong Mapa (50 Kabuuang Puntos)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <KeyRound className="w-4 h-4 text-orange-300 shrink-0" />
                            <span>Mabilisang Pagsali gamit ang PIN Code</span>
                        </div>
                    </div>
                </div>

                {/* Right Form Panel */}
                <div className="md:col-span-3 p-5 sm:p-7 md:p-9 bg-white">
                    <div className="flex rounded-xl bg-[#FAF8F5] border border-[#E5E7EB] p-1 mb-6">
                        <button
                            type="button"
                            onClick={() => {
                                setTab('student');
                                setError('');
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                                tab === 'student'
                                    ? 'bg-white text-[#C2410C] border border-[#E5E7EB]'
                                    : 'text-slate-600 hover:text-[#1E293B]'
                            }`}
                        >
                            <KeyRound className="w-4 h-4" />
                            Mag-aaral (PIN + Pangalan)
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setTab('teacher');
                                setError('');
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                                tab === 'teacher'
                                    ? 'bg-white text-[#1E293B] border border-[#E5E7EB]'
                                    : 'text-slate-600 hover:text-[#1E293B]'
                            }`}
                        >
                            <GraduationCap className="w-4 h-4" />
                            Guro / Email Login
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                            {error}
                        </div>
                    )}

                    {tab === 'student' ? (
                        <form onSubmit={handleStudentJoin} className="space-y-4">
                            <div>
                                <h2 className="text-xl font-extrabold text-[#1E293B]">Sumali sa Klase</h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Ilagay ang Join Code mula sa iyong guro at ang iyong pangalan (o pangalan ng kinatawan ng pangkat).
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                    PIN / Join Code
                                </label>
                                <input
                                    type="text"
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                    placeholder="JUAN7A"
                                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base font-bold tracking-widest uppercase text-[#1E293B] focus:border-[#C2410C] outline-none"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                    Buong Pangalan / Kinatawan ng Pangkat
                                </label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Hal. Juan Dela Cruz"
                                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm text-[#1E293B] focus:border-[#C2410C] outline-none"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={busy}
                                className="w-full py-3.5 px-4 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-60 text-white font-bold text-sm transition cursor-pointer"
                            >
                                {busy ? 'Kumokonekta...' : 'Pumasok sa 3D Mundo'}
                            </button>

                            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                                <span>
                                    Sample Code: <strong className="font-mono text-[#1E293B]">JUAN7A</strong>
                                </span>
                                <Link to="/register" className="font-semibold text-[#C2410C] hover:underline">
                                    Gumawa ng Email Account
                                </Link>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div>
                                <h2 className="text-xl font-extrabold text-[#1E293B]">Portal ng Guro</h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Pamahalaan ang mga sesyon, grupo, live monitor, at aralin.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="teacher@juanquest.ph"
                                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm text-[#1E293B] focus:border-[#1E293B] outline-none"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm text-[#1E293B] focus:border-[#1E293B] outline-none"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={busy}
                                className="w-full py-3.5 px-4 rounded-xl bg-[#1E293B] hover:bg-slate-800 disabled:opacity-60 text-white font-bold text-sm transition cursor-pointer"
                            >
                                {busy ? 'Nagla-log in...' : 'Mag-log in'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
