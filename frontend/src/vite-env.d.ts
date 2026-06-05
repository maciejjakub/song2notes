/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When 'true', show a debug audio player for the separated vocal stem. */
  readonly VITE_DEBUG_VOCALS?: string;
  /** When 'true', show the "import from YouTube" panel under the dropzone. */
  readonly VITE_ENABLE_YT_IMPORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
