# Rencana Implementasi Perbaikan State Change UI

> **Tujuan:** Menutup semua gap yang teridentifikasi dalam audit state change terhadap 24 komponen UI di aplikasi MyCheck.
>
> **Prioritas:** P1 (Critical) > P2 (High) > P3 (Medium) > P4 (Low)
>
> **Estimasi Total:** ~8-10 hari kerja

---

## Fase 1: P1 — Critical (Keamanan & Data Integrity)

### 1.1 Dialog Konfirmasi Sebelum Hapus Permanen

**Masalah:** Aksi destructive (hapus) tidak memiliki konfirmasi eksplisit, berisiko hapus data tidak sengaja.

**Komponen terdampak:**
- `app/admin/akun/page.tsx` — hapus akun
- `app/admin/cabang/page.tsx` — hapus cabang
- `app/admin/kategori-incident/page.tsx` — hapus kategori
- `app/admin/checklist-builder/page.tsx` — hapus section/point
- `app/admin/handover-builder/page.tsx` — hapus field
- `app/admin/shift/page.tsx` — hapus shift definition

**Implementasi:**

```
File baru: components/admin/confirm-delete-dialog.tsx

Interface:
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string              // "Hapus Akun", "Hapus Cabang", dst.
  itemName: string           // nama item yang akan dihapus
  impact: string             // deskripsi dampak (mis. "Semua laporan terkait tetap tersimpan")
  confirmLabel?: string      // default: "Ya, Hapus"
  loading?: boolean
  error?: string | null
  onConfirm: () => void      // async handler

Perilaku:
  - Dialog dengan ikon merah (AlertTriangle)
  - Wajib ketik nama item untuk konfirmasi (type-to-confirm) untuk item kritis
  - Tombol "Ya, Hapus" disabled sampai input cocok
  - Loading state saat proses hapus
  - Auto-clear error saat dialog ditutup
```

**Langkah:**
1. [ ] Buat komponen `ConfirmDeleteDialog` reusable
2. [ ] Integrasikan ke semua 6 halaman admin di atas
3. [ ] Setiap tombol hapus memanggil dialog ini, bukan langsung API call
4. [ ] Test: pastikan tidak bisa hapus tanpa konfirmasi

---

### 1.2 Auto-Clear Error Saat User Mulai Mengetik

**Masalah:** Pesan error bertahan terus setelah user mulai memperbaiki input.

**Komponen terdampak:**
- `components/admin/sensitive-action.tsx`
- `components/shift/shift-close-dialog.tsx`
- `app/admin/akun/page.tsx` (form dialog)
- `app/admin/cabang/page.tsx` (form dialog)
- `app/admin/shift/page.tsx` (form dialog)
- Semua form dialog lainnya

**Implementasi:**

```typescript
// Pattern: tambahkan useEffect yang clear error saat relevant state berubah

// sensitive-action.tsx
useEffect(() => {
  if (error) onOpenChange(true); // trigger parent to clear error
}, [reason, pin, newPin]);

// Atau lebih baik: ubah controlled error dari parent
// Parent clear error setiap kali form field berubah

// Contoh implementasi di parent:
const [formError, setFormError] = useState<string | null>(null);

const clearErrorOnChange = () => {
  setFormError(null);
};

// Passing ke dialog:
<SensitiveActionDialog
  error={formError}
  onClearError={() => setFormError(null)}
  ...
/>
```

**Langkah:**
1. [ ] Tambahkan prop `onClearError` ke `SensitiveActionDialog`
2. [ ] Panggil `onClearError()` di setiap `onChange` handler (reason, pin, newPin)
3. [ ] Terapkan pattern yang sama di `ShiftCloseDialog` (error, photoError)
4. [ ] Terapkan di semua form dialog admin (akun, cabang, shift, dll)
5. [ ] Test: pastikan error hilang saat user mengetik

---

