// World-clock math using Intl with an IANA timeZone (no bundled tz database needed).

const fmtCache = new Map();

function partsFormatter(zone) {
  if (!fmtCache.has(zone)) {
    fmtCache.set(
      zone,
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      }),
    );
  }
  return fmtCache.get(zone);
}

/** Wall-clock parts in a zone: { y, mo, d, h, m, s }. */
export function zoneParts(zone, at = Date.now()) {
  const p = {};
  for (const { type, value } of partsFormatter(zone).formatToParts(at)) p[type] = Number(value);
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, m: p.minute, s: p.second };
}

/** Zone's UTC offset in minutes at a moment (DST aware). */
export function zoneOffsetMin(zone, at = Date.now()) {
  const p = zoneParts(zone, at);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m, p.s);
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60_000);
}

/** Offset of a zone relative to this device: "+4:30", "−5:30", "±0". */
export function relativeOffset(zone, at = Date.now()) {
  const localOffset = -new Date(at).getTimezoneOffset();
  const diff = zoneOffsetMin(zone, at) - localOffset;
  if (diff === 0) return '±0';
  const sign = diff > 0 ? '+' : '−';
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${sign}${h}:${String(m).padStart(2, '0')}` : `${sign}${h}`;
}

/** Relative day label: "Today", "Tomorrow", "Yesterday". */
export function relativeDay(zone, at = Date.now()) {
  const z = zoneParts(zone, at);
  const l = new Date(at);
  const diff = Math.round((Date.UTC(z.y, z.mo - 1, z.d) - Date.UTC(l.getFullYear(), l.getMonth(), l.getDate())) / 86_400_000);
  return diff === 0 ? 'Today' : diff > 0 ? 'Tomorrow' : 'Yesterday';
}

export const isDaytime = (hour) => hour >= 6 && hour < 18;

export function isValidZone(zone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
