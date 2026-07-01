export const packagePaths = ['packages/contracts', 'app/api', 'app/web'];

// Library packages that emit a build artifact (dist/) consumed by other packages
// through their `main`/`types` entry points. They must be built during bootstrap
// so that downstream consumers (test/typecheck/lint/dev) can resolve them.
export const libraryPackagePaths = ['packages/contracts'];
