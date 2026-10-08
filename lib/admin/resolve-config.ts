// lib/admin/resolve-config.ts
// Resolver: ID config (shift definition / kategori / point / handover field)
// tidak menyimpan branch_id, jadi pemiliknya dicari dengan memeriksa
// spreadsheet cabang yang diakses user.

import { AuthContext } from '../api-auth';
import { resolveCabang } from '../google/registry';
import { filterRows } from '../store';
import { asStr } from '../store';

export interface ConfigLocation {
  spreadsheetId: string;
  branchId: string;
}

/**
 * Cari cabang yang memiliki shift definition dengan id tertentu.
 * Mengembalikan null bila tidak ditemukan di cabang manapun yang diakses.
 */
export async function locateShiftDefinition(
  ctx: AuthContext,
  shiftDefinitionId: string
): Promise<ConfigLocation | null> {
  for (const branchId of ctx.branchIds) {
    try {
      const { spreadsheetId } = await resolveCabang(branchId);
      const hit = await filterRows(
        spreadsheetId,
        'ShiftDefinitions',
        (r) => asStr(r['id']) === shiftDefinitionId
      );
      if (hit[0]) return { spreadsheetId, branchId };
    } catch {
      // lanjut ke cabang berikutnya
    }
  }
  return null;
}

/**
 * Cari cabang + induk dari sebuah SOP category.
 * Mengembalikan null bila id tidak ditemukan di cabang yang diakses.
 */
export async function locateSopCategory(
  ctx: AuthContext,
  sopCategoryId: string
): Promise<(ConfigLocation & { shiftDefinitionId: string }) | null> {
  for (const branchId of ctx.branchIds) {
    try {
      const { spreadsheetId } = await resolveCabang(branchId);
      const hit = await filterRows(
        spreadsheetId,
        'SopCategories',
        (r) => asStr(r['id']) === sopCategoryId
      );
      if (hit[0]) {
        return {
          spreadsheetId,
          branchId,
          shiftDefinitionId: asStr(hit[0]['shift_definition_id']),
        };
      }
    } catch {
      // lanjut
    }
  }
  return null;
}

/** Cari cabang + kategori induk dari sebuah checklist point. */
export async function locateChecklistPoint(
  ctx: AuthContext,
  pointId: string
): Promise<(ConfigLocation & { sopCategoryId: string }) | null> {
  for (const branchId of ctx.branchIds) {
    try {
      const { spreadsheetId } = await resolveCabang(branchId);
      const hit = await filterRows(
        spreadsheetId,
        'ChecklistPoints',
        (r) => asStr(r['id']) === pointId
      );
      if (hit[0]) {
        return {
          spreadsheetId,
          branchId,
          sopCategoryId: asStr(hit[0]['sop_category_id']),
        };
      }
    } catch {
      // lanjut
    }
  }
  return null;
}

/** Cari cabang + shift definition induk dari sebuah handover field. */
export async function locateHandoverField(
  ctx: AuthContext,
  fieldId: string
): Promise<(ConfigLocation & { shiftDefinitionId: string }) | null> {
  for (const branchId of ctx.branchIds) {
    try {
      const { spreadsheetId } = await resolveCabang(branchId);
      const hit = await filterRows(
        spreadsheetId,
        'HandoverFields',
        (r) => asStr(r['id']) === fieldId
      );
      if (hit[0]) {
        return {
          spreadsheetId,
          branchId,
          shiftDefinitionId: asStr(hit[0]['shift_definition_id']),
        };
      }
    } catch {
      // lanjut
    }
  }
  return null;
}

/** Cari cabang pemilik sebuah kategori incident. */
export async function locateIncidentCategory(
  ctx: AuthContext,
  categoryId: string
): Promise<ConfigLocation | null> {
  for (const branchId of ctx.branchIds) {
    try {
      const { spreadsheetId } = await resolveCabang(branchId);
      const hit = await filterRows(
        spreadsheetId,
        'IncidentCategories',
        (r) => asStr(r['id']) === categoryId
      ).catch(() => [] as Record<string, unknown>[]);
      if (hit[0]) return { spreadsheetId, branchId };
    } catch {
      // lanjut
    }
  }
  return null;
}