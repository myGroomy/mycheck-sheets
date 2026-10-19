# ERD Chen MyCheck (Turunan)

Dokumen ini adalah representasi konseptual turunan dari
`PLAN/DATABASE_SCHEMA.md`, bukan sumber schema runtime.

```mermaid
flowchart LR
  Branch[Daftar_Cabang] --> Active[Spreadsheet Cabang Aktif]
  Branch --> Archive[Spreadsheet Arsip Tahunan]
  Active --> Meta[_meta: schema_version / period_mode]
  Active --> Config[ShiftDefinitions / SOP / HandoverFields]
  Config --> Instance[ShiftInstances]
  Instance --> Checklist[Entries / EntryLogs]
  Instance --> Handover[Handovers / HandoverAcks]
  Instance --> Report[Reports / Addenda]
  Instance --> Incident[Incidents / Notes]
  Instance --> Photo[Photos -> Google Drive]
  Instance --> Audit[AuditLog]
  Instance --> PjLog[ShiftPjAssignments]
  Instance --> Reviews[EntryReviews]
  Report --> Ledger[ScoreLedger]
  Checklist --> Reviews
```

Detail header dan aturan periode mengikuti `PLAN/DATABASE_SCHEMA.md`.
