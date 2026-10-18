# ERD MyCheck (Turunan)

Dokumen ini diturunkan dari `PLAN/DATABASE_SCHEMA.md` dan
`lib/schema/registry.ts`. Jika berbeda, source dan schema kanonik yang
berlaku.

```mermaid
erDiagram
  SHIFT_DEFINITIONS ||--o{ SOP_CATEGORIES : has
  SOP_CATEGORIES ||--o{ CHECKLIST_POINTS : has
  SHIFT_DEFINITIONS ||--o{ HANDOVER_FIELDS : has
  SHIFT_DEFINITIONS ||--o{ SHIFT_INSTANCES : creates
  SHIFT_INSTANCES ||--o{ PARTICIPANTS : has
  SHIFT_INSTANCES ||--o{ ENTRIES : records
  SHIFT_INSTANCES ||--o{ HANDOVERS : submits
  HANDOVERS ||--o{ HANDOVER_ACKS : receives
  SHIFT_INSTANCES ||--o{ REPORTS : produces
  REPORTS ||--o{ ADDENDA : extends
  SHIFT_INSTANCES ||--o{ INCIDENTS : reports
  INCIDENTS ||--o{ INCIDENT_NOTES : annotates
  SHIFT_INSTANCES ||--o{ PHOTOS : owns
```

Google Sheets tidak menegakkan relasi, foreign key, transaksi, atau unique
constraint; panah menunjukkan relasi logis yang diperiksa aplikasi.
