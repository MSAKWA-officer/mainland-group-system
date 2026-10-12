export default function Field({ label, error, children }) {
  return (<div><label className="label">{label}</label>{children}{error && <p className="mt-1 text-xs text-danger">{error}</p>}</div>);
}
