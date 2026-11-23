import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';

export default function RegisterPage() {
    const navigate = useNavigate();
    const { saveAuth } = useAuth();
    const [form, setForm] = useState({ name: '', email: '', password: '', section: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const res = await authApi.register(form);
            saveAuth(res.token, res.user);
            navigate('/student/world');
        } catch (err) {
            setError(err.response?.data?.message || 'Hindi nagawa ang account.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-dvh bg-[#FAF8F5] flex items-center justify-center px-4 py-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-7 space-y-4">
                <div>
                    <h1 className="text-xl font-extrabold text-[#1E293B]">Magparehistro (Mag-aaral)</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Opsyonal kung nais gumamit ng sariling email.</p>
                </div>

                {error && (
                    <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3">
                    <input
                        type="text"
                        placeholder="Buong Pangalan"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-sm"
                        required
                    />
                    <input
                        type="text"
                        placeholder="Pangkat / Seksyon (Hal. Grade 7 - Rizal)"
                        value={form.section}
                        onChange={(e) => setForm({ ...form, section: e.target.value })}
                        className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-sm"
                    />
                    <input
                        type="email"
                        placeholder="Email Address"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-sm"
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password (min. 6)"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-sm"
                        required
                    />
                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full py-3 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white font-bold text-sm cursor-pointer"
                    >
                        {busy ? 'Gumagawa...' : 'Magparehistro'}
                    </button>
                </form>

                <p className="text-xs text-center text-slate-500">
                    May Join Code na?{' '}
                    <Link to="/login" className="font-bold text-[#C2410C] hover:underline">
                        Bumalik sa Login
                    </Link>
                </p>
            </div>
        </div>
    );
}
