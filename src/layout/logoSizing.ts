/**
 * Optical logo sizing. Logos of different shapes look evenly weighted when
 * they cover roughly the same AREA, not the same height or width. A square
 * mark gets `base × base`; a wide wordmark gets a shorter, wider box; a tall
 * mark a narrower, taller one. Clamps stop extreme shapes from becoming
 * slivers or towers.
 */

export interface LogoBox {
  width: number;
  height: number;
}

export interface LogoSizingOptions {
  /** Side of a square logo, in canvas units. */
  base: number;
  /** Smallest height, as a share of base. */
  minHeight?: number;
  /** Largest width, as a multiple of base. */
  maxWidth?: number;
  /** Largest height, as a multiple of base. */
  maxHeight?: number;
}

export function opticalLogoBox(naturalWidth: number, naturalHeight: number, o: LogoSizingOptions): LogoBox {
  const aspect = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
  const minH = (o.minHeight ?? 0.32) * o.base;
  const maxW = (o.maxWidth ?? 3.2) * o.base;
  const maxH = (o.maxHeight ?? 1.25) * o.base;
  let height = o.base / Math.sqrt(aspect);
  height = Math.min(maxH, Math.max(minH, height));
  let width = height * aspect;
  if (width > maxW) {
    width = maxW;
    height = width / aspect;
  }
  return { width: round(width), height: round(height) };
}

/**
 * Logo rows get slightly smaller as more partners join, so a full row of
 * SIS + 4 partners usually still fits on one line. Never below 70%.
 */
export function logoRowScale(partnerCount: number): number {
  return [1, 1, 0.92, 0.84, 0.76][Math.min(partnerCount, 4)] ?? 0.76;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
