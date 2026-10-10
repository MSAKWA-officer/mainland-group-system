const TONES = {
  ok: 'bg-emerald-100 text-emerald-800', warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-red-100 text-red-800', off: 'bg-slate-200 text-slate-700',
};
export default function Pill({ tone, children }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TONES[tone] || TONES.off}`}>{children}</span>;
}
