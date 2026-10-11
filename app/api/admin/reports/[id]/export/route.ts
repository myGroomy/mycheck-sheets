import { NextRequest, NextResponse } from 'next/server';
import { withAuth, requireRole } from '@/lib/api-auth';
import { resolveCabang } from '@/lib/google/registry';
import { buildReportDetail } from '@/lib/report-detail';
import { formatReportValue } from '@/lib/shared/report-values';

function csvCell(value: unknown): string {
  let text = value == null
    ? ''
    : typeof value === 'string'
      ? value
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);

  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

function exportEntryValue(inputType: string, value: unknown): string {
  if (typeof value !== 'string' || !value) return value == null ? '' : String(value);
  if (inputType === 'kotak_centang') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).join(', ');
    } catch {
      return value;
    }
  }
  if (inputType === 'tanggal_waktu') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('id-ID');
  }
  return value;
}

function exportCombinedValue(value: unknown): string {
  if (typeof value !== 'string') return formatReportValue(value);
  try {
    return formatReportValue(JSON.parse(value) as unknown);
  } catch {
    return value;
  }
}

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const roleError = requireRole(ctx, 'admin');
  if (roleError) return roleError;

  const reportId = request.nextUrl.pathname.split('/').at(-2) ?? '';
  const branchId = request.nextUrl.searchParams.get('branchId') ?? '';
  if (!reportId || !branchId) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'Laporan dan cabang wajib dipilih.' } },
      { status: 400 }
    );
  }
  if (!ctx.branchIds.includes(branchId)) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Akses ditolak untuk cabang ini.' } },
      { status: 403 }
    );
  }

  try {
    const { spreadsheetId } = await resolveCabang(branchId);
    const detail = await buildReportDetail(spreadsheetId, branchId, reportId);
    if (!detail) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Laporan tidak ditemukan.' } },
        { status: 404 }
      );
    }

    const base = [
      detail.report.id,
      detail.report.report_number,
      detail.branch.name,
      detail.branch.code,
      detail.shift.shift_date,
      detail.shift.template_snapshot?.shift.name ?? '',
    ];
    const rows: unknown[][] = [[
      'Laporan_ID', 'Nomor_Laporan', 'Cabang', 'Kode_Cabang', 'Tanggal_Shift', 'Shift',
      'Bagian', 'Kategori', 'Item_atau_Field', 'Status', 'Nilai', 'Alasan_atau_Catatan',
      'Petugas', 'Waktu', 'Detail',
    ]];
    const addRow = (
      section: string,
      category = '',
      item = '',
      status = '',
      value: unknown = '',
      note = '',
      person = '',
      time = '',
      info = ''
    ) => rows.push([...base, section, category, item, status, value, note, person, time, info]);

    addRow(
      'Ringkasan',
      '',
      'Status shift',
      detail.shift.status,
      '',
      '',
      detail.shift.pj_name ?? '',
      detail.report.generated_at,
      `Dibuat oleh ${detail.report.generated_by}; terkunci: ${detail.report.is_locked ? 'Ya' : 'Tidak'}`
    );

    const entriesByPoint = new Map(detail.entries.map((entry) => [entry.pointRef, entry]));
    for (const category of detail.shift.template_snapshot?.categories ?? []) {
      for (const point of category.points) {
        const entry = entriesByPoint.get(point.point_ref);
        addRow(
          'Checklist',
          category.name,
          point.title,
          entry?.state ?? 'belum',
          point.input_types && point.input_types.length > 1
            ? exportCombinedValue(entry?.value)
            : exportEntryValue(point.input_type, entry?.value),
          entry?.skipReason ?? '',
          entry?.completedByName ?? '',
          entry?.completedAt ?? '',
          [
            point.is_required ? 'Wajib' : 'Opsional',
            point.input_types?.length ? point.input_types.join(' + ') : point.input_type,
            entry?.timingLabel ?? '',
          ].filter(Boolean).join(' · ')
        );
      }
    }

    for (const participant of detail.participants) {
      addRow(
        'Peserta',
        '',
        participant.name,
        participant.isPj ? 'PJ' : 'Petugas',
        `${participant.itemsDone} item selesai`,
        participant.firstActionType,
        participant.name,
        participant.firstActionAt
      );
    }

    const handoverValues = detail.handover?.values ?? {};
    for (const field of detail.shift.template_snapshot?.handover_fields ?? []) {
      addRow(
        'Handover',
        '',
        field.label,
        field.is_required ? 'Wajib' : 'Opsional',
        formatReportValue(handoverValues[field.id] ?? ''),
        '',
        detail.handover?.submitted_by ?? '',
        detail.handover?.submitted_at ?? '',
        field.input_types?.length ? field.input_types.join(' + ') : field.field_type
      );
    }
    if (detail.handover?.free_text) {
      addRow(
        'Handover',
        '',
        'Catatan bebas',
        '',
        detail.handover.free_text,
        '',
        detail.handover.submitted_by,
        detail.handover.submitted_at
      );
    }

    for (const incident of detail.incidents) {
      addRow(
        'Incident',
        incident.categoryName ?? '',
        incident.id,
        incident.status,
        incident.description,
        '',
        '',
        incident.occurredAt,
        incident.severity ?? ''
      );
    }

    for (const addendum of detail.addenda) {
      addRow(
        'Addendum',
        '',
        addendum.id,
        '',
        addendum.note,
        '',
        addendum.authorName,
        addendum.createdAt
      );
    }

    const csv = `\uFEFF${rows.map(csvRow).join('\r\n')}`;
    const filenameBase = detail.report.report_number.replace(/[^a-zA-Z0-9_-]/g, '_') || reportId;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="laporan-${filenameBase}.csv"`,
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
      },
    });
  } catch (error) {
    console.error('Gagal mengekspor laporan:', error);
    return NextResponse.json(
      { success: false, error: { code: 'EXPORT_FAILED', message: 'Laporan gagal diekspor.' } },
      { status: 500 }
    );
  }
});
