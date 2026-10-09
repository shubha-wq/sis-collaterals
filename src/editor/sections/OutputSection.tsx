import { OUTPUTS, OUTPUT_ORDER, type OutputId } from "@/model/outputs";
import type { Edit } from "@/state/edits";

/**
 * Step one: what the creative is for. Always visible at the top of the
 * panel. Switching output keeps the content, the photo and the logos.
 */
export function OutputSection({ output, edit }: { output: OutputId; edit: (e: Edit) => void }) {
  return (
    <section className="output-picker" aria-labelledby="output-picker-title">
      <p className="label" id="output-picker-title">
        Output
      </p>
      <div className="output-options" role="radiogroup" aria-labelledby="output-picker-title">
        {OUTPUT_ORDER.map((id) => {
          const o = OUTPUTS[id];
          return (
            <button key={id} type="button" role="radio" aria-checked={output === id} className="output-option" data-output={id} onClick={() => edit({ type: "output", output: id })}>
              <span className="output-option-head">
                <span className="output-option-title">{o.label}</span>
                <span className="output-option-kind" data-kind={o.usesTemplates ? "templates" : "web"}>
                  {o.usesTemplates ? "5 templates" : "No template"}
                </span>
              </span>
              <span className="output-option-size">
                {o.width} × {o.height}
              </span>
              <span className="output-option-desc">{o.description}</span>
            </button>
          );
        })}
      </div>
      <p className="field-hint">
        {output === "instagram"
          ? "Pick one of the five templates under Style."
          : "Website outputs have their own fixed design and don't use the Instagram templates. Your photo, text and logos stay the same when you switch."}
      </p>
    </section>
  );
}
