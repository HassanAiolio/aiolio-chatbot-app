/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Legacy name from the Create React App days; still honoured. */
  readonly REACT_APP_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
