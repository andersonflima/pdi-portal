import { describe, expect, it } from 'vitest';
import { buildConfigPatch, type AiConfigFormValues } from './ai-settings.form';

const values = (overrides: Partial<AiConfigFormValues> = {}): AiConfigFormValues => ({
  enabled: true,
  providerName: 'OpenAI',
  baseUrl: 'https://api.example.com',
  model: 'gpt',
  authHeaderName: 'Authorization',
  authScheme: 'Bearer',
  instructions: 'Analyze the board.',
  ...overrides
});

describe('buildConfigPatch', () => {
  it('trims connection and identity fields', () => {
    const patch = buildConfigPatch(
      values({
        providerName: '  OpenAI  ',
        baseUrl: '  https://api.example.com  ',
        model: '  gpt  ',
        authHeaderName: '  Authorization  ',
        authScheme: '  Bearer  '
      })
    );

    expect(patch).toMatchObject({
      providerName: 'OpenAI',
      baseUrl: 'https://api.example.com',
      model: 'gpt',
      authHeaderName: 'Authorization',
      authScheme: 'Bearer'
    });
  });

  it('preserves analysis instructions verbatim (whitespace is meaningful)', () => {
    const instructions = '  Keep these\n  indented lines  ';

    expect(buildConfigPatch(values({ instructions })).analysisInstructions).toBe(instructions);
  });

  it('carries the enabled flag through unchanged', () => {
    expect(buildConfigPatch(values({ enabled: false })).enabled).toBe(false);
    expect(buildConfigPatch(values({ enabled: true })).enabled).toBe(true);
  });
});
