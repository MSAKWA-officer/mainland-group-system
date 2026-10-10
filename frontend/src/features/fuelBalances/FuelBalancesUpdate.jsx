import { Navigate, useParams } from 'react-router-dom';

// A fuel balance cannot be edited directly. Its id is the id of the FUNDING, so the only way to change the numbers
// is to correct the funding itself (the usage lines are corrected under Fuel usage). This page forwards to the funding's edit screen.
export default function FuelBalancesUpdate() {
  const { id } = useParams();
  return <Navigate to={`/fuel-funding/${id}/edit`} replace />;
}
