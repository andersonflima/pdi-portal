type RuntimeConfig = typeof globalThis & {
  __PDI_API_URL__?: string;
};

const runtimeConfig = globalThis as RuntimeConfig;

export const environment = {
  apiUrl: runtimeConfig.__PDI_API_URL__ ?? 'http://localhost:3333/api'
};
