// Browser-only helpers for preparing uploads. Files travel as base64 inside a
// JSON body through a Vercel function, which caps request bodies at ~4.5 MB —
// so photos are downscaled + re-encoded here, and the total is checked before
// sending.

/** Max total raw size per request (base64 adds ~33%, leaving headroom under 4.5 MB). */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const MAX_IMAGE_DIMENSION = 2000;
const JPEG_QUALITY = 0.8;

export interface PreparedFile {
  name: string;
  type: string;
  blob: Blob;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Read failed"));
    r.readAsDataURL(blob);
  });
}

/**
 * Images are EXIF-rotated, downscaled to MAX_IMAGE_DIMENSION and re-encoded as
 * JPEG (keeping the original if that would be larger). Other files pass through.
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const original = { name: file.name, type: file.type, blob: file as Blob };
  // GIFs would lose animation; SVGs are already small.
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return original;
  }
  try {
    const processed = await processImage(file);
    return processed.blob.size < file.size ? processed : original;
  } catch {
    return original;
  }
}

async function processImage(file: File): Promise<PreparedFile> {
  const orientation = await getExifOrientation(file);
  const imgEl = await loadImage(file);
  const w = imgEl.naturalWidth;
  const h = imgEl.naturalHeight;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(w, h));
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  if (orientation >= 5 && orientation <= 8) { canvas.width = sh; canvas.height = sw; }
  else { canvas.width = sw; canvas.height = sh; }
  applyExifTransform(ctx, orientation, sw, sh);
  ctx.drawImage(imgEl, 0, 0, sw, sh);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode failed"))), "image/jpeg", JPEG_QUALITY)
  );
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return { name: baseName + ".jpg", type: "image/jpeg", blob };
}

function getExifOrientation(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target!.result as ArrayBuffer);
        if (view.getUint16(0, false) !== 0xffd8) return resolve(1);
        let offset = 2;
        while (offset < view.byteLength) {
          const marker = view.getUint16(offset, false); offset += 2;
          if (marker === 0xffe1) {
            if (view.getUint32((offset += 2), false) !== 0x45786966) return resolve(1);
            const little = view.getUint16((offset += 6), false) === 0x4949;
            offset += view.getUint32(offset + 4, little);
            const tags = view.getUint16(offset, little); offset += 2;
            for (let i = 0; i < tags; i++) {
              if (view.getUint16(offset + i * 12, little) === 0x0112) {
                return resolve(view.getUint16(offset + i * 12 + 8, little));
              }
            }
          } else if ((marker & 0xff00) !== 0xff00) { break; }
          else { offset += view.getUint16(offset, false); }
        }
        resolve(1);
      } catch { resolve(1); }
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file.slice(0, 131072));
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

function applyExifTransform(ctx: CanvasRenderingContext2D, orientation: number, w: number, h: number) {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
  }
}
