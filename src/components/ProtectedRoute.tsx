import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permissionKey?: string;
}

const ProtectedRoute = ({ children, permissionKey }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, user, userPermissions } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Detect if current path is a representative path to redirect to rep login
    const isRepPath = window.location.pathname.startsWith('/rep');
    return <Navigate to={isRepPath ? "/rep/login" : "/login"} replace />;
  }

  if (permissionKey) {
    const isPrivileged = user?.is_superadmin || user?.role === 'owner' || user?.role === 'admin';
    const allowed = isPrivileged || (userPermissions && (userPermissions as any)[permissionKey] === true);
    if (!allowed) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
