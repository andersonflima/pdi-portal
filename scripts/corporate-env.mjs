export const defaultLocalEnv = {
  DATABASE_URL: process.env.DATABASE_URL || 'file:../data/pdi.db',
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-before-production',
  PORT: process.env.PORT || '3333',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:5173'
};

export const toLocalEnv = () => ({
  ...process.env,
  ...defaultLocalEnv
});
