// lib/photo-filename.ts
// Format nama berkas bukti foto Google Drive (tanpa urutan - urutan ditentukan oleh GAS).
// Format: [KODE]-[tgl]-[slot]-[user]

export interface BuildPhotoBaseNameOptions {
  branchCode?: string | null;
  shiftDate?: string | null;
  startTime?: string | null;
  username?: string | null;
}

export const PHOTO_BASE_NAME_REGEX =
  /^[A-Z0-9][A-Z0-9-]{0,40}-\d{8}-[a-z]+-[a-z0-9._-]{1,30}$/;

export function isValidPhotoBaseName(name: string): boolean {
  return PHOTO_BASE_NAME_REGEX.test(name);
}

/**
 * Petakan waktu mulai shift (HH:mm) ke 5 slot jam:
 * 00:00–05:59 -> malam
 * 06:00–10:59 -> pagi
 * 11:00–14:59 -> siang
 * 15:00–18:59 -> sore
 * 19:00–23:59 -> malam
 * fallback -> umum
 */
export function getShiftTimeSlot(startTime?: string | null): string {
  if (!startTime || typeof startTime !== 'string') return 'umum';
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 'umum';

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return 'umum';
  }

  const minutesFromMidnight = hour * 60 + minute;
  if (minutesFromMidnight < 6 * 60) return 'malam'; // 00:00 - 05:59
  if (minutesFromMidnight < 11 * 60) return 'pagi'; // 06:00 - 10:59
  if (minutesFromMidnight < 15 * 60) return 'siang'; // 11:00 - 14:59
  if (minutesFromMidnight < 19 * 60) return 'sore'; // 15:00 - 18:59
  return 'malam'; // 19:00 - 23:59
}

function formatDateDDMMYYYY(dateStr?: string | null): string {
  if (dateStr) {
    const trimmed = dateStr.trim();
    // Jika format YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${d}${m}${y}`;
    }
    // Jika sudah DDMMYYYY 8 digit
    if (/^\d{8}$/.test(trimmed)) {
      return trimmed;
    }
  }

  // Fallback: hari ini (WIB / zona lokal)
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = String(now.getFullYear());
  return `${d}${m}${y}`;
}

export function buildPhotoBaseName({
  branchCode,
  shiftDate,
  startTime,
  username,
}: BuildPhotoBaseNameOptions): string {
  // [KODE]
  let code = (branchCode ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  if (!code) code = 'UMUM';

  // [tgl]
  const date = formatDateDDMMYYYY(shiftDate);

  // [slot]
  const slot = getShiftTimeSlot(startTime);

  // [user]
  let user = (username ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  if (!user) user = 'unknown';

  return `${code}-${date}-${slot}-${user}`;
}
