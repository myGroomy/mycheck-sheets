// lib/photo-compress.ts
// Modul kompresi gambar sisi klien ke WebP (maks 1600px, kualitas adaptif, target <= 150 KB).

export async function compressPhoto(source: File): Promise<File> {
  if (source.size > 15 * 1024 * 1024) {
    throw new Error('Foto sumber maksimal 15 MB.');
  }

  const image = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak dapat memproses foto.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  for (const quality of [0.82, 0.68, 0.54, 0.4, 0.28]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );
    if (!blob) throw new Error('Foto gagal dikompres.');
    if (blob.type !== 'image/webp') {
      throw new Error('Browser tidak mendukung kompresi foto WebP.');
    }
    if (blob.size <= 150 * 1024) {
      return new File([blob], 'bukti.webp', { type: 'image/webp' });
    }
  }

  throw new Error('Foto masih lebih dari 150 KB setelah dikompres. Pilih foto lain.');
}
