// scripts/types/modules.d.ts
// Declaration merging for TVA module API

interface ModuleConfig {
  'token-variants': {
    api: {
      cacheBypass: string[];
      doImageSearch: (name: string, options?: Record<string, unknown>) => Promise<unknown[]>;
      [key: string]: unknown;
    };
  };
}
