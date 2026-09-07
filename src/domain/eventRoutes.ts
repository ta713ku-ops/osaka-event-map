const normalizeBase = (base: string) => {
  const value = base.startsWith('/') ? base : `/${base}`;
  return value.endsWith('/') ? value : `${value}/`;
};

export function eventPath(eventId: string, base = import.meta.env.BASE_URL) {
  return `${normalizeBase(base)}events/${encodeURIComponent(eventId)}/`;
}

export function eventIdFromPath(pathname: string, base = import.meta.env.BASE_URL) {
  const normalizedBase = normalizeBase(base);
  if (!pathname.startsWith(normalizedBase)) return null;
  const relative = pathname.slice(normalizedBase.length);
  const match = /^events\/([^/]+)\/?$/u.exec(relative);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return /^[A-Za-z0-9_-]+$/u.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function appHomePath(base = import.meta.env.BASE_URL) {
  return normalizeBase(base);
}
