# ERD MyCheck (Google Sheets)

Dokumen ini merangkum relasi logis pada penyimpanan MyCheck. Ini **bukan ERD
database relasional**: implementasi memakai Google Sheets, sehingga panah
menandai referensi berdasarkan kolom dan bukan foreign key yang ditegakkan
database. Sumber nama/header sheet cabang adalah `lib/google/branch-schema.ts`;
akses Registry berada di `lib/google/registry.ts` dan
`lib/google/registry-admin.ts`. Detail kolom yang lebih lengkap ada di
[`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).

## Letak data

```mermaid
flowchart LR
  ENV["REGISTRY_SPREADSHEET_ID"] --> REG["Spreadsheet Registry"]
  REG --> BR["Daftar_Cabang"]
  REG --> USERS["Users"]
  REG --> SETTINGS["Settings_Global"]
  REG --> SHARES["Share_Tokens"]
  BR -->|"Spreadsheet_ID"| BRANCH["Spreadsheet cabang"]
  BRANCH --> CONFIG["Sheet konfigurasi dan state"]
  BRANCH --> OPS["Sheet operasional"]
  BRANCH --> MONTHLY["Sheet data bulanan"]
  PHOTOS["Google Drive"] --- PHOTOMETA["Metadata Photos di sheet bulanan"]
```

Setiap cabang aktif menunjuk spreadsheet cabangnya melalui `Spreadsheet_ID`.
Tidak ada `branch_id` wajib pada setiap sheet cabang karena konteks cabang
ditentukan oleh spreadsheet tersebut. Foto fisik disimpan di Drive, sedangkan
referensi dan metadata disimpan pada sheet `Photos`.

## Relasi logis utama

```mermaid
erDiagram
  Daftar_Cabang {
    string Cabang_ID
    string Spreadsheet_ID
    string Folder_Drive_ID
    string Aktif
  }
  Users {
    string User_ID
    string Username
    string PIN
    string Role
    string Cabang_ID
  }
  ShiftDefinitions {
    string id
    string name
    string is_active
  }
  SopCategories {
    string id
    string shift_definition_id
  }
  ChecklistPoints {
    string id
    string sop_category_id
  }
  HandoverFields {
    string id
    string shift_definition_id
  }
  ShiftInstances {
    string id
    string shift_definition_id
    string tab_month
    string template_snapshot
    string status
  }
  Participants {
    string id
    string shift_instance_id
    string user_id
  }
  Entries {
    string id
    string shift_instance_id
    string point_ref
  }
  EntryLogs {
    string id
    string entry_id
    string client_action_id
  }
  Handovers {
    string id
    string shift_instance_id
  }
  HandoverAcks {
    string id
    string handover_id
    string reading_shift_instance_id
  }
  Reports {
    string id
    string shift_instance_id
  }
  Addenda {
    string id
    string report_id
  }
  Incidents {
    string id
    string shift_instance_id
    string category_id
  }
  IncidentCategories {
    string id
    string name
  }
  IncidentNotes {
    string id
    string incident_id
  }
  Photos {
    string id
    string owner_type
    string owner_id
    string file_ref
  }

  Daftar_Cabang }o--o{ Users : "akses cabang dicatat pada Users"
  ShiftDefinitions ||--o{ SopCategories : "shift_definition_id"
  SopCategories ||--o{ ChecklistPoints : "sop_category_id"
  ShiftDefinitions ||--o{ HandoverFields : "shift_definition_id"
  ShiftDefinitions ||--o{ ShiftInstances : "shift_definition_id"
  ShiftInstances ||--o{ Participants : "shift_instance_id"
  ShiftInstances ||--o{ Entries : "shift_instance_id"
  ChecklistPoints ||--o{ Entries : "point_ref"
  Entries ||--o{ EntryLogs : "entry_id"
  ShiftInstances ||--o{ Handovers : "shift_instance_id"
  Handovers ||--o{ HandoverAcks : "handover_id"
  ShiftInstances ||--o{ Reports : "shift_instance_id"
  Reports ||--o{ Addenda : "report_id"
  ShiftInstances ||--o{ Incidents : "shift_instance_id"
  IncidentCategories ||--o{ Incidents : "category_id"
  Incidents ||--o{ IncidentNotes : "incident_id"
```

Diagram hanya menunjukkan hubungan penting; beberapa relasi bersifat
polimorfik atau diindeks terpisah dan sengaja tidak dinyatakan sebagai
foreign key:

- `Users.Cabang_ID` menyimpan akses cabang sesuai format yang diproses oleh
  kode; daftar semua cabang untuk admin ditentukan aplikasi.
- `Entries.point_ref` mereferensikan item pada snapshot template. Template
  instance disimpan di `ShiftInstances.template_snapshot`, sehingga instance
  tetap menggambarkan konfigurasi saat dibuka.
- Sheet operasional bulanan dipilih dari `ShiftInstances.tab_month`. Nama
  seperti `Entries_2026-10` dan `Incidents_2026-10` adalah partisi operasional
  yang dikelola aplikasi, bukan partisi SQL.
- `Photos.owner_type` dan `owner_id` merujuk ke owner sesuai tipe; byte foto
  disimpan di Google Drive, bukan di sheet.
- `Share_Tokens` di Registry merujuk ke laporan cabang melalui ID cabang dan
  report ID; akses publik ditangani oleh route laporan token.

## Batas konsistensi

Google Sheets tidak menegakkan primary key, unique key, foreign key,
transaction, atau row lock. Nilai `id` dan hubungan pada gambar merupakan
konvensi kode. Pemeriksaan aplikasi dan rekonsiliasi membantu menangani
duplikasi/konflik, tetapi tidak memberi jaminan atomik database relasional.
PIN pengguna saat ini juga disimpan sebagai teks biasa; hal tersebut merupakan
risiko keamanan implementasi, bukan rekomendasi skema.
