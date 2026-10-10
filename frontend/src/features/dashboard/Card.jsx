// White card with a soft bottom shadow and a plain grey title, as on the SIMS dashboard.
export default function Card({ title, action, children, className = '' }) {
  return (
    <section className={`bg-white shadow-[0_1px_4px_rgba(0,0,0,.28)] ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <h2 className="text-[17px] text-[#555]">{title}</h2>
        {action}
      </div>
      <div className="px-4 pb-5 pt-4">{children}</div>
    </section>
  );
}
