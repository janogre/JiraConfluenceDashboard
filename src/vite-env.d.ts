/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_API_BASE?: string;
  readonly VITE_AI_FUNCTION_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
