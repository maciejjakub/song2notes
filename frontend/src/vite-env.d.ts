/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When 'true', show a debug audio player for the separated vocal stem. */
  readonly VITE_DEBUG_VOCALS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
