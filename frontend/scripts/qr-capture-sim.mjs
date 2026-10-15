// Print + phone-camera simulation for QR decode tests (scripts/serial-card-qr-offline.test.mjs).
// A model, not a real device: printer dot grid, then a camera frame (resample, rotation, blur, faded ink, noise).
import jsQRmod from "jsqr";
import * as ZX from "@zxing/library";
const jsQR = jsQRmod.default ?? jsQRmod;
/** The QR as a printer prints it: `dpi`, `mm` wide incl. 4-module quiet zone; each dot takes the module it falls in (uneven module widths, like a real driver). */
export function printRaster(matrix, dpi, mm) {
  const total = matrix.size + 8;
  const dots = Math.round((mm / 25.4) * dpi);
  const px = new Uint8Array(dots * dots);
  for (let y = 0; y < dots; y++) {
    const r = Math.floor((y * total) / dots) - 4;
    for (let x = 0; x < dots; x++) {
      const c = Math.floor((x * total) / dots) - 4;
      px[y * dots + x] = r >= 0 && c >= 0 && r < matrix.size && c < matrix.size && matrix.isDark(r, c) ? 1 : 0;
    }
  }
  return { px, dots };
}
let seed = 1;
// 32-bit LCG via Math.imul (a plain multiply overflows 2^53 and degenerates into salt-and-pepper noise).
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x80000000);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
/** A camera frame: the printed QR `qrPx` pixels wide in a frame with margin, rotated `deg`, 3x3 supersampled, blurred (sigma px), faded ink and noise. */
export function cameraFrame(print, { qrPx, deg = 0, blur = 0, noise = 0, black = 0, white = 255 }) {
  const W = Math.round(qrPx * 1.3);
  const lum = new Float32Array(W * W);
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), half = W / 2, scale = print.dots / qrPx;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let ink = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const dx = x + (sx + 0.5) / 3 - half, dy = y + (sy + 0.5) / 3 - half;
      const u = (cos * dx + sin * dy) * scale + print.dots / 2, v = (-sin * dx + cos * dy) * scale + print.dots / 2;
      const iu = Math.floor(u), iv = Math.floor(v);
      if (iu >= 0 && iv >= 0 && iu < print.dots && iv < print.dots) ink += print.px[iv * print.dots + iu];
    }
    lum[y * W + x] = white - (white - black) * (ink / 9);
  }
  let img = lum;
  if (blur > 0) {
    const k = [], r = Math.ceil(blur * 3);
    let s = 0;
    for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * blur * blur)); k.push(w); s += w; }
    const kn = k.map((w) => w / s);
    const pass = (src, horiz) => {
      const out = new Float32Array(W * W);
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) {
          const xx = horiz ? Math.min(W - 1, Math.max(0, x + i)) : x, yy = horiz ? y : Math.min(W - 1, Math.max(0, y + i));
          acc += src[yy * W + xx] * kn[i + r];
        }
        out[y * W + x] = acc;
      }
      return out;
    };
    img = pass(pass(img, true), false);
  }
  const gray = new Uint8ClampedArray(W * W);
  for (let i = 0; i < gray.length; i++) gray[i] = img[i] + (noise ? gauss() * noise : 0);
  return { gray, W };
}
// ── Phone at a distance ─────────────────────────────────────────────────────────────────────
// A scanner preview of 1920 x 1080 px with a ~66 degree horizontal field of view: the frame is
// ~1.3 x the distance wide. A physically bigger QR therefore covers more camera pixels at the
// same distance. Assumptions of this model, not measurements of a particular phone.
export const CAMERA_PX = 1920;
export const pxPerMmAt = (distanceMm) => CAMERA_PX / (1.3 * distanceMm);
/** Nearest distance (mm) at which the whole QR (+15% margin) fits the frame's short side. */
export const minFitDistance = (qrMm) => Math.ceil((qrMm * 1.15) / ((1080 / 1920) * 1.3));
const BURST = [{}, { deg: 2, k: 1.05 }, { deg: -3, k: 0.95 }, { deg: 9, k: 1.1 }, { deg: 0, k: 0.9 }];
/** A live scan at `distanceMm`: up to 5 frames (small hand movements); 1-based frame that decoded to `text`, or 0. */
export function scanAtDistance(print, qrMm, distanceMm, text, { blur = 1.0, deg = 6 } = {}) {
  const qrPx = qrMm * pxPerMmAt(distanceMm);
  for (let i = 0; i < BURST.length; i++) {
    const b = BURST[i];
    const frame = cameraFrame(print, { qrPx: Math.round(qrPx * (b.k ?? 1)), deg: b.deg ?? deg, blur, noise: 3, black: 35, white: 225 });
    if (decodeJsQR(frame) === text) return i + 1;
  }
  return 0;
}

export function decodeJsQR({ gray, W }) {
  const rgba = new Uint8ClampedArray(W * W * 4);
  for (let i = 0; i < gray.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray[i]; rgba[i * 4 + 3] = 255; }
  return jsQR(rgba, W, W, { inversionAttempts: "dontInvert" })?.data ?? null;
}
/** ZXing on an ideal render (4 px per module, PURE_BARCODE): an independent second decoder for
 *  the encoded content (bytes, UTF-8, mode). @zxing/library's finder-pattern search misses larger
 *  codes even in clean synthetic images (fails on a clean v13 at 6 px/module), and PURE_BARCODE
 *  assumes equal module widths, which a 203/300 dpi print does not have — so print and camera
 *  robustness is jsQR's job (cameraFrame above), not ZXing's. */
export function decodeZXingIdeal(matrix, ppm = 4) {
  const W = (matrix.size + 8) * ppm;
  const gray = new Uint8ClampedArray(W * W).fill(255);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const r = Math.floor(y / ppm) - 4, c = Math.floor(x / ppm) - 4;
    if (r >= 0 && c >= 0 && r < matrix.size && c < matrix.size && matrix.isDark(r, c)) gray[y * W + x] = 0;
  }
  try {
    const hints = new Map([[ZX.DecodeHintType.PURE_BARCODE, true]]);
    return new ZX.QRCodeReader().decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(gray, W, W))), hints).getText();
  } catch {
    return null;
  }
}
