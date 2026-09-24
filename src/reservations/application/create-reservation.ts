import { Reservation, ReservationSnapshot } from "../domain/reservation";

const MAX_RESERVATION_ADVANCE_MS = 90 * 24 * 60 * 60 * 1000;

export interface CreateReservationRequest {
  readonly roomId: string;
  readonly startAt: string;
  readonly endAt: string;
}

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

export interface CreateReservationDependencies {
  readonly repository: ReservationRepository;
  readonly roomAvailability: RoomAvailability;
  readonly authenticationContext: AuthenticationContext;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(): string;
}

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

    const isRoomReservable =
      await this.dependencies.roomAvailability.isReservable(request.roomId);

    if (!isRoomReservable) {
      throw new CreateReservationError(
        CreateReservationErrorCode.RoomUnavailable,
        "The requested room is unavailable.",
      );
    }

    const currentTimeMs = this.dependencies.clock.now().getTime();
    const reservationStartMs = reservation.startAt.getTime();

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

    const hasOverlap =
      await this.dependencies.repository.hasOverlap(reservation);

    if (hasOverlap) {
      throw new CreateReservationError(
        CreateReservationErrorCode.Overlap,
        "The requested reservation time is unavailable.",
      );
    }

    await this.dependencies.repository.save(reservation);

    return reservation.toJSON();
  }
}
