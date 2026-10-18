import type { UserRole } from '@/lib/nav-config';

export type TourStep = {
  id: string;
  title: string;
  description: string;
  selector?: string;
  path?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  roles?: UserRole[];
};

const STORAGE_KEY = 'mycheck:onboarding-done:v1';

export const ONBOARDING_TOUR: TourStep[] = [
  {
    id: 'welcome',
    title: 'Selamat datang di MyCheck',
    description: 'Ikuti tur singkat ini untuk mengenal navigasi dan alur kerja utama aplikasi.',
    placement: 'center',
  },
  {
    id: 'navigation',
    title: 'Navigasi utama',
    description: 'Gunakan menu ini untuk berpindah antar shift, laporan, incident, dan pengaturan.',
    selector: '[data-onboard="nav"]',
    placement: 'right',
  },
  {
    id: 'branch',
    title: 'Ganti cabang kerja',
    description: 'Admin dapat memilih cabang aktif sebelum membuka shift atau mengelola operasional.',
    selector: '[data-onboard="cabang"]',
    placement: 'bottom',
    roles: ['admin'],
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
    id: 'done',
    title: 'Tur selesai',
    description: 'Kapan saja ingin melihatnya lagi, tekan tombol Tutorial di header.',
    placement: 'center',
  },
];

export function getTourStepsForRole(role: UserRole | undefined) {
  return ONBOARDING_TOUR.filter((step) => !step.roles || (role && step.roles.includes(role)));
}

export function isTourDone() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'done';
  } catch {
    return false;
  }
}

export function markTourDone() {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'done');
  } catch {
    // Local storage may be disabled; the tour still works for this session.
  }
}

