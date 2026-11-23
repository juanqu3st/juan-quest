import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import StudentWorldPage from './pages/student/StudentWorldPage';
import TeacherSessionsPage from './pages/teacher/TeacherSessionsPage';
import TeacherMonitorPage from './pages/teacher/TeacherMonitorPage';
import TeacherLessonPage from './pages/teacher/TeacherLessonPage';
import TeacherStudioPage from './pages/teacher/TeacherStudioPage';
import TeacherMapsPage from './pages/teacher/TeacherMapsPage';

export default function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />

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
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
}