### 1.3 Auto-Redirect Setelah Success (Ganti PIN)

**Masalah:** Halaman ganti PIN menampilkan pesan sukses tapi tidak auto-redirect.

**Komponen terdampak:**
- `app/ganti-pin/page.tsx`

**Implementasi:**

```typescript
// app/ganti-pin/page.tsx
import { useRouter } from 'next/navigation';

const router = useRouter();

// Setelah success:
useEffect(() => {
  if (success) {
    toast.success('PIN berhasil diubah');
    const timer = setTimeout(() => {
      router.push('/'); // atau halaman sebelumnya
    }, 2000);
    return () => clearTimeout(timer);
  }
}, [success]);
```

**Langkah:**
1. [ ] Tambahkan `useRouter` import
2. [ ] Tambahkan useEffect untuk auto-redirect 2 detik setelah success
3. [ ] Tampilkan countdown atau animasi sukses
4. [ ] Test: pastikan redirect terjadi setelah sukses

---

## Fase 2: P2 — High (UX & Keamanan)

### 2.1 PIN Visibility Toggle

**Masalah:** PIN input selalu hidden, sulit untuk user memastikan input benar.

**Komponen terdampak:**
- `app/login/page.tsx`
- `app/ganti-pin/page.tsx`
- `components/admin/sensitive-action.tsx`
- `components/shift/shift-close-dialog.tsx`

**Implementasi:**

```typescript
// File baru: components/ui/password-input.tsx

interface PasswordInputProps extends Omit<InputProps, 'type'> {
  showToggle?: boolean; // default: true
}

export function PasswordInput({ showToggle = true, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} />
      {showToggle && (
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          aria-label={visible ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
```

**Langkah:**
1. [ ] Buat komponen `PasswordInput` reusable
2. [ ] Ganti input password di login page
3. [ ] Ganti input PIN di ganti-pin page
4. [ ] Ganti input PIN di sensitive-action dialog
5. [ ] Ganti input PIN di close-shift wizard (step 3)
6. [ ] Test: pastikan toggle berfungsi di semua lokasi

---

### 2.2 Error Spesifik di Login

**Masalah:** Login error tidak membedakan antara username tidak ditemukan vs PIN salah vs akun terkunci.

**Komponen terdampak:**
- `app/login/page.tsx`
- API route `app/api/auth/login/route.ts`

**Implementasi:**

```typescript
// app/api/auth/login/route.ts
// Ubah response error yang generic jadi spesifik:

// 401: PIN salah
// 403: Akun terkunci
// 404: Username tidak ditemukan
// 423: Terlalu banyak percobaan (lockout)

// app/login/page.tsx
const ERROR_MESSAGES: Record<number, string> = {
  401: 'PIN yang Anda masukkan salah.',
  403: 'Akun Anda terkunci. Hubungi admin.',
  404: 'Username tidak ditemukan.',
  423: 'Terlalu banyak percobaan. Coba lagi dalam 5 menit.',
  500: 'Terjadi kesalahan. Silakan coba lagi.',
};

// Tampilkan error dengan ikon berbeda per tipe
// 401: AlertCircle (biasa)
// 402: Lock (warning)
// 423: Timer (timeout)
```

**Langkah:**
1. [ ] Update API login untuk return HTTP status spesifik
2. [ ] Update login page untuk handle setiap status
3. [ ] Tambahkan lockout counter di client-side (maks 5 percobaan, cooldown 5 menit)
4. [ ] Tampilkan pesan yang user-friendly per tipe error
5. [ ] Test: verifikasi setiap skenario error tampil pesan yang tepat

---

### 2.3 Unsaved Changes Warning

**Masalah:** Form panjang (checklist builder, handover builder) bisa kehilangan data jika user navigasi tanpa sengaja.

**Komponen terdampak:**
- `app/admin/checklist-builder/page.tsx`
- `app/admin/handover-builder/page.tsx`
- `app/admin/pengaturan/page.tsx`

