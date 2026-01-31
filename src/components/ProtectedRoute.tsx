import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { Loading } from '@/components/ui';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireCasesAccess?: boolean;
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
  requireCasesAccess = false,
}: ProtectedRouteProps) {
  const { user, isInitialized } = useAuthStore();
  const location = useLocation();

  if (!isInitialized) {
    return <Loading fullScreen />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/levels" replace />;
  }

  if (requireCasesAccess && !user.permissions?.casesAccess && user.role !== 'admin') {
    return <Navigate to="/levels" replace />;
  }

  return <>{children}</>;
}
