// tests/helpers/fake-sheets.ts
// Implementasi in-memory Google Sheets API (subset v4) untuk menguji
// lib/store.ts dan lib/admin/* tanpa menyentuh spreadsheet sungguhan.
//
// Cakupannya hanya operasi yang dipakai source:
//   spreadsheets.get            -> daftar sheet (title + sheetId)
//   spreadsheets.values.get     -> baca range
//   spreadsheets.values.batchGet-> baca beberapa range (1 panggilan)
//   spreadsheets.values.update  -> tulis range
//   spreadsheets.values.batchUpdate -> tulis multi-range (writeCells)
//   spreadsheets.values.append  -> append baris (insertRow)
//   spreadsheets.batchUpdate    -> addSheet / deleteDimension (deleteSheetRows)
//
// Batasan yang disengaja: nilai disimpan apa adanya (tanpa formula), dan
// baris kosong di tengah tidak dihapus pada values.get — supaya nomor baris
// fisik (rowNumber = index + 2) tetap benar seperti di Sheets asli.

export interface FakeSheet {
  sheetId: number;
  title: string;
  spreadsheetId: string;
  /** Baris termasuk header di baris pertama. */
  values: unknown[][];
}

/** Spreadsheet default saat test tidak menyebutkan spreadsheet lain. */
export const DEFAULT_SPREADSHEET_ID = 'default';

export interface FakeWorkbook {
  /**
   * Sheet dipetakan per spreadsheet: `spreadsheetId!title`. Google Sheets
   * mengisolasi spreadsheet satu sama lain, jadi dua cabang TIDAK boleh
   * membaca sheet yang sama hanya karena memakai satu workbook di test.
   */
  sheets: Map<string, FakeSheet>;
  nextSheetId: number;
}

type Range = string;

/** Pecah "Sheet!A1:C3" atau "Sheet" menjadi { sheetName, a1 } */
function parseRange(range: Range): { sheetName: string; a1: string } {
  const bang = range.indexOf('!');
  if (bang === -1) return { sheetName: range, a1: '' };
  return { sheetName: range.slice(0, bang), a1: range.slice(bang + 1) };
}

