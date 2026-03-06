// scripts/types/globals.d.ts
// Global type augmentations for runtime properties

interface Window {
  Fuse?: new <T>(list: T[], options?: Record<string, unknown>) => {
    search: (pattern: string) => Array<{ item: T; score?: number }>;
  };
  TVA?: { debug: boolean; [key: string]: unknown };
  TokenReplacerFA?: Record<string, unknown>;
}