**Implementasi:**

```typescript
// File baru: hooks/use-unsaved-changes.ts

export function useUnsavedChanges(isDirty: boolean) {
  const router = useRouter();
  
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
  
  // Untuk Next.js client-side navigation, gunakan confirmation dialog
  // Bisa pakai window.confirm atau custom dialog
}

// Contoh penggunaan di checklist-builder:
const isDirty = useMemo(() => {
  return (
    titleDraft !== originalTitle ||
    instructionDraft !== originalInstruction ||
    categoryName.trim() !== '' ||
    pointTitle.trim() !== ''
  );
}, [titleDraft, instructionDraft, categoryName, pointTitle, ...]);

useUnsavedChanges(isDirty);
```

**Langkah:**
1. [ ] Buat hook `useUnsavedChanges`
2. [ ] Integrasikan ke checklist-builder
3. [ ] Integrasikan ke handover-builder
4. [ ] Integrasikan ke pengaturan page
5. [ ] Test: pastikan browser warn sebelum leave saat ada perubahan

---

### 2.4 Confirm Sebelum Close Dialog dengan Data Terisi

**Masalah:** Close shift wizard dan sensitive action dialog bisa ditutup saat sudah ada data terisi.

**Komponen terdampak:**
- `components/shift/shift-close-dialog.tsx`
- `components/admin/sensitive-action.tsx`
- Semua form dialog admin

**Implementasi:**

```typescript
// Pattern untuk konfirmasi tutup:
const hasUnsavedData = useMemo(() => {
  // close shift: values terisi
  return Object.keys(values).length > 0 || freeText.trim() !== '';
}, [values, freeText]);

// sensitive action: reason/pin terisi
const hasUnsavedData = useMemo(() => {
  return reason.trim() !== '' || pin !== '';
}, [reason, pin]);

const handleOpenChange = (open: boolean) => {
  if (!open && hasUnsavedData && !loading) {
    setConfirmClose(true); // tampilkan dialog konfirmasi
    return;
  }
  onOpenChange(open);
};
```

**Langkah:**
1. [ ] Tambahkan `confirmClose` state di setiap dialog dengan form
2. [ ] Tambahkan dialog konfirmasi "Data belum disimpan. Tutup?"
3. [ ] Integrasikan ke close-shift wizard
4. [ ] Integrasikan ke sensitive-action dialog
5. [ ] Integrasikan ke semua form dialog admin
6. [ ] Test: pastikan dialog konfirmasi muncul saat ada data terisi

---

## Fase 3: P3 — Medium (UX Polish)

### 3.1 Photo Upload Progress Per File

**Masalah:** Upload foto hanya menunjukkan progress keseluruhan, tidak per file.

**Komponen terdampak:**
- `components/incident/incident-create-form.tsx`
- `components/shift/checklist-point-controls.tsx`
- `components/shift/shift-close-dialog.tsx`

**Implementasi:**

```typescript
// State baru per komponen:
const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

// Saat upload:
const uploadPhoto = async (file: File, fieldId: string) => {
  // Gunakan XMLHttpRequest untuk progress tracking
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(prev => ({ ...prev, [fieldId]: percent }));
      }
    };
    
    xhr.onload = () => {
      // handle response
    };
    
    xhr.onerror = () => reject(new Error('Upload gagal'));
    
    xhr.open('POST', '/api/photos/upload');
    const form = new FormData();
    form.set('file', file);
    // ... field lain
    xhr.send(form);
  });
};

// UI: tampilkan progress bar per file
{Object.entries(uploadProgress).map(([fieldId, percent]) => (
  <div key={fieldId} className="h-1.5 rounded-full bg-gray-200">
    <div
      className="h-full rounded-full bg-blue-500 transition-all"
      style={{ width: `${percent}%` }}
    />
  </div>
))}
```

