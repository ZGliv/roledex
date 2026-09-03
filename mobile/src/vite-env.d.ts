/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JOBSWIPE_API_BASE_URL?: string;
  readonly VITE_JOBSWIPE_APP_VERSION?: string;
  readonly VITE_JOBSWIPE_BUILD_NUMBER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
