export default function Title({ children, sub }) {
  return (<div className="mb-5"><h1 className="text-2xl font-bold">{children}</h1>{sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}</div>);
}
