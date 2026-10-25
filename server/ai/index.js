import { localProvider } from './local.js';
import { createAnthropicProvider } from './anthropic.js';

export function createProvider(config) {
  if (config.anthropicKey) {
    return createAnthropicProvider({ apiKey: config.anthropicKey, model: config.aiModel });
  }
  return localProvider;
}
