// Small display pieces shared by Customer Balance, Payment History and Credit Ageing.
export const Stat = ({ label, value, tone = '' }) => (
  <div className="rounded-md border border-line p-4">
    <div className="text-xs uppercase">{label}</div>
    <div className={`mt-1 text-xl font-semibold ${tone}`}>{value}</div>
  </div>
);

export const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);

export const PagerBar = ({ page, total, limit, set }) => (
  <div className="flex items-center justify-between px-6 py-3 text-sm text-black">
    <span>{total} records</span>
    <div className="flex gap-2">
      <button className="btn-ghost" disabled={page <= 1} onClick={() => set(page - 1)}>Previous</button>
      <button className="btn-ghost" disabled={page * limit >= total} onClick={() => set(page + 1)}>Next</button>
    </div>
  </div>
);

// Ageing buckets, in the order they are shown. `key` is the field name in the API response, `code` the filter value.
export const BUCKETS = [
  { key: 'current', code: 'CURRENT', label: 'Not due' }, { key: 'days1to30', code: 'DAYS_1_30', label: '1–30 days' },
  { key: 'days31to60', code: 'DAYS_31_60', label: '31–60 days' }, { key: 'days61to90', code: 'DAYS_61_90', label: '61–90 days' },
  { key: 'over90', code: 'OVER_90', label: 'Over 90 days' },
];
export const bucketLabel = (code) => BUCKETS.find((b) => b.code === code)?.label || code;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
