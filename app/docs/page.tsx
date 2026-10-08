'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CircleHelp, Menu, ArrowUp } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const sections = [
  { href: '#mulai', label: 'Mulai menggunakan aplikasi' },
  { href: '#shift', label: 'Beranda dan shift' },
  { href: '#checklist', label: 'Mengerjakan checklist' },
  { href: '#tutup-shift', label: 'Menutup shift' },
  { href: '#incident', label: 'Incident' },
  { href: '#laporan', label: 'Laporan' },
  { href: '#admin', label: 'Fitur admin' },
  { href: '#bantuan', label: 'Pemecahan masalah' },
];

function TableOfContents() {
  return (
    <nav aria-label="Daftar isi panduan" className="flex flex-col gap-1">
      {sections.map((section) => (
        <a
          key={section.href}
          href={section.href}
          className="flex min-h-12 items-center rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}

function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-lg transition hover:bg-canvas md:bottom-8 md:right-8"
      aria-label="Kembali ke atas"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 md:px-6 lg:max-w-6xl xl:max-w-7xl">
          <Link href="/" className="text-sm font-bold tracking-tight sm:text-base">
            checklist-shift
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-semibold text-canvas transition hover:opacity-90 sm:px-4"
            >
              Masuk <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Sheet>
              <SheetTrigger asChild>
                <button
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-ink transition hover:bg-canvas md:hidden"
                  aria-label="Buka daftar isi"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 sm:max-w-sm">
                <SheetHeader>
                  <SheetTitle className="text-left">Isi panduan</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <TableOfContents />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 md:grid-cols-[220px_minmax(0,1fr)] md:py-12 lg:max-w-6xl xl:max-w-7xl">
        <aside className="hidden h-fit rounded-xl border border-border bg-surface p-4 md:sticky md:top-24 md:block">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Isi panduan
          </p>
          <TableOfContents />
        </aside>

        <article className="min-w-0">
          <div className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:mb-8 sm:p-6 md:p-8 lg:p-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-ink-muted">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              PANDUAN PENGGUNA
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
              Panduan checklist-shift
            </h1>
            <p className="mt-3 max-w-2xl leading-6 text-ink-muted sm:mt-4 sm:leading-7">
              Panduan singkat untuk petugas dan admin dalam menggunakan aplikasi
              checklist operasional shift F&amp;B.
            </p>
          </div>

          <section id="mulai" className="scroll-mt-24 rounded-xl border border-border bg-surface p-4 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg font-bold sm:text-xl md:text-2xl">Mulai menggunakan aplikasi</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 leading-6 text-ink-muted sm:mt-4 sm:leading-7">
              <li>Buka alamat aplikasi yang diberikan admin.</li>
              <li>Pilih <strong className="text-ink">Masuk</strong>, lalu isi username dan PIN 6 digit.</li>
              <li>
                Jika akun terkunci, nonaktif, atau PIN tidak dikenali, hubungi
                admin untuk bantuan.
              </li>
              <li>
                Di HP, gunakan navigasi bawah. Di desktop, buka menu ☰ pada
                header untuk berpindah halaman.
              </li>
            </ol>
            <p className="mt-3 rounded-lg bg-canvas p-3 text-sm leading-6 text-ink-muted sm:mt-4 sm:p-4">
              Jangan bagikan PIN kepada orang lain. PIN juga dipakai PJ untuk
              mengonfirmasi penutupan shift.
            </p>
          </section>

          <section id="shift" className="mt-4 scroll-mt-24 rounded-xl border border-border bg-surface p-4 sm:mt-5 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg font-bold sm:text-xl md:text-2xl">Beranda dan shift</h2>
            <p className="mt-2 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              Beranda menampilkan cabang yang dapat diakses dan shift yang
              tersedia. Jika akun memiliki akses ke beberapa cabang, pastikan
              memilih cabang yang benar.
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              <li><strong className="text-ink">Buka Shift</strong> memulai shift baru; petugas yang membukanya menjadi PJ.</li>
              <li><strong className="text-ink">Gabung</strong> atau <strong className="text-ink">Check-in</strong> digunakan untuk bergabung ke shift berjalan.</li>
              <li><strong className="text-ink">Lanjutkan</strong> membuka checklist shift yang sudah diikuti.</li>
            </ul>
            <p className="mt-2 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              Checklist dipakai bersama oleh peserta shift, bukan salinan
              terpisah untuk setiap petugas.
            </p>
          </section>

          <section id="checklist" className="mt-4 scroll-mt-24 rounded-xl border border-border bg-surface p-4 sm:mt-5 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg font-bold sm:text-xl md:text-2xl">Mengerjakan checklist</h2>
            <p className="mt-2 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              Ikuti instruksi setiap item dan isi sesuai pekerjaan yang benar-benar
              dilakukan. Tergantung itemnya, aplikasi dapat meminta centang,
              jawaban, angka, teks, atau foto.
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              <li>Riwayat mencatat petugas dan waktu pengerjaan.</li>
              <li>Jika item tidak dapat dikerjakan, gunakan <strong className="text-ink">Skip</strong> dan tuliskan alasan yang jelas.</li>
              <li>Item yang sudah dikerjakan rekan akan menunjukkan siapa yang menyelesaikannya.</li>
              <li>Aksi checklist memerlukan koneksi internet; periksa pesan aplikasi jika penyimpanan gagal.</li>
            </ul>
          </section>

          <section id="tutup-shift" className="mt-4 scroll-mt-24 rounded-xl border border-border bg-surface p-4 sm:mt-5 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg font-bold sm:text-xl md:text-2xl">Menutup shift (khusus PJ)</h2>
            <p className="mt-2 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              Sebelum shift ditutup, semua item wajib harus selesai atau di-skip
              dengan alasan dan semua isian handover wajib harus dilengkapi.
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              <li>Tinjau item checklist yang belum memenuhi syarat.</li>
              <li>Isi handover untuk shift berikutnya.</li>
              <li>
                Konfirmasikan penutupan dengan <strong className="text-ink">PIN akun PJ sendiri</strong>—PIN yang sama dengan PIN login,
                bukan PIN baru atau PIN admin lain.
              </li>
            </ol>
            <p className="mt-3 rounded-lg bg-canvas p-3 text-sm leading-6 text-ink-muted sm:mt-4 sm:p-4">
              Setelah berhasil ditutup, shift dan checklist dikunci serta laporan
              dibuat. Koreksi laporan dilakukan melalui addendum admin.
            </p>
          </section>

          <section id="incident" className="mt-4 scroll-mt-24 rounded-xl border border-border bg-surface p-4 sm:mt-5 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg font-bold sm:text-xl md:text-2xl">Incident</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              <li>Buka menu <strong className="text-ink">Incident</strong> untuk melihat kejadian yang tercatat.</li>
              <li>Pilih <strong className="text-ink">Buat Incident</strong>, lalu isi cabang, kategori, waktu kejadian, dan deskripsi.</li>
              <li>Foto bukti opsional; unggahan dibatasi hingga lima foto dan maksimal 5 MB per foto.</li>
              <li>Isi incident yang dikirim tidak dapat diedit. Informasi lanjutan dicatat sebagai catatan tambahan.</li>
            </ul>
          </section>

          <section id="laporan" className="mt-4 scroll-mt-24 rounded-xl border border-border bg-surface p-4 sm:mt-5 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg font-bold sm:text-xl md:text-2xl">Laporan</h2>
            <p className="mt-2 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              Menu <strong className="text-ink">Laporan</strong> menampilkan
              laporan shift dari cabang yang dapat diakses. Laporan merangkum
              checklist, handover, incident, dan peserta. Tautan laporan publik
              hanya bisa dibaca dan dapat kedaluwarsa atau dicabut oleh admin.
            </p>
          </section>

          <section id="admin" className="mt-4 scroll-mt-24 rounded-xl border border-border bg-surface p-4 sm:mt-5 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg font-bold sm:text-xl md:text-2xl">Fitur admin</h2>
            <p className="mt-2 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              Admin mengelola cabang, akun dan akses cabang, definisi shift,
              template checklist, field handover, kategori incident, pengaturan,
              laporan, serta audit log. Akun dapat memiliki akses ke lebih dari
              satu cabang.
            </p>
            <p className="mt-2 leading-6 text-ink-muted sm:mt-3 sm:leading-7">
              Perubahan template berlaku untuk shift baru, bukan shift yang
              sedang berjalan. Tindakan admin sensitif dapat meminta alasan dan
              konfirmasi PIN.
            </p>
          </section>

          <section id="bantuan" className="mt-4 scroll-mt-24 rounded-xl border border-border bg-surface p-4 sm:mt-5 sm:p-5 md:p-6 lg:p-8">
            <div className="flex items-center gap-2">
              <CircleHelp className="h-5 w-5" aria-hidden="true" />
              <h2 className="text-lg font-bold sm:text-xl md:text-2xl">Pemecahan masalah</h2>
            </div>
            <dl className="mt-3 divide-y divide-border sm:mt-4">
              <div className="py-3">
                <dt className="font-semibold">PIN salah atau akun terkunci</dt>
                <dd className="mt-1 leading-6 text-ink-muted">Pastikan username dan PIN benar. Jika akun terkunci, hubungi admin.</dd>
              </div>
              <div className="py-3">
                <dt className="font-semibold">Cabang atau shift tidak tersedia</dt>
                <dd className="mt-1 leading-6 text-ink-muted">Pastikan cabang yang dipilih benar dan minta admin memeriksa akses akun.</dd>
              </div>
              <div className="py-3">
                <dt className="font-semibold">Shift tidak dapat ditutup</dt>
                <dd className="mt-1 leading-6 text-ink-muted">Selesaikan item wajib atau gunakan Skip dengan alasan, lengkapi handover, lalu gunakan PIN PJ.</dd>
              </div>
              <div className="py-3">
                <dt className="font-semibold">Perubahan tidak tersimpan</dt>
                <dd className="mt-1 leading-6 text-ink-muted">Periksa koneksi internet. Jangan anggap aksi berhasil jika aplikasi menampilkan pesan gagal.</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm leading-6 text-ink-muted sm:mt-3">
              Saat melaporkan masalah, sertakan perangkat, browser, halaman,
              langkah reproduksi, dan waktu kejadian. Jangan kirim PIN atau
              tangkapan layar yang menampilkan informasi rahasia.
            </p>
          </section>

          <p className="mt-4 text-center text-sm text-ink-muted sm:mt-6">
            Perlu mulai bekerja?{' '}
            <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
              Masuk ke aplikasi
            </Link>
            .
          </p>
        </article>
      </div>

      <BackToTop />
    </main>
  );
}
