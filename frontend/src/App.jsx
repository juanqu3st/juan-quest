import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AuthProvider, ProtectedRoute } from './context/AuthContext';
import { PwaProvider } from './context/PwaContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/auth/LoginPage';

const StudentWorldPage = lazy(() => import('./pages/student/StudentWorldPage'));
const TeacherSessionsPage = lazy(() => import('./pages/teacher/TeacherSessionsPage'));
const TeacherMonitorPage = lazy(() => import('./pages/teacher/TeacherMonitorPage'));
const TeacherLessonPage = lazy(() => import('./pages/teacher/TeacherLessonPage'));
const TeacherStudioPage = lazy(() => import('./pages/teacher/TeacherStudioPage'));
const TeacherMapsPage = lazy(() => import('./pages/teacher/TeacherMapsPage'));

function PageLoader() {
    return (
        <div className="min-h-dvh bg-[#FAF8F5] flex items-center justify-center text-sm font-medium text-stone-500 px-4">
            Inihahanda ang JuanQuest...
        </div>
    );
}

export default function App() {
    return (
        <MotionConfig reducedMotion="user">
            <ToastProvider>
                <PwaProvider>
                    <AuthProvider>
                        <BrowserRouter>
                            <Suspense fallback={<PageLoader />}>
                                <Routes>
                                    <Route path="/login" element={<LoginPage />} />

                                    <Route
                                        path="/student/world"
                                        element={
                                            <ProtectedRoute role="student">
                                                <StudentWorldPage />
                                            </ProtectedRoute>
                                        }
                                    />

                                    <Route
                                        path="/teacher/sessions"
                                        element={
                                            <ProtectedRoute role="teacher">
                                                <TeacherSessionsPage />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/teacher/monitor"
                                        element={
                                            <ProtectedRoute role="teacher">
                                                <TeacherMonitorPage />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/teacher/lesson"
                                        element={
                                            <ProtectedRoute role="teacher">
                                                <TeacherLessonPage />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/teacher/studio"
                                        element={
                                            <ProtectedRoute role="teacher">
                                                <TeacherStudioPage />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/teacher/maps"
                                        element={
                                            <ProtectedRoute role="teacher">
                                                <TeacherMapsPage />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route path="/teacher/cms" element={<Navigate to="/teacher/maps" replace />} />

                                    <Route path="*" element={<Navigate to="/login" replace />} />
                                </Routes>
                            </Suspense>
                        </BrowserRouter>
                    </AuthProvider>
                </PwaProvider>
            </ToastProvider>
        </MotionConfig>
    );
}
