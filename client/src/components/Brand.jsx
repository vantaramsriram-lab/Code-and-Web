import { Link } from 'react-router-dom';
export default function Brand({ compact = false }) {
  return <Link className={`brand ${compact ? 'brand-compact' : ''}`} to="/" aria-label="Spark Club Quiz home">
    <span className="brand-mark" aria-hidden="true"><img src="/spark-logo.png" alt=""/></span><span><b>SPARK</b><small>CLUB QUIZ</small></span>
  </Link>;
}