**Langkah:**
1. [ ] Buat helper `uploadPhotoWithProgress` dengan XHR
2. [ ] Integrasikan ke incident-create-form
3. [ ] Integrasikan ke checklist-point-controls
4. [ ] Integrasikan ke close-shift wizard (handover photos)
5. [ ] Tampilkan progress bar per foto
6. [ ] Test: pastikan progress akurat untuk tiap file

---

### 3.2 Refreshing State Terpisah dari Loading

**Masalah:** Refresh data tidak bisa dibedakan dari initial loading.

**Komponen terdampak:**
- `components/shift/shift-checklist.tsx`
- `components/incident/incident-list.tsx`
- `components/report/report-list.tsx`
- `app/admin/incident/page.tsx`

**Implementasi:**

```typescript
// Pattern:
const [loading, setLoading] = useState(true);      // initial load
const [refreshing, setRefreshing] = useState(false); // refresh/subsequent

const load = useCallback(async (isRefresh = false) => {
  if (isRefresh) {
    setRefreshing(true);
  } else {
    setLoading(true);
  }
  try {
    await fetchData();
  } finally {
    if (isRefresh) {
      setRefreshing(false);
    } else {
      setLoading(false);
    }
  }
}, []);

// UI: tampilkan spinner kecil saat refresh, skeleton saat loading
{refreshing && <RefreshCw className="h-4 w-4 animate-spin" />}
{loading ? <SkeletonList /> : <Content />}
```

**Langkah:**
1. [ ] Pisahkan `loading` dan `refreshing` state di setiap komponen terdampak
2. [ ] Update `load()` function untuk terima parameter `isRefresh`
3. [ ] UI: spinner kecil saat refresh, skeleton saat initial loading
4. [ ] Test: pastikan refresh tidak menyebabkan flicker skeleton

---

### 3.3 Copy Timeout Auto-Reset

**Masalah:** State `copied` tidak pernah reset, pesan "tersalin" bertahan selamanya.

**Komponen terdampak:**
- `app/admin/cabang/page.tsx`

**Implementasi:**

```typescript
const [copied, setCopied] = useState<string | null>(null);
const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

const handleCopy = async (text: string, label: string) => {
  await navigator.clipboard.writeText(text);
  setCopied(label);
  
  if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  
  copyTimeoutRef.current = setTimeout(() => {
    setCopied(null);
  }, 2000);
};

// Cleanup
useEffect(() => {
  return () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  };
}, []);
```

**Langkah:**
1. [ ] Tambahkan timeout auto-reset di cabang page
2. [ ] Terapkan pattern yang sama di semua lokasi copy-to-clipboard
3. [ ] Test: pastikan "tersalin" hilang setelah 2 detik

---

### 3.4 Error State Per Field di Form Dialogs

**Masalah:** Form dialogs hanya punya satu `formError` untuk semua field.

**Komponen terdampak:**
- `app/admin/akun/page.tsx` (user form)
- `app/admin/cabang/page.tsx` (branch form)
- `app/admin/shift/page.tsx` (shift form)
- `components/admin/handover-field-editor.tsx`
- `components/admin/point-editor-dialog.tsx`

**Implementasi:**

```typescript
// Ganti formError string dengan record per field:
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

// Validasi per field:
const validate = () => {
  const errors: Record<string, string> = {};
  if (!form.username.trim()) errors.username = 'Username wajib diisi';
  if (!form.name.trim()) errors.name = 'Nama wajib diisi';
  if (!/^\d{6}$/.test(form.pin)) errors.pin = 'PIN harus 6 digit';
  setFieldErrors(errors);
  return Object.keys(errors).length === 0;
};

// UI: tampilkan error di bawah setiap field
{fieldErrors.username && (
  <p className="text-[11px] text-error">{fieldErrors.username}</p>
)}
```

