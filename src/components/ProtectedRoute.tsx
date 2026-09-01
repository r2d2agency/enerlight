import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permissionKey?: string;
}

const ProtectedRoute = ({ children, permissionKey }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, user, userPermissions } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.must_change_password && location.pathname !== '/nova-senha') {
    return <Navigate to="/nova-senha" replace />;
  }

  if (permissionKey) {
    const isPrivileged = user?.is_superadmin || user?.role === 'owner' || user?.role === 'admin';
    const allowed = isPrivileged || (userPermissions && (userPermissions as any)[permissionKey] === true);
    if (!allowed) {
      console.warn(`[ProtectedRoute] Access denied for permission ${permissionKey}. Redirecting to dashboard.`);
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
