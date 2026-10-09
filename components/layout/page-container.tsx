import { cn } from '@/lib/utils';

/**
 * PageContainer — pembungkus konten halaman dengan spacing responsif yang
 * KONSISTEN di semua device. Menggantikan pola `<main className="mx-auto
 * max-w-* p-4 ...">` yang selama ini berbeda-beda tiap halaman.
 *
 * Skala padding horizontal (biar tidak mepet ke tepi layar):
 *   mobile  : px-4  (16px)
 *   sm (≥640): px-6  (24px)
 *   lg (≥1024): px-8 (32px)
 *   xl (≥1280): px-10 (40px)
 *
 * Padding bawah lega (pb) untuk memberi ruang bagi bottom-nav mobile.
 *
 * Props:
 *   - width : batas lebar konten (default '6xl'). Contoh: 'prose', '3xl', '5xl'.
 *   - as    : elemen HTML (default 'main').
 *   - bleed : true → lebar penuh (tanpa max-width), tetap ber-padding horizontal.
 */
export type PageContainerWidth =
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl'
  | 'full';

const WIDTH_CLASS: Record<PageContainerWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

export interface PageContainerProps extends React.HTMLAttributes<HTMLElement> {
  width?: PageContainerWidth;
  as?: 'main' | 'div' | 'section';
  bleed?: boolean;
}

export function PageContainer({
  width = '6xl',
  as: Tag = 'main',
  bleed = false,
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <Tag
      className={cn(
        'mx-auto w-full',
        // Padding horizontal responsif — mencegah konten mepet tepi layar
        'px-4 sm:px-6 lg:px-8 xl:px-10',
        // Padding vertikal
        'py-4 sm:py-6',
        // Ruang bawah untuk bottom-nav mobile (h-16 + safe area)
        'pb-24 md:pb-10',
        // Batas lebar (kecuali bleed)
        !bleed && WIDTH_CLASS[width],
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
