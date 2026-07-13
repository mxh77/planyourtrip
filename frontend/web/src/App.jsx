import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import RoadtripPage from './pages/RoadtripPage.jsx';
import RoadtripFormPage from './pages/RoadtripFormPage.jsx';
import DownloadPage from './pages/DownloadPage.jsx';
import AdminUsersPage from './pages/AdminUsersPage.jsx';
import AdminSuggestionsPage from './pages/AdminSuggestionsPage.jsx';
import AdminDevHub from './pages/AdminDevHub.jsx';
import PreviewQAReporter from './components/PreviewQAReporter.jsx';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

function decodeToken(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return {}; }
}

function AdminRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  const { isAdmin } = decodeToken(token);
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/roadtrips/new" element={<ProtectedRoute><RoadtripFormPage /></ProtectedRoute>} />
        <Route path="/roadtrips/:id/edit" element={<ProtectedRoute><RoadtripFormPage /></ProtectedRoute>} />
        <Route path="/roadtrips/:id" element={<ProtectedRoute><RoadtripPage /></ProtectedRoute>} />
        <Route path="/admin" element={<Navigate to="/admin/devhub" replace />} />
        <Route path="/admin/suggestions" element={<AdminRoute><AdminSuggestionsPage /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="/admin/devhub" element={<AdminRoute><AdminDevHub /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PreviewQAReporter />
    </BrowserRouter>
  );
}
