// scripts/types/settings.d.ts
// Declaration merging for fvtt-types SettingConfig
// Maps "namespace.key" to the setting's value type

interface SettingConfig {
  "token-replacer-fa.fuzzyThreshold": number;
  "token-replacer-fa.searchPriority": "faNexus" | "forgeBazaar" | "both";
  "token-replacer-fa.autoReplace": boolean;
  "token-replacer-fa.confirmReplace": boolean;
  "token-replacer-fa.fallbackFullSearch": boolean;
  "token-replacer-fa.additionalPaths": string;
  "token-replacer-fa.useTVACache": boolean;
  "token-replacer-fa.refreshTVACache": boolean;
  "token-replacer-fa.indexUpdateFrequency": "daily" | "weekly" | "monthly" | "quarterly";
  "token-replacer-fa.debugMode": boolean;
}
