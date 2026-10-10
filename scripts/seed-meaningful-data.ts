// scripts/seed-meaningful-data.ts
// Generate entries realistis berdasarkan konteks SOP fried chicken.
// Append ke sheet existing tanpa menghapus data lama.
// Usage: npx tsx --env-file=.env scripts/seed-meaningful-data.ts
import { appendRows, ensureSheet, readSheetData } from '../lib/google/sheets';
import { getHeaders, rowFromObject, monthlySheet, MONTHLY_SHEETS, STATIC_SHEETS } from '../lib/google/branch-schema';
import { ulid } from 'ulid';
import { createHash } from 'crypto';

const BRANCH_ID = '1fM_EhZDeYdsy4RdoThYrYlczLCitVnmmq4VXYe27A4k';

function iso(date: Date): string {
  return date.toISOString();
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Read existing config
async function readConfig() {
  const shiftDefs = await readSheetData(BRANCH_ID, 'ShiftDefinitions');
  const points = await readSheetData(BRANCH_ID, 'ChecklistPoints');

  const activeShiftDefs = shiftDefs.rows
    .map((row) => {
      const obj: Record<string, unknown> = {};
      shiftDefs.headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter((r) => String(r.is_active).toUpperCase() === 'TRUE' || String(r.is_active) === '1');

  const activePoints = points.rows
    .map((row) => {
      const obj: Record<string, unknown> = {};
      points.headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter((r) => String(r.is_active).toUpperCase() === 'TRUE' || String(r.is_active) === '1');

  return { activeShiftDefs, activePoints };
}

// Generate realistic value based on point title and input type
function generateRealisticValue(point: Record<string, unknown>): { value: string; skipReason: string; state: string } {
  const title = String(point.title || '').toLowerCase();
  const inputType = String(point.input_type);
  const isRequired = String(point.is_required).toUpperCase() === 'TRUE';

  // Skip rate: 3% for required items
  if (isRequired && Math.random() < 0.03) {
    const skipReasons = [
      'Bahan tidak tersuai',
      'Peralatan sedang diperbaiki',
      'Item tidak berlaku untuk shift ini',
      'Menunggu pengiriman bahan',
    ];
    return { value: '', skipReason: skipReasons[Math.floor(Math.random() * skipReasons.length)], state: 'skip' };
  }

  // Temperature-related items
  if (title.includes('suhu minyak') || title.includes('minyak goreng')) {
    const temp = Math.floor(Math.random() * 16) + 170; // 170-185°C
    return { value: String(temp), skipReason: '', state: 'selesai' };
  }
  if (title.includes('suhu chiller') || title.includes('chiller')) {
    const temp = Math.floor(Math.random() * 4) + 1; // 1-4°C
    return { value: String(temp), skipReason: '', state: 'selesai' };
  }
  if (title.includes('suhu freezer') || title.includes('freezer')) {
    const temp = Math.floor(Math.random() * 5) - 20; // -20 to -16°C
    return { value: String(temp), skipReason: '', state: 'selesai' };
  }
  if (title.includes('suhu holding') || title.includes('holding')) {
    const temp = Math.floor(Math.random() * 11) + 65; // 65-75°C
    return { value: String(temp), skipReason: '', state: 'selesai' };
  }

  // Time/duration items
  if (title.includes('durasi') || title.includes('waktu') || title.includes('menit')) {
    if (title.includes('masak') || title.includes('goreng')) {
      const duration = Math.floor(Math.random() * 4) + 12; // 12-15 minutes
      return { value: String(duration), skipReason: '', state: 'selesai' };
    }
    if (title.includes('tunggu') || title.includes('order')) {
      const wait = Math.floor(Math.random() * 11) + 5; // 5-15 minutes
      return { value: String(wait), skipReason: '', state: 'selesai' };
    }
    const duration = Math.floor(Math.random() * 30) + 5; // 5-35 minutes
    return { value: String(duration), skipReason: '', state: 'selesai' };
  }

  // Stock/count items
  if (title.includes('stok') || title.includes('jumlah') || title.includes('count')) {
    if (title.includes('ayam')) {
      const stock = Math.floor(Math.random() * 46) + 5; // 5-50 pieces
      return { value: String(stock), skipReason: '', state: 'selesai' };
    }
    if (title.includes('order')) {
      const orders = Math.floor(Math.random() * 31) + 20; // 20-50 orders
      return { value: String(orders), skipReason: '', state: 'selesai' };
    }
    const count = Math.floor(Math.random() * 20) + 1;
    return { value: String(count), skipReason: '', state: 'selesai' };
  }

  // Cash/money items
  if (title.includes('uang') || title.includes('kasir') || title.includes('cash')) {
    const amount = Math.floor(Math.random() * 4000000) + 1000000; // 1M-5M
    return { value: String(amount), skipReason: '', state: 'selesai' };
  }

  // Default for checkbox or unknown
  if (inputType === 'checkbox') {
    return { value: 'TRUE', skipReason: '', state: 'selesai' };
  }

  // Default number
  const min = Number(point.number_min) || 0;
  const max = Number(point.number_max) || 100;
  const val = Math.floor(Math.random() * (max - min + 1)) + min;
  return { value: String(val), skipReason: '', state: 'selesai' };
}

// Generate entries for a shift with realistic values
function generateEntries(shiftInstanceId: string, shiftDate: string, points: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];
  const baseDate = new Date(shiftDate);

  for (const cp of points) {
    const { value, skipReason, state } = generateRealisticValue(cp);
    const targetTime = String(cp.target_time || '12:00');
    const [hours, minutes] = targetTime.split(':').map(Number);
    const completedAt = new Date(baseDate);
    completedAt.setHours(hours, minutes + Math.floor(Math.random() * 30) - 15, Math.floor(Math.random() * 60), 0);

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
      skip_reason: skipReason,
      created_at: iso(completedAt),
      updated_at: iso(completedAt),
      version: 1,
    });
  }
  return entries;
}

// Generate entry logs
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

// Write to monthly sheets
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
  const { activeShiftDefs, activePoints } = await readConfig();
  console.log(`  ${activeShiftDefs.length} shift definitions`);
  console.log(`  ${activePoints.length} checklist points`);

  // Ensure monthly sheets exist
  const tabMonths = ['2026-09', '2026-10', '2026-11'];
  for (const [sheet, headers] of Object.entries(MONTHLY_SHEETS)) {
    for (const tabMonth of tabMonths) {
      const name = monthlySheet(sheet, tabMonth);
      await ensureSheet(BRANCH_ID, name, headers);
    }
  }

  // Read existing shift instances
  const shiftsData = await readSheetData(BRANCH_ID, 'ShiftInstances');
  const existingShifts = shiftsData.rows
    .map((row) => {
      const obj: Record<string, unknown> = {};
      shiftsData.headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter((s) => String(s.is_test).toUpperCase() === 'FALSE');

  console.log(`  ${existingShifts.length} existing shifts`);

  // Generate new entries for each shift
  console.log('Generating meaningful entries...');
  const allEntries: Array<Record<string, unknown>> = [];
  const allEntryLogs: Array<Record<string, unknown>> = [];

  for (const shift of existingShifts) {
    const entries = generateEntries(String(shift.id), String(shift.shift_date), activePoints);
    allEntries.push(...entries);
    allEntryLogs.push(...generateEntryLogs(entries, String(shift.id)));
  }

  console.log(`  ${allEntries.length} new entries to insert`);

  // Insert in batches
  console.log('Inserting entries...');
  await writeMonthly('Entries', allEntries);

  console.log('Inserting entry logs...');
  await writeMonthly('EntryLogs', allEntryLogs);

  console.log('Seed complete!');
  console.log(`  ${allEntries.length} entries`);
  console.log(`  ${allEntryLogs.length} entry logs`);
}

main().catch((e) => { console.error(e); process.exit(1); });
