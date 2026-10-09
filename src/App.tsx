import { Suspense, lazy } from "react";
import { EditorPage } from "./editor/EditorPage";
import { resolveRoute } from "./routes";

// Loaded on demand so QA code stays out of the editor's bundle.
const QAPage = lazy(() => import("./qa/QAPage").then((m) => ({ default: m.QAPage })));
const WebQAPage = lazy(() => import("./qa/WebQAPage").then((m) => ({ default: m.WebQAPage })));
const ExportQAPage = lazy(() => import("./qa/ExportQAPage").then((m) => ({ default: m.ExportQAPage })));
const TemplatesQAPage = lazy(() => import("./qa/TemplatesQAPage").then((m) => ({ default: m.TemplatesQAPage })));

export function App() {
  const route = resolveRoute(window.location.pathname);
  if (route === "qa" || route === "qa-templates" || route === "qa-block" || route === "qa-export" || route === "qa-web") {
    return (
      <Suspense fallback={<p className="shell-message">Loading QA…</p>}>
        {route === "qa" ? <QAPage /> : route === "qa-export" ? <ExportQAPage /> : route === "qa-web" ? <WebQAPage /> : <TemplatesQAPage templateFilter={route === "qa-block" ? ["block"] : undefined} />}
      </Suspense>
    );
  }
  if (route === "not-found") {
    return (
      <main className="shell-message">
        <h1>Page not found</h1>
        <p>
          <a href="/">Open the generator</a>
        </p>
      </main>
    );
  }
  return <EditorPage />;
}