/** Ubah "A1" atau "C3" menjadi index kolom 0-based. */
function columnIndexFromA1(a1: string): number {
  const match = /^([A-Z]+)/.exec(a1);
  if (!match) return 0;
  let index = 0;
  for (const char of match[1]) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function cloneCell(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function createWorkbook(): FakeWorkbook {
  return { sheets: new Map(), nextSheetId: 1 };
}

export function sheetKey(spreadsheetId: string, title: string): string {
  return `${spreadsheetId}!${title}`;
}

export function addSheet(
  workbook: FakeWorkbook,
  title: string,
  headers: string[],
  rows: Record<string, unknown>[] = [],
  spreadsheetId = DEFAULT_SPREADSHEET_ID
): FakeSheet {
  const sheet: FakeSheet = {
    sheetId: workbook.nextSheetId++,
    title,
    spreadsheetId,
    values: [headers.map((h) => h), ...rows.map((row) => headers.map((h) => cloneCell(row[h])))],
  };
  workbook.sheets.set(sheetKey(spreadsheetId, title), sheet);
  return sheet;
}

/**
 * Sheet yang dibaca oleh spreadsheet tertentu. `undefined` bila tidak ada —
 * sama seperti `values.get` pada spreadsheet yang tidak punya tab tersebut.
 */
export function getSheet(
  workbook: FakeWorkbook,
  title: string,
  spreadsheetId = DEFAULT_SPREADSHEET_ID
): FakeSheet | undefined {
  return workbook.sheets.get(sheetKey(spreadsheetId, title));
}

export interface SheetsCallLog {
  method: string;
  spreadsheetId: string;
  range?: string;
  values?: unknown[][];
}

export interface FakeSheetsClient {
  spreadsheets: {
    get: (args: { spreadsheetId: string }) => Promise<{ data: { sheets: { properties: { sheetId: number; title: string } }[] } }>;
    batchUpdate: (args: { spreadsheetId: string; requestBody: { requests: unknown[] } }) => Promise<{ data: {} }>;
    values: {
      get: (args: { spreadsheetId: string; range: string }) => Promise<{ data: { values?: unknown[][] } }>;
      batchGet: (args: { spreadsheetId: string; ranges: string[] }) => Promise<{ data: { valueRanges: { values?: unknown[][] }[] } }>;
      update: (args: { spreadsheetId: string; range: string; requestBody: { values: unknown[][] } }) => Promise<{ data: {} }>;
      batchUpdate: (args: { spreadsheetId: string; requestBody: { valueInputOption?: string; data: { range: string; values: unknown[][] }[] } }) => Promise<{ data: {} }>;
      append: (args: { spreadsheetId: string; range: string; requestBody: { values: unknown[][] } }) => Promise<{ data: {} }>;
    };
  };
  calls: SheetsCallLog[];
}

export function createFakeSheetsClient(workbook: FakeWorkbook): FakeSheetsClient {
  const calls: SheetsCallLog[] = [];

  function requireSheet(spreadsheetId: string, sheetName: string): FakeSheet {
    const sheet = getSheet(workbook, sheetName, spreadsheetId);
    if (!sheet) {
      // Sheets sungguhan melempar 400 untuk range pada sheet yang tidak ada.
      const error = new Error(
        `Unable to parse range: ${sheetName} (spreadsheet ${spreadsheetId})`
      );
      throw error;
    }
    return sheet;
  }

  /** Tulis nilai pada range starting dari sel (row, col) 0-based. */
  function writeRange(sheet: FakeSheet, a1: string, values: unknown[][]): void {
    const startCol = a1 ? columnIndexFromA1(a1) : 0;
    const rowMatch = /^[A-Z]+(\d+)/.exec(a1);
    const startRow = rowMatch ? Number(rowMatch[1]) - 1 : 0;

    for (let r = 0; r < values.length; r++) {
      const targetRow = startRow + r;
      while (sheet.values.length <= targetRow) sheet.values.push([]);
      const row = sheet.values[targetRow];
      for (let c = 0; c < values[r].length; c++) {
        row[startCol + c] = cloneCell(values[r][c]);
      }
    }
  }

  return {
    calls,
    spreadsheets: {
      get: async ({ spreadsheetId }) => {
        calls.push({ method: 'spreadsheets.get', spreadsheetId });
        return {
          data: {
            // Hanya tab milik spreadsheet ini yang terlihat.
            sheets: [...workbook.sheets.values()]
              .filter((sheet) => sheet.spreadsheetId === spreadsheetId)
              .map((sheet) => ({
                properties: { sheetId: sheet.sheetId, title: sheet.title },
              })),
          },
        };
      },

      batchUpdate: async ({ spreadsheetId, requestBody }) => {
        calls.push({ method: 'spreadsheets.batchUpdate', spreadsheetId });
        for (const request of requestBody.requests as {
          addSheet?: { properties: { title: string } };
          deleteDimension?: { range: { sheetId: number; dimension: string; startIndex: number; endIndex: number } };
        }[]) {
          if (request.addSheet) {
            const { title } = request.addSheet.properties;
            if (!getSheet(workbook, title, spreadsheetId)) {
              workbook.sheets.set(sheetKey(spreadsheetId, title), {
                sheetId: workbook.nextSheetId++,
                title,
                spreadsheetId,
                values: [[]],
              });
            }
            continue;
          }
          if (request.deleteDimension) {
            const { sheetId, dimension, startIndex, endIndex } = request.deleteDimension.range;
            if (dimension !== 'ROWS') throw new Error('Fake hanya mendukung deleteDimension ROWS');
            const target = [...workbook.sheets.values()].find((s) => s.sheetId === sheetId);
            if (!target) throw new Error(`Sheet tidak ditemukan: sheetId ${sheetId}`);
            target.values.splice(startIndex, endIndex - startIndex);
          }
        }
        return { data: {} };
      },

      values: {
        get: async ({ spreadsheetId, range }) => {
          calls.push({ method: 'values.get', spreadsheetId, range });
          const { sheetName } = parseRange(range);
          const sheet = requireSheet(spreadsheetId, sheetName);
          // Sheets mengembalikan baris interior kosong apa adanya; tidak ada
          // trimming di layer ini (lihat readSheetDataRaw).
          return { data: { values: sheet.values.map((row) => [...row]) } };
        },

        batchGet: async ({ spreadsheetId, ranges }) => {
          calls.push({ method: 'values.batchGet', spreadsheetId, range: ranges.join(',') });
          return {
            data: {
              valueRanges: ranges.map((range) => {
                const { sheetName } = parseRange(range);
                const sheet = getSheet(workbook, sheetName, spreadsheetId);
                return { values: sheet ? sheet.values.map((row) => [...row]) : [] };
              }),
            },
          };
        },

        update: async ({ spreadsheetId, range, requestBody }) => {
          calls.push({ method: 'values.update', spreadsheetId, range, values: requestBody.values });
          const { sheetName, a1 } = parseRange(range);
          writeRange(requireSheet(spreadsheetId, sheetName), a1, requestBody.values);
          return { data: {} };
        },

        batchUpdate: async ({ spreadsheetId, requestBody }) => {
          calls.push({ method: 'values.batchUpdate', spreadsheetId });
          for (const item of requestBody.data) {
            const { sheetName, a1 } = parseRange(item.range);
            writeRange(requireSheet(spreadsheetId, sheetName), a1, item.values);
          }
          return { data: {} };
        },

        append: async ({ spreadsheetId, range, requestBody }) => {
          calls.push({ method: 'values.append', spreadsheetId, range, values: requestBody.values });
          const { sheetName } = parseRange(range);
          const sheet = requireSheet(spreadsheetId, sheetName);
          for (const row of requestBody.values) {
            sheet.values.push(row.map(cloneCell));
          }
          return { data: {} };
        },
      },
    },
  };
}