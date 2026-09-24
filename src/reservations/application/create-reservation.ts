import { Reservation, type ReservationSnapshot } from "../domain/reservation";

const MAX_RESERVATION_ADVANCE_MS = 90 * 24 * 60 * 60 * 1000;

/*
 * Here, the request describes the room and time the caller wants to reserve.
 * Ownership comes from the authenticated identity supplied by the application.
 */
export interface CreateReservationRequest {
  readonly roomId: string;
  readonly startAt: string;
  readonly endAt: string;
}

/*
 * These contracts describe the collaborators needed to create a reservation.
 * Tests supply controlled implementations; infrastructure will later connect
 * them to persistence, authentication, room records, and the system clock.
 */
export interface ReservationRepository {
  hasOverlap(reservation: Reservation): Promise<boolean>;
  save(reservation: Reservation): Promise<void>;
}

export interface RoomAvailability {
  isReservable(roomId: string): Promise<boolean>;
}

export interface AuthenticatedUser {
  readonly userId: string;
  readonly organizationId: string;
}

export interface AuthenticationContext {
  getAuthenticatedUser(): AuthenticatedUser;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(): string;
}

export interface CreateReservationDependencies {
  readonly repository: ReservationRepository;
  readonly roomAvailability: RoomAvailability;
  readonly authenticationContext: AuthenticationContext;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

// Stable codes identify failed rules independently of their messages.
export const CreateReservationErrorCode = {
  StartInPast: "START_IN_PAST",
  StartTooFarInAdvance: "START_TOO_FAR_IN_ADVANCE",
  Overlap: "RESERVATION_OVERLAP",
  RoomUnavailable: "ROOM_UNAVAILABLE",
} as const;

export type CreateReservationErrorCode =
  (typeof CreateReservationErrorCode)[keyof typeof CreateReservationErrorCode];

export class CreateReservationError extends Error {
  constructor(
    readonly code: CreateReservationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CreateReservationError";
  }
}

/*
 * Here, a request becomes a reservation owned by the authenticated user.
 * The entity validates its own data, then this use case checks the room,
 * booking window, and existing reservations before saving the result.
 */
export class CreateReservation {
  constructor(private readonly dependencies: CreateReservationDependencies) {}

  async execute(
    request: CreateReservationRequest,
  ): Promise<ReservationSnapshot> {
    const authenticatedUser =
      this.dependencies.authenticationContext.getAuthenticatedUser();
    const reservation = Reservation.create({
      id: this.dependencies.idGenerator.generate(),
      roomId: request.roomId,
      organizationId: authenticatedUser.organizationId,
      createdByUserId: authenticatedUser.userId,
      startAt: request.startAt,
      endAt: request.endAt,
    });

    await this.ensureRoomIsReservable(reservation.roomId);
    this.ensureStartIsWithinBookingWindow(reservation.startAt);
    await this.ensureNoOverlap(reservation);

    // Persistence must also enforce conflicts atomically under concurrency.
    await this.dependencies.repository.save(reservation);

    return reservation.toJSON();
  }

  private async ensureRoomIsReservable(roomId: string): Promise<void> {
    const isRoomReservable =
      await this.dependencies.roomAvailability.isReservable(roomId);

    if (!isRoomReservable) {
      throw new CreateReservationError(
        CreateReservationErrorCode.RoomUnavailable,
        "The requested room is unavailable.",
      );
    }
  }

  private ensureStartIsWithinBookingWindow(startAt: Date): void {
    // One clock reading keeps both boundaries relative to the same instant.
    const currentTimeMs = this.dependencies.clock.now().getTime();
    const reservationStartMs = startAt.getTime();

    if (reservationStartMs < currentTimeMs) {
      throw new CreateReservationError(
        CreateReservationErrorCode.StartInPast,
        "A reservation cannot start in the past.",
      );
    }

    const latestAllowedStartMs = currentTimeMs + MAX_RESERVATION_ADVANCE_MS;

    if (reservationStartMs > latestAllowedStartMs) {
      throw new CreateReservationError(
        CreateReservationErrorCode.StartTooFarInAdvance,
        "A reservation cannot start more than 90 days in advance.",
      );
    }
  }

  private async ensureNoOverlap(reservation: Reservation): Promise<void> {
    const hasOverlap =
      await this.dependencies.repository.hasOverlap(reservation);

    if (hasOverlap) {
      throw new CreateReservationError(
        CreateReservationErrorCode.Overlap,
        "The requested reservation time is unavailable.",
      );
    }
  }
}
