/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_QA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
