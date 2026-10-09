/**
 * Export contract. Phase 8 implements rendering (off-screen at 1:1, fonts
 * and images embedded at render time only) and real browser downloads.
 */
export interface RenderedImage {
  fileName: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface Exporter {
  renderPng(node: HTMLElement, width: number, height: number, fileName: string): Promise<RenderedImage>;
  downloadFile(blob: Blob, fileName: string): void;
  downloadZip(files: RenderedImage[], fileName: string): Promise<void>;
}
