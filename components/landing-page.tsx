import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Layers3,
  Smartphone,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

const steps = [
  { number: '1', title: 'Buka shift & tim', description: 'Penanggung jawab membuka shift, memilih cabang, lalu tim bergabung dalam alur yang sama.' },
  { number: '2', title: 'Kerjakan checklist', description: 'Selesaikan SOP bersama dengan draft otomatis, validasi, waktu, dan bukti foto yang tercatat.' },
  { number: '3', title: 'Tutup & serah terima', description: 'Isi handover, catat incident bila perlu, tutup shift, lalu tinjau laporan yang terkunci.' },
];

const checklistPreview = [
  ['Cek kebersihan area service', true],
  ['Pastikan perlengkapan lengkap', true],
  ['Periksa suhu chiller', true],
  ['Siapkan area kasir', false],
] as const;

export function LandingPage() {
  return (
    <main className="w-full max-w-full overflow-x-hidden bg-[#f7f6f2] text-[#292524] grayscale">
      <section className="relative mx-auto max-w-7xl px-5 pb-8 pt-20 sm:px-8 md:px-12 lg:px-24 lg:pt-28">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <p className="text-sm font-bold uppercase leading-normal text-[#64836c]">Sistem Operasional Shift Multi Cabang</p>
          <h1 className="mt-4 text-[clamp(2.2rem,5vw,3.8rem)] font-semibold leading-[1.12] tracking-[-0.04em]">Shift lebih rapi,<br /><span className="text-[#718b72]">operasional lebih tenang.</span></h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium leading-7 text-[#706a63]">Satu alur untuk checklist SOP, serah terima, incident, dan laporan shift. Terisolasi per cabang, tercatat, dan nyaman dipakai dari ponsel.</p>
          <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="inline-flex h-11 items-center justify-center rounded-lg bg-[#64836c] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#52705a] focus:outline-none focus:ring-2 focus:ring-[#64836c]/40">Mulai gunakan MyCheck <ArrowRight className="ml-2 h-4 w-4" /></Link>
            <Link href="/docs" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#e7ebe3] px-6 text-sm font-semibold text-[#52705a] transition hover:bg-[#dce5da] focus:outline-none focus:ring-2 focus:ring-[#64836c]/30"><BookOpen className="h-4 w-4" /> Panduan penggunaan</Link>
            <a href="#fitur" className="inline-flex h-11 items-center justify-center rounded-lg border border-[#d7d3cc] bg-white/60 px-6 text-sm font-medium text-[#625c55] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#64836c]/30">Lihat fitur</a>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-5xl py-12"><div className="rounded-2xl bg-[#e7ebe3] p-4 sm:p-8"><div className="overflow-hidden rounded-xl border border-[#dedfd8] bg-white shadow-2xl ring-4 ring-white/70">
          <div className="flex items-center gap-2 border-b border-[#e3e0d9] bg-[#f1f2ee] px-4 py-3"><div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#c9877f]/70" /><span className="h-2.5 w-2.5 rounded-full bg-[#c9a85c]/70" /><span className="h-2.5 w-2.5 rounded-full bg-[#718b72]/80" /></div><div className="flex-1 text-center"><span className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-xs font-medium text-[#89837b]"><ClipboardCheck className="h-3 w-3" /> mycheck.app/shift</span></div></div>
          <div className="space-y-4 p-4 sm:p-6"><div className="grid grid-cols-3 gap-3"><div className="rounded-lg border border-[#d9e4d9] bg-[#edf4ed] p-3"><div className="text-xs font-medium text-[#77716b]">Progress</div><div className="mt-1 text-lg font-bold text-[#52705a]">12/18</div></div><div className="rounded-lg border border-[#e8e5df] bg-[#fbfaf8] p-3"><div className="text-xs font-medium text-[#77716b]">Tim aktif</div><div className="mt-1 text-lg font-bold text-[#292524]">3</div></div><div className="rounded-lg border border-[#eadfcf] bg-[#f8f1e6] p-3"><div className="text-xs font-medium text-[#77716b]">Incident</div><div className="mt-1 text-lg font-bold text-[#866e4f]">1</div></div></div><div className="flex items-end justify-between gap-4"><div><p className="text-xs text-[#89837b]">Cabang Setiabudi · Hari ini</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Shift Pagi</h2></div><span className="rounded-full bg-[#edf4ed] px-3 py-1 text-xs font-semibold text-[#52705a]">BERJALAN</span></div><div className="h-2 overflow-hidden rounded-full bg-[#e9e6df]"><div className="h-full w-2/3 rounded-full bg-[#718b72]" /></div><div className="rounded-2xl border border-[#e8e5df] bg-[#fbfaf8] p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold">Persiapan area</p><p className="mt-0.5 text-2xs text-[#89837b]">4 dari 5 tugas selesai</p></div><span className="rounded-lg bg-[#edf4ed] px-2.5 py-1 text-2xs font-semibold text-[#52705a]">4/5</span></div><div className="space-y-2.5">{checklistPreview.map(([label, done]) => <div key={label} className="flex items-center gap-2.5 text-xs text-[#625c55]"><span className={`flex h-4 w-4 items-center justify-center rounded-full border ${done ? 'border-[#718b72] bg-[#718b72] text-white' : 'border-[#d7d3cc]'}`}>{done ? <Check className="h-2.5 w-2.5" /> : null}</span><span className={done ? 'text-[#89837b]' : ''}>{label}</span></div>)}</div></div></div>
          <div className="flex items-center justify-between border-t border-[#e8e5df] bg-[#fbfaf8] px-5 py-3.5"><span className="text-2xs text-[#89837b]">Progress tersimpan otomatis</span><span className="inline-flex items-center gap-1.5 text-2xs font-semibold text-[#52705a]"><span className="h-1.5 w-1.5 rounded-full bg-[#718b72]" /> Draft tersinkron</span></div>
        </div></div></div>
      </section>

      <section className="overflow-hidden py-16"><div className="relative px-8"><div className="absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#f7f6f2] to-transparent" /><div className="absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#f7f6f2] to-transparent" /><div className="flex animate-marquee items-center gap-2 whitespace-nowrap">{['Checklist SOP', 'Handover Shift', 'Incident Tracking', 'Laporan Otomatis', 'Multi Cabang', 'Draft Autosave', 'Bukti Foto', 'Audit Trail', 'Mobile Friendly', 'Checklist SOP', 'Handover Shift', 'Incident Tracking', 'Laporan Otomatis', 'Multi Cabang', 'Draft Autosave'].map((tag, index) => <span key={`${tag}-${index}`} className="inline-flex shrink-0 items-center rounded-lg bg-[#eeeee8] px-4 py-1.5 text-sm font-medium text-[#625c55]">{tag}</span>)}</div></div></section>

      <section id="fitur" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:px-12 lg:px-24"><div className="mx-auto mb-14 max-w-2xl text-center"><p className="text-sm font-bold uppercase leading-normal text-[#64836c]">Fitur Utama</p><h2 className="mt-4 text-xl font-semibold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-4xl">Semua yang dibutuhkan untuk operasional shift modern</h2><p className="mt-4 text-base font-medium leading-normal text-[#706a63]">Dari buka shift sampai laporan, setiap langkah berada dalam satu sistem yang jelas.</p></div><div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureWide icon={ClipboardCheck} title="Checklist SOP yang terukur" text="Petugas mengerjakan checklist dengan status, validasi input, waktu, foto, dan draft otomatis sehingga tidak ada pekerjaan yang hilang saat berpindah halaman." /><FeatureTall /><FeatureSmall icon={BarChart3} title="Dashboard operasional" text="Pantau shift, progres, incident, dan kondisi cabang dari satu panel." /><FeatureSmall icon={ShieldCheck} title="Akses aman per cabang" text="Otorisasi berbasis role dan akses cabang menjaga data tetap terisolasi." /><FeatureWide icon={UsersRound} title="Kolaborasi tim tanpa duplikasi" text="Seluruh anggota shift melihat progres yang sama dan dapat meneruskan pekerjaan tanpa bergantung pada chat pribadi." />
      </div></section>

      <section className="bg-[#64836c] py-20 text-white"><div className="mx-auto max-w-7xl px-5 sm:px-8 md:px-12 lg:px-24"><div className="mb-14 text-center"><p className="text-sm font-bold uppercase leading-normal text-white/80">Cara Kerja</p><h2 className="mt-4 text-xl font-semibold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-4xl">Tiga langkah menuju shift yang lebih terkendali</h2><p className="mx-auto mt-4 max-w-xl text-lg text-white/80">Proses sederhana, catatan yang lengkap, dan handover yang tidak terlewat.</p></div><div className="relative grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-10 lg:divide-x lg:divide-dashed lg:divide-white/20">{steps.map((step) => <div key={step.number} className="relative z-10 pb-10 pt-6 text-center last:pb-0 md:text-left lg:py-0 lg:pe-10 last:lg:pe-0"><div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 font-bold md:mx-0">{step.number}</div><h3 className="mb-2 text-xl font-semibold">{step.title}</h3><p className="text-base text-white/80">{step.description}</p></div>)}</div></div></section>

      <section className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 md:px-12 lg:px-24"><div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-3"><div className="lg:order-last"><p className="text-sm font-bold uppercase leading-normal text-[#64836c]">Mengapa MyCheck</p><h2 className="mt-4 text-xl font-semibold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-4xl">Dibuat untuk tim outlet yang perlu bergerak cepat</h2><p className="mt-4 text-base font-medium leading-normal text-[#706a63]">MyCheck menjaga pekerjaan tetap praktis bagi petugas dan tetap terlihat bagi admin.</p><div className="mx-auto mt-10 flex flex-wrap items-center gap-2"><Link href="/login" className="inline-flex h-10 items-center justify-center rounded-lg bg-[#64836c] px-6 text-sm font-semibold text-white transition hover:bg-[#52705a]">Mulai sekarang</Link><a href="#fitur" className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d7d3cc] bg-white px-6 text-sm font-medium text-[#625c55] transition hover:bg-[#eeeee8]">Pelajari fitur</a></div></div><div className="lg:col-span-2"><div className="grid grid-cols-2 gap-x-6 gap-y-12 text-center">{[{ icon: ClipboardCheck, title: 'Input terarah', desc: 'Form ringkas dengan validasi dan status yang jelas.' }, { icon: FileCheck2, title: 'Catatan lengkap', desc: 'Setiap aksi memiliki jejak waktu dan pengguna.' }, { icon: Smartphone, title: 'Mobile first', desc: 'Nyaman dipakai petugas langsung dari ponsel.' }, { icon: Layers3, title: 'Satu sumber data', desc: 'Checklist, handover, incident, dan laporan saling terhubung.' }].map((item) => <div key={item.title}><div className="flex flex-col gap-3 text-[#64836c]"><item.icon className="mx-auto h-5 w-5" /><h3 className="text-base font-medium leading-normal sm:text-lg md:text-xl">{item.title}</h3></div><p className="mt-2 text-base font-medium leading-normal text-[#706a63]">{item.desc}</p></div>)}</div></div></div></section>

      <section className="bg-[#e7ebe3]"><div className="mx-auto max-w-7xl px-5 py-24 text-center sm:px-8 md:px-12 lg:px-24"><h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl md:text-4xl">Siap membuat shift lebih teratur?</h2><p className="mx-auto mt-4 max-w-lg text-base font-medium leading-normal text-[#706a63]">Mulai gunakan MyCheck untuk menjaga SOP, handover, dan laporan tetap berada di jalurnya.</p><div className="mt-10 flex flex-wrap items-center justify-center gap-3"><Link href="/login" className="inline-flex h-11 items-center justify-center rounded-lg bg-[#64836c] px-8 text-sm font-semibold text-white transition hover:bg-[#52705a]">Mulai sekarang <ChevronRight className="ml-1 h-4 w-4" /></Link><Link href="/docs" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#cbd4c8] bg-white/60 px-8 text-sm font-medium text-[#52705a] transition hover:bg-white"><BookOpen className="h-4 w-4" /> Baca dokumentasi</Link></div></div></section>

      <footer className="border-t border-[#e3e0d9] bg-[#f7f6f2]"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 py-12 sm:px-8 md:flex-row md:px-12 lg:px-24"><Link href="/" className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#292524] text-white"><Check className="h-4 w-4" /></span><span className="text-sm font-semibold">MyCheck</span></Link><div className="flex items-center gap-6 text-sm text-[#89837b]"><Link href="/login" className="transition hover:text-[#292524]">Masuk</Link><a href="#fitur" className="transition hover:text-[#292524]">Fitur</a><Link href="/docs" className="transition hover:text-[#292524]">Dokumentasi</Link></div><p className="text-xs text-[#89837b]">© {new Date().getFullYear()} MyCheck. Operasional shift yang jelas.</p></div></footer>
    </main>
  );
}

function FeatureWide({ icon: Icon, title, text }: { icon: typeof ClipboardCheck; title: string; text: string }) {
  return <div className="rounded-2xl border border-[#e3e0d9] bg-white/70 p-8 transition-transform duration-300 hover:scale-[1.01] sm:col-span-2"><div className="flex items-start gap-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e7ebe3]"><Icon className="h-6 w-6 text-[#64836c]" /></div><div><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-[#706a63]">{text}</p></div></div></div>;
}

function FeatureTall() {
  return <div className="row-span-2 rounded-2xl bg-[#64836c] p-8 text-white transition-transform duration-300 hover:scale-[1.01]"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20"><FileText className="h-6 w-6" /></div><h3 className="text-lg font-semibold">Laporan shift siap ditinjau</h3><p className="mt-2 text-sm leading-relaxed opacity-90">Checklist, incident, handover, dan bukti aktivitas dirangkum dalam laporan yang konsisten dan mudah dibagikan.</p><div className="mt-6 space-y-2">{['Progress real-time', 'Handover antar shift', 'Audit trail lengkap'].map((item) => <div key={item} className="flex items-center gap-2 text-sm opacity-90"><span className="h-1.5 w-1.5 rounded-full bg-white/60" />{item}</div>)}</div></div>;
}

function FeatureSmall({ icon: Icon, title, text }: { icon: typeof BarChart3; title: string; text: string }) {
  return <div className="rounded-2xl border border-[#e3e0d9] bg-white/70 p-6 transition-transform duration-300 hover:scale-[1.01]"><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#e7ebe3]"><Icon className="h-5 w-5 text-[#64836c]" /></div><h3 className="text-base font-semibold">{title}</h3><p className="mt-2 text-sm text-[#706a63]">{text}</p></div>;
}
