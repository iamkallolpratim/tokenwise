import cliPackage from "../../../apps/cli/package.json";

/** npm package name, read from the CLI's package.json so the site never disagrees with it. */
export const PACKAGE_NAME: string = cliPackage.name;
export const VERSION: string = cliPackage.version;
/** The command every example uses. */
export const NPX = `npx ${PACKAGE_NAME}`;
/**
 * true since 0.1.0 was published (2026-11-01). While false, the site says the package is not on
 * npm yet and shows how to run from source.
 */
export const PUBLISHED_ON_NPM = true;
