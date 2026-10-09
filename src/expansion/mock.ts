import type { ExpansionRequest, ExpansionResult, ExpansionService } from "./types";

/**
 * DEVELOPMENT ONLY stand-in for the AI provider (VITE_IMAGE_EXPANSION=mock),
 * so the whole flow can be tried without a paid call. It is NOT outpainting:
 * the new area is a flat edge-colour field, plainly striped and labelled
 * "MOCK", so it can never be mistaken for real generated background.
 */
export class MockExpansionService implements ExpansionService {
  constructor(private readonly delayMs = 1200) {}

  async expand(req: ExpansionRequest): Promise<ExpansionResult> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    const bmp = await createImageBitmap(req.image);
    const c = document.createElement("canvas");
    c.width = req.outputWidth;
    c.height = req.outputHeight;
    const g = c.getContext("2d")!;
    g.fillStyle = "#3A2E2C";
    g.fillRect(0, 0, c.width, c.height);
    const x = req.left;
    const y = req.up;
    // Edge colour fields (each side from the photo's outermost column/row).
    if (req.left) g.drawImage(bmp, 0, 0, 1, bmp.height, 0, y, x, bmp.height);
    if (req.right) g.drawImage(bmp, bmp.width - 1, 0, 1, bmp.height, x + bmp.width, y, req.right, bmp.height);
    if (req.up) g.drawImage(bmp, 0, 0, bmp.width, 1, x, 0, bmp.width, y);
    if (req.down) g.drawImage(bmp, 0, bmp.height - 1, bmp.width, 1, x, y + bmp.height, bmp.width, req.down);
    g.save();
    g.globalAlpha = 0.18;
    g.strokeStyle = "#FAF0E4";
    g.lineWidth = 6;
    for (let d = -c.height; d < c.width; d += 48) {
      g.beginPath();
      g.moveTo(d, c.height);
      g.lineTo(d + c.height, 0);
      g.stroke();
    }
    g.restore();
    g.drawImage(bmp, x, y);
    g.fillStyle = "rgba(250,240,228,.85)";
    g.font = "bold 40px sans-serif";
    g.fillText("MOCK — not AI", 40, c.height - 40);
    bmp.close();
    const image = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
    return { image, provider: "mock (development)" };
  }
}
