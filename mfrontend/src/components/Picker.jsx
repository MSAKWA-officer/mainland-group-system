import { useEffect, useState } from 'react';

// Search box + select for picking one record from a long list (items, customers, orders).
// load(search) must return [{ id, label, ...anything }]. onPick receives the chosen option or null.
export default function Picker({ value, selected, load, onPick, placeholder = 'Select…', required, disabled }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try { const r = await load(q.trim()); if (live) setOpts(r); } catch { if (live) setOpts([]); }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [q]); // eslint-disable-line
  const list = selected && !opts.some((o) => o.id === selected.id) ? [selected, ...opts] : opts;
  return (
    <div className="space-y-2">
      <input className="input" placeholder="Type to search…" aria-label="Search" value={q} maxLength={80} disabled={disabled} onChange={(e) => setQ(e.target.value)} />
      <select className="input" value={value || ''} required={required} disabled={disabled} onChange={(e) => onPick(list.find((o) => o.id === e.target.value) || null)}>
        <option value="">{placeholder}</option>
        {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}
