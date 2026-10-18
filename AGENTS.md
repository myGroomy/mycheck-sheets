<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Arsitektur Data MyCheck

- Acuan header dan relasi data adalah `PLAN/DATABASE_SCHEMA.md`; `PLAN/ERD.md`
  dan `PLAN/ERD-CHEN.md` hanya dokumen turunan.
- Nama sheet, header, normalisasi, dan periode berada di `lib/schema/`.
- `lib/google/branch-schema.ts` hanya re-export kompatibilitas; akses data
  berada di `lib/store.ts` dan helper Google Sheets.
- Mode `flat` adalah default template baru dan menulis ke sheet `Base` tanpa
  suffix periode. Mode `monthly` dan `yearly` tetap kompatibilitas untuk cabang
  lama.
- Migrasi, arsip, dan cleanup spreadsheet wajib dry-run/backup terlebih dahulu;
  jangan menghapus `PIN`, `Folder_Drive_ID`, atau fallback monthly tanpa gate
  migrasi yang sesuai.
