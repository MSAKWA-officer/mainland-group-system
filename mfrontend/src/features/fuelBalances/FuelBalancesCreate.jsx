import { Navigate, useSearchParams } from 'react-router-dom';

// A fuel balance is never typed in: it is calculated from an approved funding minus its fuel usage.
// "New" therefore means "spend from a balance", which is recorded as Fuel usage. This page just forwards there
// (keeping ?fundingId=... so the funding is already selected), so old links and bookmarks keep working in every language.
export default function FuelBalancesCreate() {
  const [sp] = useSearchParams();
  const fundingId = sp.get('fundingId');
  return <Navigate to={fundingId ? `/fuel-usage/new?fundingId=${encodeURIComponent(fundingId)}` : '/fuel-usage/new'} replace />;
}