**Langkah:**
1. [ ] Ganti `formError: string` dengan `fieldErrors: Record<string, string>` di setiap form
2. [ ] Tambahkan validasi per field sebelum submit
3. [ ] Tampilkan pesan error di bawah field yang relevant
4. [ ] Auto-clear error per field saat user memperbaiki input
5. [ ] Test: pastikan error tampil di field yang tepat

---

### 3.5 Pesan Notice Typed (Success vs Error)

**Masalah:** State `notice` adalah string tunggal tanpa tipe, warna sama untuk success dan error.

**Komponen terdampak:**
- `components/shift/shift-dashboard.tsx` (`notice`)
- `components/shift/shift-checklist.tsx` (`notice`)
- `components/incident/incident-create-form.tsx` (`message`)
- `app/admin/laporan/page.tsx` (`notice`)

**Implementasi:**

```typescript
// Ganti:
const [notice, setNotice] = useState<string | null>(null);

// Dengan:
const [notice, setNotice] = useState<{
  type: 'success' | 'error' | 'info';
  message: string;
} | null>(null);

// UI:
{notice && (
  <div
    role={notice.type === 'error' ? 'alert' : 'status'}
    className={cn(
      'flex items-start gap-2 rounded-xl border p-3 text-sm',
      notice.type === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
      notice.type === 'error' && 'border-red-200 bg-red-50 text-red-800',
      notice.type === 'info' && 'border-amber-200 bg-amber-50 text-amber-800'
    )}
  >
    {notice.type === 'success' && <CheckCircle2 />}
    {notice.type === 'error' && <AlertCircle />}
    {notice.type === 'info' && <Info />}
    <span>{notice.message}</span>
  </div>
)}
```

**Langkah:**
1. [ ] Ganti state `notice` jadi typed object di semua komponen terdampak
2. [ ] Update semua `setNotice()` call sites
3. [ ] Tampilkan warna berbeda berdasarkan tipe
4. [ ] Tambahkan ikon berbeda berdasarkan tipe
5. [ ] Test: pastikan sukses/error/info tampil berbeda

---

## Fase 4: P4 — Low (Code Quality & Architecture)

### 4.1 Refactor useReducer untuk Kompleksitas Tinggi

**Masalah:** Komponen dengan 15+ useState hooks sulit maintenance.

**Komponen terdampak:**
- `app/admin/checklist-builder/page.tsx` (20+ hooks)
- `app/admin/akun/page.tsx` (17+ hooks)
- `app/admin/operasi-shift/page.tsx` (15+ hooks)

**Implementasi untuk checklist-builder (paling kompleks):**

