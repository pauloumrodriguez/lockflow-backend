import type { Reservation } from "../domain/reservation";

/*
 * Here, application use cases share a domain-oriented persistence contract.
 * Implementations return Reservation entities so callers can ask the entity to
 * perform behavior instead of rebuilding business rules from database records.
 */
export interface ReservationOverlapOptions {
  readonly excludeReservationId?: string;
}

export interface ReservationRepository {
  findById(id: string): Promise<Reservation | null>;
  // Search all organizations, counting only active reservations.
  hasOverlap(
    reservation: Reservation,
    options?: ReservationOverlapOptions,
  ): Promise<boolean>;
  save(reservation: Reservation): Promise<void>;
}

// Queries have separate ports so a read use case never needs write operations.
export interface OrganizationReservationReader {
  findActiveByOrganization(
    organizationId: string,
  ): Promise<readonly Reservation[]>;
}

export const AdministrativeReservationScope = {
  Room: "room",
  Organization: "organization",
} as const;

export type AffectedReservationFilter =
  | {
      readonly scope: typeof AdministrativeReservationScope.Room;
      readonly roomId: string;
    }
  | {
      readonly scope: typeof AdministrativeReservationScope.Organization;
      readonly organizationId: string;
    };

export interface AffectedReservationReader {
  findFutureActive(
    filter: AffectedReservationFilter,
    startsAtOrAfter: Date,
  ): Promise<readonly Reservation[]>;
}
