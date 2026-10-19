import type { LucideIcon } from 'lucide-react';
import { CalendarClock, ListChecks, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import type { UserRole } from '@/lib/nav-config';

export type TourStep = {
  id: string;
  title: string;
  description: string;
  selector?: string;
  path?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
};

/** Satu slide popup pengenalan komponen (muncul sebelum spotlight tour). */
export type IntroSlide = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

// Popup pengenalan komponen: 4 pilar alur kerja aplikasi. Sama untuk semua
// role, sesudahnya spotlight tour yang berbeda per role.
export const COMPONENT_INTRO_SLIDES: IntroSlide[] = [
  {
    id: 'shift',
    icon: CalendarClock,
    title: 'Shift',
    description:
      'Ritme kerja harian. Buka shift, gabung, dan kerjakan tugas kamu dari daftar shift. Semua aktivitas lain terikat di dalam shift ini.',
  },
  {
    id: 'checklist',
    icon: ListChecks,
    title: 'Checklist',
    description:
      'Daftar SOP yang harus kamu kerjakan dan centang selama shift berjalan. Bagian yang baik atau bermasalah masuk ke laporan otomatis.',
  },
  {
    id: 'incident',
    icon: AlertTriangle,
    title: 'Incident',
    description:
      'Catat kendala langsung dari laptop kasir sampai lantai dapur: apa yang terjadi, kapan, dan seberapa serius. Admin menindak dari daftar ini.',
  },
  {
    id: 'handover',
    icon: ArrowLeftRight,
    title: 'Handover',
    description:
      'Serah terima antar shift: catatan pendek dari shift sebelumnya yang wajib kamu baca sebelum mulai, jadi tidak ada informasi yang hilang.',
  },
];

const TOUR_PETUGAS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Selamat datang di MyCheck',
    description: 'Tur singkat mengikuti alur kerja kamu: shift, checklist, incident, sampai handover.',
    placement: 'center',
  },
  {
    id: 'navigation',
    title: 'Navigasi utama',
    description: 'Menu ini membawa kamu ke semua halaman yang kamu butuhkan saat bertugas.',
    selector: '[data-onboard="nav"]',
    placement: 'right',
  },
  {
    id: 'shift',
    title: 'Mulai dari daftar shift',
    description: 'Buka, gabung, atau lanjutkan shift dari daftar ini. Status tiap cabang tampil di satu tempat.',
    selector: '[data-onboard="shift-dashboard"]',
    path: '/daftar-shift',
    placement: 'top',
  },
  {
    id: 'checklist',
    title: 'Kerjakan checklist',
    description: 'Di dalam shift, buka detail shift untuk mencentang tiap poin checklist sampai selesai.',
    placement: 'center',
  },
  {
    id: 'incident',
    title: 'Laporkan kendala',
    description: 'Ada masalah? Buat incident baru langsung dari menu, admin akan menindaklanjuti.',
    path: '/incident',
    placement: 'center',
  },
  {
    id: 'handover',
    title: 'Baca handover',
    description: 'Setiap berganti shift, cek catatan handover dari shift sebelumnya di daftar shift.',
    path: '/handover',
    placement: 'center',
  },
  {
    id: 'done',
    title: 'Tur selesai',
    description: 'Kapan saja ingin melihatnya lagi, tekan tombol Tutorial di header. Panduan lengkap ada di menu Panduan.',
    placement: 'center',
  },
];

const TOUR_ADMIN: TourStep[] = [
  {
    id: 'welcome',
    title: 'Selamat datang di MyCheck',
    description: 'Tur singkat khusus admin: kelola cabang, pantau operasional, dan nilai laporan tim.',
    placement: 'center',
  },
  {
    id: 'navigation',
    title: 'Navigasi utama',
    description: 'Sebagai admin, menu ini berisi semua area operasional mulai dari shift hingga pengaturan.',
    selector: '[data-onboard="nav"]',
    placement: 'right',
  },
  {
    id: 'branch',
    title: 'Pilih cabang kerja',
    description: 'Pilih cabang aktif sebelum membuka shift atau mengelola operasional.',
    selector: '[data-onboard="cabang"]',
    placement: 'bottom',
  },
  {
    id: 'shift',
    title: 'Pantau shift',
    description: 'Buka, gabung, atau mulai shift cabang ini. Aksi admin atau petugas sama-sama dari sini.',
    selector: '[data-onboard="shift-dashboard"]',
    path: '/daftar-shift',
    placement: 'top',
  },
  {
    id: 'review',
    title: 'Arsipkan & nilai laporan',
    description: 'Setelah shift selesai, buka Laporan untuk arsipkan dan beri penilaian laporan shift.',
    path: '/admin/laporan',
    placement: 'center',
  },
  {
    id: 'scop',
    title: 'SCOP kepatuhan',
    description: 'Lacak kepatuhan SOP tiap cabang dari menu SCOP: mana yang patut, mana yang perlu ditingkatkan.',
    path: '/admin/checklist',
    placement: 'center',
  },
  {
    id: 'settings',
    title: 'Pengaturan',
    description: 'Kelola user, cabang, kategori incident, dan SOP dari menu Pengaturan.',
    path: '/admin/pengaturan',
    placement: 'center',
  },
  {
    id: 'done',
    title: 'Tur selesai',
    description: 'Kapan saja ingin melihatnya lagi, tekan tombol Tutorial di header. Panduan lengkap ada di menu Panduan.',
    placement: 'center',
  },
];

export function getTourStepsForRole(role: UserRole | undefined): TourStep[] {
  return role === 'admin' ? TOUR_ADMIN : TOUR_PETUGAS;
}

const TOUR_KEY = 'mycheck:onboarding-done:v1';
export const INTRO_KEY = 'mycheck:intro-done:v1';

function readKey(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === 'done';
  } catch {
    return false;
  }
}

export function isTourDone() {
  return readKey(TOUR_KEY);
}

export function markTourDone() {
  try {
    window.localStorage.setItem(TOUR_KEY, 'done');
  } catch {
    // Local storage may be disabled; the tour still works for this session.
  }
}

export function isIntroDone() {
  return readKey(INTRO_KEY);
}

export function markIntroDone() {
  try {
    window.localStorage.setItem(INTRO_KEY, 'done');
  } catch {
    // Local storage may be disabled; the intro still works for this session.
  }
}

/** Tandai semua bagian onboarding selesai (dipakai tombol "Lewati"). */
export function markOnboardingDone() {
  markIntroDone();
  markTourDone();
}
