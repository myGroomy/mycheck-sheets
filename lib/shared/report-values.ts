export function containsPhotoId(value: unknown, photoId: string): boolean {
  if (value === photoId) return true;
  if (typeof value === 'string') {
    try {
      return containsPhotoId(JSON.parse(value) as unknown, photoId);
    } catch {
      return false;
    }
  }
  if (Array.isArray(value)) return value.some((item) => containsPhotoId(item, photoId));
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsPhotoId(item, photoId));
  }
  return false;
}

export function formatReportValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([type, item]) => {
      if (type === 'foto' && Array.isArray(item)) return `Foto: ${item.length} lampiran`;
      const label = REPORT_TYPE_LABELS[type] ?? type;
      if (type === 'tanggal_waktu' && typeof item === 'string') {
        const date = new Date(item);
        if (!Number.isNaN(date.getTime())) return `${label}: ${date.toLocaleString('id-ID')}`;
      }
      return `${label}: ${formatReportValue(item)}`;
    }).join(' · ');
  }
  return value === null || value === undefined ? '' : String(value);
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  teks: 'Teks',
  angka: 'Angka',
  pilihan: 'Pilihan',
  pilihan_ganda: 'Pilihan ganda',
  kotak_centang: 'Pilihan jamak',
  dropdown: 'Dropdown',
  ya_tidak: 'Ya / Tidak',
  centang: 'Centang',
  ok_tidak_ok: 'OK / Tidak OK',
  paragraf: 'Paragraf',
  tanggal_waktu: 'Tanggal dan waktu',
  foto: 'Foto',
};
