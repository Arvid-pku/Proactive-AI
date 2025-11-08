import OpenAI from 'openai';

let openaiClient = null;

export async function getOpenAIClient() {
  if (openaiClient) return openaiClient;

  const { apiKey } = await chrome.storage.local.get('apiKey');
  const key =
    apiKey ||
    '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';

  if (!key) {
    throw new Error(
      'No API key configured. Please set your OpenAI API key in the extension settings.'
    );
  }

  console.log('Initializing OpenAI client with API key:', key.substring(0, 20) + '...');

  openaiClient = new OpenAI({
    apiKey: key,
    dangerouslyAllowBrowser: true
  });

  return openaiClient;
}

export function resetClient() {
  openaiClient = null;
}

export async function withLatencyMeter(label, fn) {
  const marker = `${label}-${Date.now()}`;
  performance.mark(`${marker}-start`);
  try {
    const result = await fn();
    performance.mark(`${marker}-end`);
    performance.measure(label, `${marker}-start`, `${marker}-end`);
    return result;
  } catch (error) {
    performance.mark(`${marker}-error`);
    performance.measure(`${label}-error`, `${marker}-start`, `${marker}-error`);
    throw error;
  }
}
