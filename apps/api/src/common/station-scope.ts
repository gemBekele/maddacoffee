import { ForbiddenException } from '@nestjs/common';
import { visibleStationIds, type Role } from '@madda/shared';
import type { AuthUser } from './decorators';

/**
 * Station scoping.
 *
 * A station-scoped user sees only the stations they are assigned to. This is
 * enforced on the server, not in the client: hiding a row in the UI while the
 * API still returns it is not access control, and the audit found that
 * `stationIds` was computed and returned but never used to filter anything.
 *
 * Every list endpoint that exposes station-owned records must pass through
 * `stationFilter`. Read this as the single place the rule lives.
 */

/**
 * A Prisma `where` fragment restricting a query to the user's stations.
 *
 * Returns `{}` for an unscoped user, so it can be spread into any query
 * unconditionally:
 *
 *   where: { ...stationFilter(user), ...otherFilters }
 *
 * For a scoped user with no stations assigned it returns an impossible filter,
 * so they see nothing rather than everything. Failing closed is deliberate: an
 * unassigned station user is a configuration error, and showing them the whole
 * company because of it would be the wrong way to surface that.
 */
export function stationFilter(user: AuthUser): Record<string, unknown> {
  const ids = visibleStationIds(user.roles as Role[], user.stationIds ?? []);
  if (ids === null) return {};
  if (ids.length === 0) return { stationId: { in: [] } };
  return { stationId: { in: ids } };
}

/** Whether this user's view is limited to specific stations. */
export function isScoped(user: AuthUser): boolean {
  return visibleStationIds(user.roles as Role[], user.stationIds ?? []) !== null;
}

/**
 * Resolve a requested station to something the user is allowed to see.
 *
 * Used where a query takes a single station: a scoped user asking for a station
 * outside their set is refused, and with no station specified they are narrowed
 * to their own rather than left unrestricted.
 */
export function resolveStationId(user: AuthUser, requested?: string | null): string | string[] | null {
  const ids = visibleStationIds(user.roles as Role[], user.stationIds ?? []);
  if (ids === null) return requested ?? null;

  if (requested) {
    if (!ids.includes(requested)) {
      throw new ForbiddenException('You do not have access to this station.');
    }
    return requested;
  }
  // No station asked for: narrow to the set rather than leaving it open.
  return ids;
}

/**
 * Assert that a record the user is about to read or change belongs to a
 * station they can see.
 *
 * For single-record endpoints, where a filter on the list is not enough.
 */
export function assertStationAccess(user: AuthUser, stationId: string | null | undefined) {
  const ids = visibleStationIds(user.roles as Role[], user.stationIds ?? []);
  if (ids === null) return;
  if (!stationId || !ids.includes(stationId)) {
    throw new ForbiddenException('You do not have access to this record.');
  }
}
