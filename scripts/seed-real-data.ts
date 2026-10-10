// scripts/seed-real-data.ts
// Seed data realistis restoran fried chicken "Ayam Goreng Juara" selama 3 bulan.
// Baca existing config, generate data transaksional tanpa duplikat.
// Usage: npx tsx --env-file=.env scripts/seed-real-data.ts
import { appendRows, ensureSheet, readSheetData, writeRow } from '../lib/google/sheets';
import { getHeaders, rowFromObject, monthlySheet, MONTHLY_SHEETS, STATIC_SHEETS } from '../lib/google/branch-schema';
import { ulid } from 'ulid';
import { createHash } from 'crypto';

const BRANCH_ID = '1fM_EhZDeYdsy4RdoThYrYlczLCitVnmmq4VXYe27A4k';

function iso(date: Date): string {
  return date.toISOString();
}

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Read existing config from spreadsheet
async function readConfig() {
  const shiftDefs = await readSheetData(BRANCH_ID, 'ShiftDefinitions');
  const categories = await readSheetData(BRANCH_ID, 'SopCategories');
  const points = await readSheetData(BRANCH_ID, 'ChecklistPoints');
  const handoverFields = await readSheetData(BRANCH_ID, 'HandoverFields');

  console.log('  ShiftDefinitions is_active values:', shiftDefs.rows.slice(0, 3).map((r) => String(r[7])));

  const activeShiftDefs = shiftDefs.rows
    .map((row, i) => {
      const obj: Record<string, unknown> = {};
      shiftDefs.headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter((r) => String(r.is_active).toUpperCase() === 'TRUE' || String(r.is_active).toUpperCase() === '1');

  const activeCategories = categories.rows
    .map((row) => {
      const obj: Record<string, unknown> = {};
      categories.headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter((r) => String(r.is_active).toUpperCase() === 'TRUE' || String(r.is_active).toUpperCase() === '1');

  const activePoints = points.rows
    .map((row) => {
      const obj: Record<string, unknown> = {};
      points.headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter((r) => String(r.is_active).toUpperCase() === 'TRUE');

  return { activeShiftDefs, activeCategories, activePoints, handoverFields };
}

// Generate shift instances for 3 months
function generateShiftInstances(existingShiftDefs: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const instances: Array<Record<string, unknown>> = [];
  const months = [
    { year: 2026, month: 9, days: 30 },
    { year: 2026, month: 10, days: 31 },
    { year: 2026, month: 11, days: 30 },
  ];

  for (const m of months) {
    for (let day = 1; day <= m.days; day++) {
      const date = dateStr(m.year, m.month, day);
      const tabMonth = `${m.year}-${String(m.month).padStart(2, '0')}`;

      for (const sd of existingShiftDefs) {
        const shiftDefId = String(sd.id);
        const startTime = String(sd.start_time);
        const endTime = String(sd.end_time);
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);

        const openedAt = new Date(m.year, m.month - 1, day, sh + 1, Math.floor(Math.random() * 10), 0);
        const closedAt = new Date(m.year, m.month - 1, day, eh + 1, Math.floor(Math.random() * 10), 0);

        instances.push({
          id: ulid(),
          shift_definition_id: shiftDefId,
          shift_date: date,
          tab_month: tabMonth,
          status: 'ditutup',
          pj_user_id: 'U-PJ-001',
          opened_by: 'U-PJ-001',
          opened_at: iso(openedAt),
          opened_outside_hours: 'FALSE',
          closed_at: iso(closedAt),
          closed_by: 'U-PJ-001',
          close_type: 'normal',
          force_close_reason: '',
          is_incomplete: 'FALSE',
          no_incident_confirmed: 'TRUE',
          void_reason: '',
          void_by: '',
          void_at: '',
          is_test: 'FALSE',
          snapshot_encoding: 'json',
          template_snapshot: JSON.stringify({ shiftDefinitionId: shiftDefId, date }),
          snapshot_hash: hashContent(JSON.stringify({ shiftDefinitionId: shiftDefId, date })),
          created_at: iso(openedAt),
          updated_at: iso(closedAt),
          version: 1,
        });
      }
    }
  }
  return instances;
}

// Generate entries for a shift
function generateEntries(shiftInstanceId: string, shiftDate: string, points: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];
  const baseDate = new Date(shiftDate);

  for (const cp of points) {
    const isRequired = String(cp.is_required).toUpperCase() === 'TRUE';
    const isSkipped = isRequired && Math.random() < 0.03;
    const state = isSkipped ? 'skip' : 'selesai';
    const targetTime = String(cp.target_time || '12:00');
    const [hours, minutes] = targetTime.split(':').map(Number);
    const completedAt = new Date(baseDate);
    completedAt.setHours(hours, minutes + Math.floor(Math.random() * 30) - 15, Math.floor(Math.random() * 60), 0);

    let value = '';
    const inputType = String(cp.input_type);
    if (inputType === 'number') {
      const min = Number(cp.number_min) || 0;
      const max = Number(cp.number_max) || 100;
      value = String(Math.floor(Math.random() * (max - min + 1)) + min);
    } else if (inputType === 'checkbox') {
      value = 'TRUE';
    }

    entries.push({
      id: ulid(),
      shift_instance_id: shiftInstanceId,
      point_ref: String(cp.id),
      state,
      value,
      out_of_range: 'FALSE',
      photo_ids: '',
      completed_by: 'U-PJ-001',
      completed_at: iso(completedAt),
      timing_label: completedAt.getHours() < hours ? 'early' : completedAt.getHours() > hours ? 'late' : 'on_time',
      timing_delta_minutes: Math.floor(Math.random() * 20) - 10,
      skip_reason: isSkipped ? 'Bahan tidak tersedia' : '',
      created_at: iso(completedAt),
      updated_at: iso(completedAt),
      version: 1,
    });
  }
  return entries;
}

// Generate entry logs for entries
function generateEntryLogs(entries: Array<Record<string, unknown>>, shiftInstanceId: string): Array<Record<string, unknown>> {
  return entries.map((entry) => ({
    id: ulid(),
    shift_instance_id: shiftInstanceId,
    entry_id: entry.id,
    point_ref: entry.point_ref,
    action: 'complete',
    outcome: 'success',
    user_id: entry.completed_by,
    winner_user_id: '',
    prev_state: '',
    new_state: entry.state,
    value: entry.value,
    note: '',
    client_action_id: ulid(),
    client_at: entry.completed_at,
    at: entry.completed_at,
    created_at: entry.completed_at,
  }));
}

// Generate participants for a shift
function generateParticipants(shiftInstanceId: string): Array<Record<string, unknown>> {
  return [
    {
      id: ulid(),
      shift_instance_id: shiftInstanceId,
      user_id: 'U-PJ-001',
      first_action_at: iso(new Date()),
      first_action_type: 'open',
      created_at: iso(new Date()),
    },
    {
      id: ulid(),
      shift_instance_id: shiftInstanceId,
      user_id: 'U-STAFF-001',
      first_action_at: iso(new Date()),
      first_action_type: 'check_in',
      created_at: iso(new Date()),
    },
  ];
}

// Generate handover for a shift
function generateHandover(shiftInstanceId: string, shiftDate: string): Record<string, unknown> {
  const orderCount = Math.floor(Math.random() * 50) + 20;
  const pendingCount = Math.floor(Math.random() * 5);
  const cashEnd = Math.floor(Math.random() * 5000000) + 1000000;

  return {
    id: ulid(),
    shift_instance_id: shiftInstanceId,
    values: JSON.stringify({
      'Jumlah order selesai': orderCount,
      'Jumlah order pending': pendingCount,
      'Kondisi peralatan': 'Baik',
      'Catatan penting': '',
      'Uang kasir akhir': cashEnd,
    }),
    free_text: '',
    photo_ids: '',
    submitted_by: 'U-PJ-001',
    submitted_at: iso(new Date(shiftDate + 'T14:00:00')),
    created_at: iso(new Date(shiftDate + 'T14:00:00')),
    updated_at: iso(new Date(shiftDate + 'T14:00:00')),
  };
}

// Generate handover acks
function generateHandoverAcks(handoverId: string, nextShiftInstanceId: string): Array<Record<string, unknown>> {
  return [
    {
      id: ulid(),
      handover_id: handoverId,
      reading_shift_instance_id: nextShiftInstanceId,
      user_id: 'U-PJ-002',
      read_at: iso(new Date()),
      created_at: iso(new Date()),
    },
  ];
}

// Generate report for a shift
function generateReport(shiftInstanceId: string, shiftDate: string, shiftDefId: string, totalPoints: number): Record<string, unknown> {
  const skipCount = Math.floor(Math.random() * 3);
  const summaryStats = {
    total: totalPoints,
    selesai: totalPoints - skipCount,
    skip: skipCount,
    belum: 0,
  };

  return {
    id: ulid(),
    shift_instance_id: shiftInstanceId,
    report_number: `RPT-${shiftDate.replace(/-/g, '')}-${shiftDefId}`,
    generated_by: 'U-PJ-001',
    generated_at: iso(new Date(shiftDate + 'T14:05:00')),
    is_locked: 'TRUE',
    summary_stats: JSON.stringify(summaryStats),
    content_hash: hashContent(JSON.stringify({ shiftInstanceId, shiftDate })),
    unlock_count: 0,
    last_unlocked_at: '',
    last_unlocked_by: '',
    created_at: iso(new Date(shiftDate + 'T14:05:00')),
    updated_at: iso(new Date(shiftDate + 'T14:05:00')),
    version: 1,
  };
}

// Generate incidents
function generateIncidents(shiftInstances: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const incidents: Array<Record<string, unknown>> = [];
  const incidentTypes = [
    { categoryId: '', description: 'Minyak goreng terlalu panas, batch pertama gosong', severity: 'medium' },
    { categoryId: '', description: 'Pelanggan komplain ayam masih mentah di dalam', severity: 'high' },
    { categoryId: '', description: 'Stok ayam habis, harus tunggu pengiriman', severity: 'medium' },
    { categoryId: '', description: 'Deep fryer filter kotor, perlu diganti', severity: 'low' },
    { categoryId: '', description: 'POS system error, tidak bisa cetak struk', severity: 'medium' },
    { categoryId: '', description: 'Chiller suhu naik di atas 4°C', severity: 'high' },
  ];

  for (let i = 0; i < 25; i++) {
    const shiftIdx = Math.floor(Math.random() * shiftInstances.length);
    const shift = shiftInstances[shiftIdx];
    const type = incidentTypes[Math.floor(Math.random() * incidentTypes.length)];
    const occurredAt = new Date(String(shift.shift_date) + 'T10:00:00');
    occurredAt.setHours(occurredAt.getHours() + Math.floor(Math.random() * 8));

    incidents.push({
      id: ulid(),
      shift_instance_id: String(shift.id),
      tab_month: String(shift.tab_month),
      category_id: type.categoryId,
      description: type.description,
      occurred_at: iso(occurredAt),
      reported_by: 'U-PJ-001',
      reported_at: iso(occurredAt),
      status: Math.random() < 0.7 ? 'selesai' : 'open',
      outside_shift: 'FALSE',
      link_source: '',
      linked_by: '',
      linked_at: '',
      source_entry_id: '',
      severity: type.severity,
      status_changed_by: '',
      status_changed_at: '',
      is_test: 'FALSE',
      created_at: iso(occurredAt),
      updated_at: iso(occurredAt),
      version: 1,
    });
  }
  return incidents;
}

// Generate audit log
function generateAuditLog(shiftInstances: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const logs: Array<Record<string, unknown>> = [];
  let prevHash = '';

  for (const shift of shiftInstances.slice(0, 60)) {
    const actions = ['open_shift', 'close_shift', 'update_entry', 'create_handover'];
    for (const action of actions) {
      const at = iso(new Date(String(shift.shift_date) + 'T12:00:00'));
      const hash = hashContent(prevHash + action + at);
      logs.push({
        id: ulid(),
        seq: logs.length + 1,
        at,
        actor_id: 'U-PJ-001',
        action,
        object_type: 'shift',
        object_id: String(shift.id),
        branch_id: 'CBGBDG01',
        shift_instance_id: String(shift.id),
        before: '',
        after: '',
        reason: '',
        prev_hash: prevHash,
        hash,
      });
      prevHash = hash;
    }
  }
  return logs;
}

// Check existing shift IDs to avoid duplicates
async function getExistingShiftIds(): Promise<Set<string>> {
  const data = await readSheetData(BRANCH_ID, 'ShiftInstances');
  return new Set(data.rows.map((row) => String(row[0] || '')));
}

// Helper: group rows by tab_month and write to monthly sheets
async function writeMonthly(baseSheetName: string, rows: Array<Record<string, unknown>>): Promise<void> {
  const byMonth = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const tabMonth = String(row.tab_month || '');
    if (!tabMonth) continue;
    if (!byMonth.has(tabMonth)) byMonth.set(tabMonth, []);
    byMonth.get(tabMonth)!.push(row);
  }
  for (const [tabMonth, monthRows] of byMonth) {
    const sheetName = monthlySheet(baseSheetName, tabMonth);
    const sheetRows = monthRows.map((r) => rowFromObject(baseSheetName, r));
    for (let i = 0; i < sheetRows.length; i += 100) {
      await appendRows(BRANCH_ID, sheetName, sheetRows.slice(i, i + 100));
    }
  }
}

// Main
async function main() {
  console.log('Reading existing config...');
  const { activeShiftDefs, activeCategories, activePoints } = await readConfig();
  console.log(`  ${activeShiftDefs.length} shift definitions`);
  console.log(`  ${activeCategories.length} SOP categories`);
  console.log(`  ${activePoints.length} checklist points`);

  // Create active shift definitions if none exist
  const finalShiftDefs = activeShiftDefs.length > 0 ? activeShiftDefs : [
    {
      id: 'SD-AGJ-PAGI',
      name: 'Pagi - Ayam Goreng Juara',
      start_time: '06:00',
      end_time: '14:00',
      crosses_midnight: 'FALSE',
      sort_order: 100,
      is_active: 'TRUE',
      created_at: iso(new Date()),
      updated_at: iso(new Date()),
      version: 1,
    },
    {
      id: 'SD-AGJ-SIANG',
      name: 'Siang - Ayam Goreng Juara',
      start_time: '14:00',
      end_time: '22:00',
      crosses_midnight: 'FALSE',
      sort_order: 101,
      is_active: 'TRUE',
      created_at: iso(new Date()),
      updated_at: iso(new Date()),
      version: 1,
    },
  ];

  // Insert new shift definitions
  if (activeShiftDefs.length === 0) {
    console.log('Creating new shift definitions...');
    const rows = finalShiftDefs.map((s) => rowFromObject('ShiftDefinitions', s));
    await appendRows(BRANCH_ID, 'ShiftDefinitions', rows);
  }

  // Ensure monthly sheets exist
  const tabMonths = ['2026-09', '2026-10', '2026-11'];
  for (const [sheet, headers] of Object.entries(MONTHLY_SHEETS)) {
    for (const tabMonth of tabMonths) {
      const name = monthlySheet(sheet, tabMonth);
      await ensureSheet(BRANCH_ID, name, headers);
    }
  }

  // Check existing shifts
  const existingIds = await getExistingShiftIds();
  console.log(`  ${existingIds.size} existing shift instances`);

  // Generate new shift instances
  console.log('Generating shift instances...');
  const allShifts = generateShiftInstances(finalShiftDefs);
  const newShifts = allShifts.filter((s) => !existingIds.has(String(s.id)));
  console.log(`  ${newShifts.length} new shifts to insert`);

  if (newShifts.length > 0) {
    const shiftRows = newShifts.map((s) => rowFromObject('ShiftInstances', s));
    for (let i = 0; i < shiftRows.length; i += 50) {
      await appendRows(BRANCH_ID, 'ShiftInstances', shiftRows.slice(i, i + 50));
    }
  }

  // Combine all shifts for data generation
  const allShiftInstances = [...Array.from(existingIds).map((id) => ({ id })), ...newShifts] as Array<Record<string, unknown>>;

  // Generate transactional data
  console.log('Generating entries...');
  const allEntries: Array<Record<string, unknown>> = [];
  const allEntryLogs: Array<Record<string, unknown>> = [];
  const allParticipants: Array<Record<string, unknown>> = [];
  const allHandovers: Array<Record<string, unknown>> = [];
  const allHandoverAcks: Array<Record<string, unknown>> = [];
  const allReports: Array<Record<string, unknown>> = [];

  for (const shift of newShifts) {
    const entries = generateEntries(String(shift.id), String(shift.shift_date), activePoints);
    allEntries.push(...entries);
    allEntryLogs.push(...generateEntryLogs(entries, String(shift.id)));
    allParticipants.push(...generateParticipants(String(shift.id)));
    allHandovers.push(generateHandover(String(shift.id), String(shift.shift_date)));
    allHandoverAcks.push(...generateHandoverAcks(String(allHandovers[allHandovers.length - 1].id), String(shift.id)));
    allReports.push(generateReport(String(shift.id), String(shift.shift_date), String(shift.shift_definition_id), activePoints.length || 24));
  }

  // Insert in batches
  console.log('Inserting entries...');
  await writeMonthly('Entries', allEntries);

  console.log('Inserting entry logs...');
  await writeMonthly('EntryLogs', allEntryLogs);

  console.log('Inserting participants...');
  const participantRows = allParticipants.map((p) => rowFromObject('Participants', p));
  for (let i = 0; i < participantRows.length; i += 100) {
    await appendRows(BRANCH_ID, 'Participants', participantRows.slice(i, i + 100));
  }

  console.log('Inserting handovers...');
  await writeMonthly('Handovers', allHandovers);

  console.log('Inserting handover acks...');
  await writeMonthly('HandoverAcks', allHandoverAcks);

  console.log('Inserting reports...');
  const reportRows = allReports.map((r) => rowFromObject('Reports', r));
  for (let i = 0; i < reportRows.length; i += 100) {
    await appendRows(BRANCH_ID, 'Reports', reportRows.slice(i, i + 100));
  }

  // Generate and insert incidents
  console.log('Generating incidents...');
  const incidents = generateIncidents(newShifts);
  await writeMonthly('Incidents', incidents);

  // Generate and insert audit log
  console.log('Generating audit log...');
  const auditLogs = generateAuditLog(newShifts);
  await writeMonthly('AuditLog', auditLogs);

  console.log('Seed complete!');
  console.log(`  ${newShifts.length} shifts`);
  console.log(`  ${allEntries.length} entries`);
  console.log(`  ${allEntryLogs.length} entry logs`);
  console.log(`  ${allParticipants.length} participants`);
  console.log(`  ${allHandovers.length} handovers`);
  console.log(`  ${allHandoverAcks.length} handover acks`);
  console.log(`  ${allReports.length} reports`);
  console.log(`  ${incidents.length} incidents`);
  console.log(`  ${auditLogs.length} audit logs`);
}

main().catch((e) => { console.error(e); process.exit(1); });
