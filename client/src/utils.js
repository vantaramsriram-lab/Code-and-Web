export function formatIst(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short', ...options }).format(date);
}
export function toIstInput(value) {
  if (!value) return '';
  const d = new Date(new Date(value).getTime() + 330 * 60000);
  return d.toISOString().slice(0, 16);
}
export function fromIstInput(value) { return value ? new Date(`${value}:00+05:30`).toISOString() : null; }
export function downloadText(text, name, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}
export function displayError(error) { return error?.message || 'Something went wrong. Please try again.'; }