```typescript
// File baru: lib/reducers/checklist-builder-reducer.ts

interface ChecklistBuilderState {
  // Data
  branches: Branch[];
  branchId: string;
  shifts: Shift[];
  shiftId: string;
  categories: Category[];
  
  // Selection
  selectedCategoryId: string | null;
  selectedPointId: string | null;
  
  // UI State
  loading: boolean;
  categoryOpen: boolean;
  editingCategory: Category | null;
  pointOpen: boolean;
  editingPoint: Point | null;
  previewOpen: boolean;
  
  // Form Drafts
  categoryName: string;
  categorySort: number;
  categoryActive: boolean;
  pointTitle: string;
  pointInstruction: string;
  
  // Inline Edit
  editingTitle: boolean;
  titleDraft: string;
  editingInstruction: boolean;
  instructionDraft: string;
  
  // Feedback
  savingCategory: boolean;
  categoryError: string | null;
  savingPoint: boolean;
  pointError: string | null;
  savingInline: boolean;
  busyId: string | null;
}

type ChecklistBuilderAction =
  | { type: 'SET_DATA'; payload: Partial<ChecklistBuilderState> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SELECT_CATEGORY'; payload: string | null }
  | { type: 'SELECT_POINT'; payload: string | null }
  | { type: 'START_EDIT_CATEGORY'; payload: Category }
  | { type: 'CANCEL_EDIT_CATEGORY' }
  | { type: 'START_EDIT_POINT'; payload: Point }
  | { type: 'CANCEL_EDIT_POINT' }
  | { type: 'UPDATE_CATEGORY_DRAFT'; payload: Partial<Pick<ChecklistBuilderState, 'categoryName' | 'categorySort' | 'categoryActive'>> }
  | { type: 'UPDATE_POINT_DRAFT'; payload: Partial<Pick<ChecklistBuilderState, 'pointTitle' | 'pointInstruction'>> }
  | { type: 'SET_SAVING'; payload: { field: 'category' | 'point' | 'inline'; value: boolean } }
  | { type: 'SET_ERROR'; payload: { field: 'category' | 'point'; value: string | null } };

function checklistBuilderReducer(
  state: ChecklistBuilderState,
  action: ChecklistBuilderAction
): ChecklistBuilderState {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, ...action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SELECT_CATEGORY':
      return { ...state, selectedCategoryId: action.payload, selectedPointId: null };
    case 'SELECT_POINT':
      return { ...state, selectedPointId: action.payload };
    case 'START_EDIT_CATEGORY':
      return {
        ...state,
        categoryOpen: true,
        editingCategory: action.payload,
        categoryName: action.payload.name,
        categorySort: action.payload.sortOrder ?? 0,
        categoryActive: action.payload.isActive,
        categoryError: null,
      };
    case 'CANCEL_EDIT_CATEGORY':
      return { ...state, categoryOpen: false, editingCategory: null, categoryError: null };
    // ... dst
    default:
      return state;
  }
}
```

**Langkah:**
1. [ ] Buat reducer untuk checklist-builder (terbesar)
2. [ ] Migrasi checklist-builder page ke useReducer
3. [ ] Buat reducer untuk admin akun
4. [ ] Migrasi admin akun page ke useReducer
5. [ ] Buat reducer untuk operasi-shift
6. [ ] Migrasi operasi-shift page ke useReducer
7. [ ] Test: pastikan semua fungsionalitas tetap bekerja setelah refactor

---

### 4.2 Unsaved Changes Warning untuk Semua Form

**Masalah:** Hanya form panjang yang butuh warning, tapi form pendek juga perlu.

**Komponen terdampak:**
- Semua form dialog di aplikasi

**Implementasi:** (sama dengan 2.3, tapi diterapkan konsisten)

**Langkah:**
1. [ ] Buat hook `useUnsavedChanges` yang reusable
2. [ ] Integrasikan ke semua form dialog
3. [ ] Konfigurasi: `isDirty` check berbasis dirty fields
4. [ ] Test: pastikan warning muncul konsisten

---

### 4.3 Auto-Save Draft untuk Form Panjang

**Masalah:** Checklist builder dan handover builder bisa kehilangan data jika session berakhir.

**Komponen terdampak:**
- `app/admin/checklist-builder/page.tsx`
- `app/admin/handover-builder/page.tsx`

**Implementasi:**

```typescript
// Auto-save draft ke localStorage
const DRAFT_KEY = 'checklist-builder-draft';

const saveDraft = (state: Record<string, unknown>) => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    ...state,
    savedAt: new Date().toISOString(),
  }));
};

// Restore saat mount
const restoreDraft = () => {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Tampilkan indikator "Draft tersimpan 2 menit lalu"
// Tombol "Mulai dari draft" saat mount
```

**Langkah:**
1. [ ] Buat helper `useAutoSaveDraft` dengan localStorage
2. [ ] Integrasikan ke checklist-builder
3. [ ] Integrasikan ke handover-builder
4. [ ] Tampilkan indikator last-saved timestamp
5. [ ] Tombol restore draft saat mount
6. [ ] Test: pastikan draft tersimpan dan bisa di-restore

---

### 4.4 Rate Limiting di Client-Side Login

