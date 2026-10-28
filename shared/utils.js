export function cn(...values) {
  return values.filter(Boolean).join(' ');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sortByDate(events = []) {
  return [...events].sort((a, b) => {
    const dateA = `${a.eventDate || ''}T${a.startTime || '00:00'}`;
    const dateB = `${b.eventDate || ''}T${b.startTime || '00:00'}`;
    return dateA.localeCompare(dateB);
  });
}

export function parseError(error) {
  if (!error) return { message: 'Something went wrong.' };
  if (typeof error === 'string') return { message: error };
  return {
    message: error.message || error.error?.message || 'Something went wrong.',
    code: error.code || error.error?.code,
    details: error.details || error.error?.details,
  };
}

export function normaliseSearch(value) {
  return String(value || '').trim().toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function downloadNameSafe(value) {
  return String(value || 'showflow')
    // Filenames must omit control characters and Windows-reserved punctuation.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
