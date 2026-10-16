// scripts/diag-repro.ts — reproduksi logika /api/handovers & /api/admin/reports.
import { getCabangList, resolveCabang } from '../lib/google/registry';
import { asStr, filterRows, listMonthlyRows, listRows } from '../lib/store';
import { handoverTabMonth, isClosedShiftStatus } from '../lib/handover-fields';
import { userNameMap } from '../lib/incidents';

async function main() {
  const cabangs = await getCabangList();
  console.log('getCabangList() →', cabangs.length, cabangs.map((c) => c.Cabang_ID));

  let nameMap: Map<string, string>;
  try {
    nameMap = await userNameMap();
    console.log('userNameMap() → ok, size', nameMap.size);
  } catch (e) {
    console.error('userNameMap() THREW:', (e as Error).message);
    nameMap = new Map();
  }

  for (const cabang of cabangs) {
    console.log('\n### CABANG', cabang.Cabang_ID);
    let spreadsheetId: string;
    try {
      spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId;
      console.log('resolveCabang →', spreadsheetId);
    } catch (e) {
      console.error('resolveCabang THREW:', (e as Error).message);
      continue;
    }

    // --- handovers ---
    try {
      const instances = (await listRows(spreadsheetId, 'ShiftInstances')).filter((r) =>
        isClosedShiftStatus(asStr(r['status']))
      );
      instances.sort((a, b) => asStr(b['opened_at']).localeCompare(asStr(a['opened_at'])));
      const limit = 10;
      const selected = instances.slice(0, limit);
      console.log(`closed instances: ${instances.length}, selected(top ${limit}):`);
      selected.forEach((r) =>
        console.log('   ', asStr(r['id']), asStr(r['shift_date']), asStr(r['status']), asStr(r['opened_at']))
      );
      const months = [...new Set(selected.map((r) => handoverTabMonth(r)))];
      console.log('months:', months);
      for (const month of months) {
        const hv = await listMonthlyRows(spreadsheetId, 'Handovers', month);
        console.log(`   Handovers_${month} rows: ${hv.length}`);
        const matches = selected.filter((i) =>
          hv.some((h) => asStr(h['shift_instance_id']) === asStr(i['id']))
        );
        console.log(`   selected-with-handover: ${matches.length} →`, matches.map((m) => asStr(m['id'])));
      }
    } catch (e) {
      console.error('handovers repro THREW:', (e as Error).message);
    }

    // --- reports ---
    try {
      const reports = await filterRows(spreadsheetId, 'Reports', () => true);
      const instances = await filterRows(spreadsheetId, 'ShiftInstances', () => true);
      const byId = new Map(instances.map((i) => [asStr(i['id']), i]));
      const cutoff = new Date();
      cutoff.setUTCHours(0, 0, 0, 0);
      cutoff.setUTCDate(cutoff.getUTCDate() - 6);
      console.log('reports total:', reports.length, ' cutoff:', cutoff.toISOString());
      let shown = 0;
      for (const report of reports) {
        const inst = byId.get(asStr(report['shift_instance_id']));
        const shiftDate = inst ? asStr(inst['shift_date']) : null;
        if (shiftDate) {
          const reportDate = new Date(`${shiftDate}T00:00:00Z`);
          if (reportDate < cutoff) continue;
        }
        shown++;
        if (shown <= 5) console.log('   SHOWN:', asStr(report['report_number']), shiftDate, asStr(report['generated_at']));
      }
      console.log(`   reports passing filter: ${shown}`);
    } catch (e) {
      console.error('reports repro THREW:', (e as Error).message);
    }
  }
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
