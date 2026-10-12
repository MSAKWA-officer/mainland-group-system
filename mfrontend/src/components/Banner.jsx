export default function Banner({ kind = 'error', children }) {
  if (!children) return null;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-md border px-3 py-2 text-sm ${kind === 'error' ? 'border-danger/30 bg-red-50 text-danger' : 'border-brand/30 bg-emerald-50 text-brand-dark'}`}>{children}</div>
  );
}