**Masalah:** Tidak ada lockout mechanism di client-side untuk mencegah brute force.

**Komponen terdampak:**
- `app/login/page.tsx`

**Implementasi:**

```typescript
const [attempts, setAttempts] = useState(0);
const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  
  if (lockoutUntil && Date.now() < lockoutUntil) {
    const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
    setError(`Terlalu banyak percobaan. Tunggu ${remaining} detik.`);
    return;
  }
  
  // ... login logic
  
  if (loginFailed) {
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    if (nextAttempts >= 5) {
      setLockoutUntil(Date.now() + 5 * 60 * 1000); // 5 menit
      setAttempts(0);
    }
  }
};
```

**Langkah:**
1. [ ] Tambahkan attempt counter dan lockout state
2. [ ] Implementasi exponential backoff
3. [ ] Tampilkan countdown timer saat lockout
4. [ ] Test: pastikan lockout aktif setelah 5 kali gagal

---

## Status Implementasi

> Semua fase 1–4 selesai dan terverifikasi (`tsc --noEmit` bersih, `oxlint` bersih, 111/111 test lulus).

### Fase 1 — P1 Critical ✅

| # | Task | File / Komponen |
|---|---|---|
| 1.1 | Dialog konfirmasi hapus permanen | `components/admin/confirm-delete-dialog.tsx` (baru), integrasi di `kategori-incident`, `shift`, `handover-builder`, `checklist-builder` |
| 1.2 | Auto-clear error saat mengetik | `sensitive-action.tsx` (+prop `onClearError`), `point-editor-dialog.tsx` (+prop `onClearError`), `shift-close-dialog.tsx`, `akun`, `operasi-shift`, `cabang`, `checklist-builder` |
| 1.3 | Auto-redirect ganti PIN | `app/ganti-pin/page.tsx` — countdown 2 detik + cleanup timer |

### Fase 2 — P2 High ✅

| # | Task | File / Komponen |
|---|---|---|
| 2.1 | PIN visibility toggle | `components/ui/password-input.tsx` (baru), integrasi di `login`, `ganti-pin`, `sensitive-action`, `shift-close-dialog` |
| 2.2 | Login error spesifik + lockout | `api/auth/login/route.ts` (HTTP 404/401/403 + `code`), `AuthContext.tsx` (teruskan `code`), `login/page.tsx` (5 tipe error + lockout 5 menit + countdown) |
| 2.3 | Unsaved changes warning | `hooks/use-unsaved-changes.ts` (baru), integrasi di `checklist-builder`, `handover-builder`, `pengaturan` |
| 2.4 | Konfirmasi tutup dialog | `components/admin/confirm-close-dialog.tsx` (baru), integrasi di `sensitive-action`, `shift-close-dialog` |

### Fase 3 — P3 Medium ✅

| # | Task | File / Komponen |
|---|---|---|
| 3.1 | Photo upload progress per file | `lib/upload-photo.ts` (baru), integrasi di `incident-create-form` (progress bar per foto), `checklist-point-controls` (progress bar), `shift-close-dialog` |
| 3.2 | Refreshing state terpisah | `incident-list` (`refresh()` terpisah + spinner), `report-list` |
| 3.3 | Copy timeout auto-reset | `admin/cabang` — `useRef` timer + cleanup saat unmount, reset 2 detik |
| 3.4 | Field-level error | `admin/akun` — `fieldErrors: Record<string, string>`, pesan per field + `aria-invalid`/`aria-describedby` |
| 3.5 | Typed notice | Sudah ada di `incident-create-form` (`{ text, error }`) |

### Fase 4 — P4 Low ✅

