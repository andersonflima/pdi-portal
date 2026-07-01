import type { AiIntegrationConfigPatch } from './ai-integration.service';

export type AiConfigFormValues = {
  enabled: boolean;
  providerName: string;
  baseUrl: string;
  model: string;
  authHeaderName: string;
  authScheme: string;
  instructions: string;
};

/**
 * Builds the config patch sent on save. Connection/identity fields are trimmed;
 * analysis instructions are preserved verbatim because their whitespace is meaningful.
 */
export const buildConfigPatch = (values: AiConfigFormValues): AiIntegrationConfigPatch => ({
  enabled: values.enabled,
  providerName: values.providerName.trim(),
  baseUrl: values.baseUrl.trim(),
  model: values.model.trim(),
  authHeaderName: values.authHeaderName.trim(),
  authScheme: values.authScheme.trim(),
  analysisInstructions: values.instructions
});
