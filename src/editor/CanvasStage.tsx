import { useLayoutEffect, useRef, useState } from "react";
import type { FitResult } from "@/layout/types";
import type { Project } from "@/model/project";
import { rendererFor } from "@/templates/outputs";
import type { TemplateImages } from "@/templates/types";
import type { ContrastReading } from "@/templates/shared/contrast";

interface CanvasStageProps {
  project: Project;
  images: TemplateImages;
  onFit?: (r: FitResult) => void;
  onContrast?: (r: ContrastReading[]) => void;
}

/**
 * Renders the output at its real export size (1080 × 1350 or 1600 × 1000)
 * and scales the whole thing to fit the stage with a CSS transform, so what
 * you see is exactly what exports.
 */
export function CanvasStage({ project, images, onFit, onContrast }: CanvasStageProps) {
  const r = rendererFor(project);
  const format = { width: r.width, height: r.height };
  const wrapRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(540);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setAvail(el.clientWidth || 540);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxW = format.height > format.width ? 540 : 760;
  const scale = Math.min(avail, maxW) / format.width;
  const Component = r.Component;

  return (
    <div ref={wrapRef} className="canvas-stage">
      <div
        className="canvas-frame"
        style={{ width: Math.round(format.width * scale), height: Math.round(format.height * scale) }}
        aria-label={`${r.label} creative, ${r.description}`}
        role="img"
      >
        {Component ? (
          <div style={{ width: format.width, height: format.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <Component project={project} images={images} mode="editor" onFit={onFit} onContrast={onContrast} />
          </div>
        ) : (
          <div className="canvas-unbuilt">
            <p>{r.label} isn't built yet.</p>
            <p className="muted">Switch to Block in Style.</p>
          </div>
        )}
      </div>
    </div>
  );
}
