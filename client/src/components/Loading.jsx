export default function Loading({ text = 'Loading…' }) { return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />{text}</div>; }
