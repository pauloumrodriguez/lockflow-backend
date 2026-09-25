import {
  type AuthenticatedUser,
  type AuthenticationContext,
  UserRole,
} from "../../authentication/application/authentication-context";
import { Reservation, type CreateReservationInput } from "../domain/reservation";
import type { ReservationRepository, ReservationOverlapOptions } from "./reservation-repository";
import type { Clock, IdGenerator, RoomAvailability } from "./reservation-services";

export const MEMBER_ANA: AuthenticatedUser = {
  userId: "user-ana",
  organizationId: "organization-a",
  role: UserRole.Member,
};

/*
 * Here, test collaborators provide repeatable identities, rooms, time, and data.
 * Every fixture owns a fresh repository. Its overlap search stays global and
 * excludes an ID only when a rescheduling operation explicitly requests it.
 */
export class InMemoryReservationRepository implements ReservationRepository {
  readonly reservations: Reservation[];
  saveCalls = 0;
  saveError: Error | undefined;

  constructor(initialReservations: readonly Reservation[] = []) {
    this.reservations = [...initialReservations];
  }

  async findById(id: string): Promise<Reservation | null> {
    return this.reservations.find((reservation) => reservation.id === id) ?? null;
  }

  async hasOverlap(
    reservation: Reservation,
    options: ReservationOverlapOptions = {},
  ): Promise<boolean> {
    return this.reservations.some(
      (saved) => saved.id !== options.excludeReservationId && saved.overlaps(reservation),
    );
  }

  async save(reservation: Reservation): Promise<void> {
    if (this.saveError) {
      throw this.saveError;
    }
    this.saveCalls += 1;
    const index = this.reservations.findIndex((saved) => saved.id === reservation.id);
    if (index === -1) {
      this.reservations.push(reservation);
    } else {
      this.reservations[index] = reservation;
    }
  }
}

export class FixedAuthenticationContext implements AuthenticationContext {
  constructor(private readonly user: AuthenticatedUser) {}

  getAuthenticatedUser(): AuthenticatedUser {
    return { ...this.user };
  }
}

export interface TestContextOptions {
  readonly authenticatedUser?: AuthenticatedUser;
  readonly currentTime?: string;
  readonly reservationId?: string;
  readonly reservableRoomIds?: readonly string[];
  readonly reservations?: readonly Reservation[];
}

export function createDependencies(options: TestContextOptions = {}) {
  const repository = new InMemoryReservationRepository(options.reservations);
  const authenticationContext = new FixedAuthenticationContext(options.authenticatedUser ?? MEMBER_ANA);
  const clock: Clock = {
    now: () => new Date(options.currentTime ?? "2030-05-01T10:00:00Z"),
  };
  const idGenerator: IdGenerator = {
    generate: () => options.reservationId ?? "reservation-1",
  };
  const roomAvailability: RoomAvailability = {
    isReservable: async (roomId) => (options.reservableRoomIds ?? ["room-a"]).includes(roomId),
  };
  return { repository, authenticationContext, clock, idGenerator, roomAvailability };
}

export function createStoredReservation(input: Partial<CreateReservationInput> = {}): Reservation {
  return Reservation.create({
    id: "reservation-1",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-ana",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
    ...input,
  });
}