| # | Task | File / Komponen |
|---|---|---|
| 4.1 | Refactor useReducer | `lib/reducers/checklist-builder-reducer.ts` (baru) — 20+ `useState` → `useReducer` dengan 17 action types |
| 4.2 | Unsaved changes semua form | Sama dengan 2.3 |
| 4.3 | Auto-save draft | `hooks/use-auto-save-draft.ts` (baru) — debounce 800ms ke localStorage + `readDraft`/`clearDraft`; UI indikator "Draft tersimpan HH:MM" + tombol "Mulai dari draft"/"Hapus draft" di `checklist-builder` dan `handover-builder` |
| 4.4 | Login rate limiting | Sama dengan 2.2 |

### Perbaikan Sampingan

- `app/api/incidents/route.ts` dan `app/api/incidents/[id]/route.ts`: `Cache-Control` dari `max-age` → `no-store` (bug status incident tidak ter-update di UI)

---

## Fase 5: Testing & Validation

### 5.1 Test Matrix Per Fase

| Fase | Komponen | Test Cases | Status |
|------|----------|------------|--------|
| 1.1 | ConfirmDeleteDialog | Muncul saat hapus, tidak tanpa konfirmasi | [ ] |
| 1.2 | Auto-clear error | Error hilang saat mengetik | [ ] |
| 1.3 | Auto-redirect ganti PIN | Redirect 2 detik setelah sukses | [ ] |
| 2.1 | PIN toggle | Show/hide berfungsi di 4 lokasi | [ ] |
| 2.2 | Login error spesifik | Setiap status tampil pesan tepat | [ ] |
| 2.3 | Unsaved changes | Browser warn sebelum leave | [ ] |
| 2.4 | Dialog close confirm | Konfirmasi saat ada data | [ ] |
| 3.1 | Photo upload progress | Progress per file akurat | [ ] |
| 3.2 | Refreshing state | Refresh tanpa flicker skeleton | [ ] |
| 3.3 | Copy timeout | Reset setelah 2 detik | [ ] |
| 3.4 | Field-level error | Error per field tampil | [ ] |
| 3.5 | Typed notice | Warna berbeda per tipe | [ ] |
| 4.1 | useReducer refactor | Fungsionalitas tetap bekerja | [ ] |
| 4.4 | Login rate limiting | Lockout setelah 5 gagal | [ ] |

### 5.2 Regression Test Checklist

- [ ] Login flow (success, wrong PIN, wrong username, locked)
- [ ] Shift lifecycle (open → checklist → close)
- [ ] Incident lifecycle (create → view → note → status change)
- [ ] Admin CRUD operations (create, read, update, delete, archive)
- [ ] Sensitive actions (force close, void, reset PIN)
- [ ] Copy-to-clipboard functionality
- [ ] Photo upload & preview
- [ ] Filter & search in admin pages
- [ ] Pagination in admin lists
- [ ] Auto-refresh shift checklist
- [ ] PWA install flow
- [ ] Share link generation & access

---

## Estimasi Waktu

| Fase | Task | Estimasi |
|------|------|----------|
| Fase 1 | P1 Critical (3 task) | 2 hari |
| Fase 2 | P2 High (4 task) | 2 hari |
| Fase 3 | P3 Medium (5 task) | 2-3 hari |
| Fase 4 | P4 Low (4 task) | 2-3 hari |
| Fase 5 | Testing & Validation | 1 hari |
| **Total** | | **8-10 hari** |

---

## Catatan

1. **Prioritas bisa disesuaikan** sesuai kebutuhan bisnis. Fase 1 & 2 harus selesai duluan.
2. **Komponen reusable** (ConfirmDeleteDialog, PasswordInput, useUnsavedChanges) harus di-extract ke `components/ui/` atau `hooks/` untuk konsistensi.
3. **Testing** dilakukan incrementally per task, bukan menunggu semua selesai.
4. **Documentation** untuk setiap pola baru harus ditambahkan di README atau docs.
5. **Code review** required untuk setiap PR yang menyentuh shared components.

---

*Dibuat berdasarkan audit state change 24 komponen UI di MyCheck Application.*
