export type Route = "editor" | "qa" | "qa-templates" | "qa-block" | "qa-export" | "qa-web" | "not-found";

/** The QA route ships in dev builds, or in production when VITE_ENABLE_QA=true. */
export const QA_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_QA === "true";

export function resolveRoute(pathname: string, qaEnabled: boolean = QA_ENABLED): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "editor";
  if (path === "/qa" && qaEnabled) return "qa";
  if (path === "/qa/templates" && qaEnabled) return "qa-templates";
  if (path === "/qa/block" && qaEnabled) return "qa-block";
  if (path === "/qa/export" && qaEnabled) return "qa-export";
  if (path === "/qa/web" && qaEnabled) return "qa-web";
  return "not-found";
}
