import { useState } from 'react';

export default function AuditFilters({ onApply }) {
  const [q, setQ] = useState({ username: '', action: '', outcome: '', from: '', to: '' });
  const apply = (e) => {
    e.preventDefault();
    onApply(Object.fromEntries(Object.entries(q).filter(([, v]) => v).map(([k, v]) => [k, k === 'to' ? `${v}T23:59:59` : v])));
  };
  return (
    <form onSubmit={apply} className="mb-4 grid gap-3 px-4 sm:grid-cols-3 lg:grid-cols-6">
      <input className="input !text-[14px] !text-[#212121]" placeholder="Username" value={q.username} onChange={(e) => setQ({ ...q, username: e.target.value })} />
      <input className="input !text-[14px] !text-[#212121]" placeholder="Action, e.g. USER_CREATED" value={q.action} onChange={(e) => setQ({ ...q, action: e.target.value })} />
      <select className="input !text-[14px] !text-[#212121]" value={q.outcome} onChange={(e) => setQ({ ...q, outcome: e.target.value })}><option value="">Any outcome</option><option>SUCCESS</option><option>DENIED</option><option>FAILED</option></select>
      <input className="input !text-[14px] !text-[#212121]" type="date" aria-label="From" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} />
      <input className="input !text-[14px] !text-[#212121]" type="date" aria-label="To" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} />
      <button className="btn-primary text-[14px] font-bold">Filter</button>
    </form>
  );
}
