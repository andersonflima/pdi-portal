type RuntimeConfig = typeof globalThis & {
  __PDI_API_URL__?: string;
};

const runtimeConfig = globalThis as RuntimeConfig;
const locationConfig = globalThis.location;

export const environment = {
  apiUrl:
    runtimeConfig.__PDI_API_URL__ ??
    (locationConfig?.port === '5173' ? 'http://localhost:3333/api' : `${locationConfig?.origin ?? ''}/api`)
};
