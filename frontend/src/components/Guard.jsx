import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Route guard. The API enforces the same rule; redirecting is only convenience.
export default function Guard({ perm, children }) {
  const { can } = useAuth();
  return !perm || can(perm) ? children : <Navigate to="/" replace />;
}
