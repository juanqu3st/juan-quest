import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    Activity,
    Clapperboard,
    LogOut,
    Map,
    Menu,
    Music,
    Users,
    X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePwa } from '../../context/PwaContext';

const NAV_GROUPS = [
    {
        heading: 'Klase',
        subHeading: 'Classroom',
        items: [
            { label: 'Monitor & Records', sub: 'Live laro at tala ng marka', to: '/teacher/monitor', icon: Activity },
            { label: 'Sessions & Lobby', sub: 'Class PIN, Mode at Status', to: '/teacher/sessions', icon: Users },
        ],
    },
    {
        heading: 'Nilalaman',
        subHeading: 'Content Studio',
        items: [
            { label: 'Aralin & Tunog', sub: 'Lesson at Feedback Audio', to: '/teacher/lesson', icon: Music },
            { label: 'Video & Voice-Over', sub: '3D Story at Dubbing', to: '/teacher/studio', icon: Clapperboard },
            { label: 'Mga Mapa & Tanong', sub: 'Maps, Timers at Questions', to: '/teacher/maps', icon: Map },
        ],
    },
];

function getInitials(name = '') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'GR';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TeacherLayout({ title, subtitle, toolbarRight, children }) {
    const { user, logout } = useAuth();
    const { setGameplayActive } = usePwa();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Suppress blocking PWA Force Update modal while teacher is running Live Monitor, Lobby, or CMS
    useEffect(() => {
        setGameplayActive(true);
        return () => setGameplayActive(false);
    }, [setGameplayActive]);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const sidebarContent = (
        <div className="flex flex-col justify-between h-full">
            <div>
                <div className="h-[60px] px-4 border-b border-slate-200/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <img
                            src="/logo.svg"
                            alt="JuanQuest"
                            className="w-9 h-9 shrink-0 select-none"
                        />
                        <div className="min-w-0">
                            <span className="text-sm font-extrabold tracking-tight text-slate-900 block leading-tight truncate">
                                JuanQuest
                            </span>
                            <span className="text-[11px] font-medium text-slate-400 block leading-tight truncate">
                                Portal ng Guro
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Isara ang menu"
                        className="lg:hidden w-10 h-10 rounded-xl text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <nav className="p-3 space-y-5">
                    {NAV_GROUPS.map((group) => (
                        <div key={group.heading} className="space-y-1">
                            <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <span>{group.heading}</span>
                                <span className="text-slate-300">·</span>
                                <span className="font-medium text-slate-400/90">{group.subHeading}</span>
                            </p>
                            {group.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        onClick={() => setMobileOpen(false)}
                                        className={({ isActive }) =>
                                            `flex items-center gap-2.5 px-3 py-2 rounded-xl transition ${
                                                isActive
                                                    ? 'bg-orange-50/80 text-slate-900 border border-orange-200/70'
                                                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border border-transparent'
                                            }`
                                        }
                                    >
                                        {({ isActive }) => (
                                            <>
                                                <Icon
                                                    className={`w-4 h-4 shrink-0 ${
                                                        isActive ? 'text-[#C2410C]' : 'text-slate-400'
                                                    }`}
                                                />
                                                <div className="min-w-0">
                                                    <span className="block text-xs font-semibold leading-tight truncate">
                                                        {item.label}
                                                    </span>
                                                    <span className="block text-[10px] text-slate-400 truncate mt-0.5">
                                                        {item.sub}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </NavLink>
                                );
                            })}
                        </div>
                    ))}
                </nav>
            </div>

            <div className="p-3.5 border-t border-slate-200/80 bg-slate-50/60">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        {getInitials(user?.name)}
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate leading-tight">{user?.name}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{user?.email}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Mag-log out</span>
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-dvh flex bg-[#F8FAFC] text-slate-900">
            {/* Desktop 248px Clean Sidebar */}
            <aside className="hidden lg:block w-[248px] shrink-0 bg-white border-r border-slate-200/80 h-dvh sticky top-0">
                {sidebarContent}
            </aside>

            {/* Mobile / Tablet Slide-over Sidebar */}
            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-50 flex">
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
                        onClick={() => setMobileOpen(false)}
                    />
                    <aside className="relative w-72 max-w-[85vw] bg-white border-r border-slate-200 h-dvh z-10 shadow-xl pt-safe pb-safe">
                        {sidebarContent}
                    </aside>
                </div>
            )}

            {/* Main Workspace Canvas */}
            <div className="flex-1 min-w-0 flex flex-col">
                <header className="min-h-[60px] shrink-0 px-3.5 sm:px-6 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 bg-white/95 backdrop-blur-sm sticky top-0 z-20">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-initial">
                        <button
                            type="button"
                            onClick={() => setMobileOpen(true)}
                            aria-label="Buksan ang menu"
                            className="lg:hidden w-10 h-10 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center cursor-pointer shrink-0"
                        >
                            <Menu className="w-4 h-4" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-[15px] font-bold text-slate-900 truncate leading-tight">
                                {title}
                            </h1>
                            {subtitle && (
                                <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>
                            )}
                        </div>
                    </div>
                    {toolbarRight && (
                        <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">{toolbarRight}</div>
                    )}
                </header>
                <main className="flex-1 p-3.5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-7xl w-full mx-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
