import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuthStore } from '../../stores/authStore';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const loadUserInfo = useAuthStore((state) => state.loadUserInfo);
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token && !user && !loading) {
      setLoading(true);
      loadUserInfo().finally(() => setLoading(false));
    }
  }, [token, user, loadUserInfo, loading]);

  const isLoginPage = location.pathname === '/login';

  if (token && isLoginPage) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!token && !isLoginPage) {
    return <Navigate to="/login" replace />;
  }

  // Wait for user info to load before rendering protected content
  if (token && !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return <>{children}</>;
};
