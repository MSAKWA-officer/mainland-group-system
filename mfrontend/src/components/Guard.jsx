import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Route guard. `perm` may be one permission or a list (any one of them is enough).
// The API enforces the same rule; redirecting is only convenience.
export default function Guard({ perm, children }) {
  const { can } = useAuth();
  return !perm || [].concat(perm).some(can) ? children : <Navigate to="/" replace />;
}
