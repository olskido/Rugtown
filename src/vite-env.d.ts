/// <reference types="vite/client" />

/**
 * Type declarations for RugTown's VITE_ environment variables.
 * These augment Vite's ImportMetaEnv so every usage of import.meta.env
 * is fully typed and IDE-autocompleted.
 *
 * Add a new entry here whenever you add a variable to .env.example.
 */
interface ImportMetaEnv {
  /** Supabase project REST/Realtime endpoint URL */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase public anon key (safe to expose in the browser) */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
