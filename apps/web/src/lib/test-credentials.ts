/**
 * Test credential shortcuts for the login page.
 *
 * This is a convenience for testing role behaviour: a dropdown that fills the
 * login form, so every role can be checked in seconds rather than having to
 * look accounts up.
 *
 * Controls, deliberately layered:
 *
 *  1. `VITE_ENABLE_TEST_CREDENTIALS` must be exactly `'true'` at build time.
 *     Vite inlines this and drops the list from the bundle when it is not set,
 *     so on a production build without the flag the passwords are not shipped
 *     at all.
 *
 *  2. The panel is labelled as a testing aid in the UI, so nobody mistakes it
 *     for a normal login affordance.
 *
 * These are seeded demo accounts. Before real user accounts exist, remove this
 * file and unset the flag rather than extending the list — leaving a roster of
 * working passwords in the client bundle is fine for a demo and not fine in
 * production.
 */
export interface TestCredential {
  email: string;
  password: string;
  name: string;
  role: string;
  /** What this account is useful for checking. */
  note: string;
}

const ALL: TestCredential[] = [
  {
    email: 'admin@madda.local',
    password: 'Admin@12345',
    name: 'System Administrator',
    role: 'Super Admin',
    note: 'Everything, including users and settings',
  },
  {
    email: 'station@madda.local',
    password: 'Password@1',
    name: 'Abdi Bekele',
    role: 'Station Manager',
    note: 'Purchases and processing at Guji',
  },
  {
    email: 'sales@madda.local',
    password: 'Password@1',
    name: 'Hanna Getu',
    role: 'Sales Manager',
    note: 'Buyers, proformas, contracts, shipments',
  },
  {
    email: 'finance@madda.local',
    password: 'Password@1',
    name: 'Samuel Tadesse',
    role: 'Finance Manager',
    note: 'Expenses, payroll, approvals',
  },
  {
    email: 'qgrader@madda.local',
    password: 'Password@1',
    name: 'Meron Assefa',
    role: 'QC Officer',
    note: 'Processing and traceability, read-only on sales',
  },
];

/**
 * Only present when the build was explicitly told to include it.
 *
 * Vite statically replaces `import.meta.env.VITE_ENABLE_TEST_CREDENTIALS`, so
 * in a build without the flag this is `false` and the list above is dropped by
 * the bundler as dead code.
 */
export const testCredentialsEnabled: boolean =
  import.meta.env.VITE_ENABLE_TEST_CREDENTIALS === 'true';

export const TEST_CREDENTIALS: TestCredential[] = testCredentialsEnabled ? ALL : [];
