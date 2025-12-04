/**
 * LLM Provider Types
 *
 * Defines the available LLM providers and shared interfaces for the
 * provider abstraction layer.
 */

/**
 * Available LLM providers
 * - 'ollama': Local Gemma 3 via Ollama (default, free, private)
 * - 'openai': Cloud GPT via OpenAI API (requires API key, pay-per-token)
 */
export type LLMProviderType = 'ollama' | 'openai';

/**
 * Model information for each provider
 */
export interface ProviderModelInfo {
  ollama: {
    name: 'Gemma 3';
    model: 'gemma3:4b';
    contextSize: 128000;
    multimodal: true;
    local: true;
  };
  openai: {
    name: 'GPT 5';
    model: 'gpt-5-mini-2025-08-07';
    contextSize: 400000;
    multimodal: true;
    local: false;
  };
}

/**
 * Default provider configuration
 */
export const DEFAULT_PROVIDER: LLMProviderType = 'ollama';

/**
 * Provider display names for UI
 */
export const PROVIDER_DISPLAY_NAMES: Record<LLMProviderType, string> = {
  ollama: 'Gemma 3',
  openai: 'GPT 5',
};

/**
 * Provider descriptions for tooltips
 */
export const PROVIDER_DESCRIPTIONS: Record<LLMProviderType, string> = {
  ollama: 'Local model - Free, private, works offline',
  openai: 'Cloud model - Fast, powerful, requires API key',
};
