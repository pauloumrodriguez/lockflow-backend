export interface CreateReservationInput {
  readonly id: string;
  readonly roomId: string;
  readonly organizationId: string;
  readonly createdByUserId: string;
  readonly startAt: string;
  readonly endAt: string;
}

export interface ReservationSnapshot {
  readonly id: string;
  readonly roomId: string;
  readonly organizationId: string;
  readonly createdByUserId: string;
  readonly status: ReservationStatus;
  readonly startAt: string;
  readonly endAt: string;
}

export interface CreateReservationPeriodInput {
  readonly startAt: string;
  readonly endAt: string;
}

export const ReservationStatus = {
  Active: "active",
  Cancelled: "cancelled",
} as const;

export type ReservationStatus =
  (typeof ReservationStatus)[keyof typeof ReservationStatus];

// Named codes let callers identify a failed rule without comparing messages.
export const ReservationErrorCode = {
  InvalidRoomId: "INVALID_ROOM_ID",
  InvalidDateFormat: "INVALID_DATE_FORMAT",
  InvalidCalendarDate: "INVALID_CALENDAR_DATE",
  InvalidTimeOrder: "INVALID_TIME_ORDER",
  DurationTooShort: "DURATION_TOO_SHORT",
  DurationTooLong: "DURATION_TOO_LONG",
  InvalidDuration: "INVALID_DURATION",
  AlreadyCancelled: "RESERVATION_ALREADY_CANCELLED",
} as const;

export type ReservationErrorCode =
  (typeof ReservationErrorCode)[keyof typeof ReservationErrorCode];

export class InvalidReservationError extends Error {
  constructor(
    readonly code: ReservationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InvalidReservationError";
  }
}

const ROOM_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
const MIN_RESERVATION_DURATION_MS = 15 * 60 * 1000;
const MAX_RESERVATION_DURATION_MS = 8 * 60 * 60 * 1000;

// Explicit UTC prevents interpretation in the server's local timezone.
const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?Z$/;

/*
 * Here, a reservation brings together its owner, room, and validated period.
 * The period handles time rules, while the entity controls cancellation, rescheduling, and
 * decides whether active bookings compete for the same room.
 * Cancellation and rescheduling return replacements, leaving the original safe
 * until the application successfully saves the change.
 */
export class Reservation {
  readonly id: string;
  readonly roomId: string;
  readonly organizationId: string;
  readonly createdByUserId: string;

  readonly #period: ReservationPeriod;
  #status: ReservationStatus = ReservationStatus.Active;

  private constructor(
    input: CreateReservationInput,
    period: ReservationPeriod,
  ) {
    this.id = input.id;
    this.roomId = input.roomId;
    this.organizationId = input.organizationId;
    this.createdByUserId = input.createdByUserId;
    this.#period = period;
  }

  static create(input: CreateReservationInput): Reservation {
    validateRoomId(input.roomId);

    const period = ReservationPeriod.create({
      startAt: input.startAt,
      endAt: input.endAt,
    });

    return new Reservation(input, period);
  }

  get startAt(): Date {
    return this.#period.startAt;
  }

  get endAt(): Date {
    return this.#period.endAt;
  }

  get status(): ReservationStatus {
    return this.#status;
  }

  cancel(): Reservation {
    if (!this.isActive()) {
      throw new InvalidReservationError(
        ReservationErrorCode.AlreadyCancelled,
        "A cancelled reservation cannot be cancelled again.",
      );
    }

    const cancelled = new Reservation(this.toJSON(), this.#period);
    cancelled.#status = ReservationStatus.Cancelled;
    return cancelled;
  }

  /*
   * A proposed period produces a replacement with the same identity and owner.
   * The original stays unchanged if validation, availability, or saving fails.
   */
  reschedule(input: CreateReservationPeriodInput): Reservation {
    if (!this.isActive()) {
      throw new InvalidReservationError(
        ReservationErrorCode.AlreadyCancelled,
        "A cancelled reservation cannot be rescheduled.",
      );
    }

    return Reservation.create({
      id: this.id,
      roomId: this.roomId,
      organizationId: this.organizationId,
      createdByUserId: this.createdByUserId,
      startAt: input.startAt,
      endAt: input.endAt,
    });
  }

  overlaps(other: Reservation): boolean {
    if (!this.isActive() || !other.isActive()) {
      return false;
    }

    const sameRoom = this.roomId === other.roomId;

    return sameRoom && this.#period.overlaps(other.#period);
  }

  toJSON(): ReservationSnapshot {
    return {
      id: this.id,
      roomId: this.roomId,
      organizationId: this.organizationId,
      createdByUserId: this.createdByUserId,
      status: this.status,
      startAt: this.startAt.toISOString(),
      endAt: this.endAt.toISOString(),
    };
  }

  private isActive(): boolean {
    return this.#status === ReservationStatus.Active;
  }
}

/*
 * Here, the two timestamps become one validated reservation period.
 * This value object owns the calendar, ordering, and duration rules.
 * Private timestamps keep the period unchanged when callers modify date copies.
 */
class ReservationPeriod {
  readonly #startMs: number;
  readonly #endMs: number;

  private constructor(startMs: number, endMs: number) {
    this.#startMs = startMs;
    this.#endMs = endMs;
  }

  static create(input: CreateReservationPeriodInput): ReservationPeriod {
    const startMs = parseUtcDate(input.startAt);
    const endMs = parseUtcDate(input.endAt);

    validateTimeOrder(startMs, endMs);
    validateDuration(startMs, endMs);

    return new ReservationPeriod(startMs, endMs);
  }

  get startAt(): Date {
    return new Date(this.#startMs);
  }

  get endAt(): Date {
    return new Date(this.#endMs);
  }

  // Strict comparisons allow one period to start exactly when another ends.
  overlaps(other: ReservationPeriod): boolean {
    const startsBeforeOtherEnds = this.#startMs < other.#endMs;
    const endsAfterOtherStarts = this.#endMs > other.#startMs;

    return startsBeforeOtherEnds && endsAfterOtherStarts;
  }
}

// Shared by reservations and availability searches so validation stays consistent.
export function validateRoomId(roomId: string): void {
  if (!ROOM_ID_PATTERN.test(roomId)) {
    throw new InvalidReservationError(
      ReservationErrorCode.InvalidRoomId,
      "A room identifier must contain 1 to 40 lowercase letters, numbers, or hyphens.",
    );
  }
}

export function parseUtcDate(value: string): number {
  const match = ISO_UTC_PATTERN.exec(value);

  if (!match) {
    throw new InvalidReservationError(
      ReservationErrorCode.InvalidDateFormat,
      "Reservation dates must use the UTC ISO 8601 format and end with Z.",
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new InvalidReservationError(
      ReservationErrorCode.InvalidCalendarDate,
      "Reservation dates must represent valid calendar dates.",
    );
  }

  // JavaScript rolls some impossible dates into the next month.
  // Compare normalized input with the parsed result to detect that rollover.
  const milliseconds = (match[1] ?? "").padEnd(3, "0");
  const normalizedInput = `${value.slice(0, 19)}.${milliseconds}Z`;

  if (date.toISOString() !== normalizedInput) {
    throw new InvalidReservationError(
      ReservationErrorCode.InvalidCalendarDate,
      "Reservation dates must represent valid calendar dates.",
    );
  }

  return date.getTime();
}

export function validateTimeOrder(startMs: number, endMs: number): void {
  if (startMs >= endMs) {
    throw new InvalidReservationError(
      ReservationErrorCode.InvalidTimeOrder,
      "The reservation start time must be earlier than the end time.",
    );
  }
}

export function validateDuration(startMs: number, endMs: number): void {
  const durationMs = endMs - startMs;

  if (durationMs < MIN_RESERVATION_DURATION_MS) {
    throw new InvalidReservationError(
      ReservationErrorCode.DurationTooShort,
      "A reservation must last at least 15 minutes.",
    );
  }

  if (durationMs > MAX_RESERVATION_DURATION_MS) {
    throw new InvalidReservationError(
      ReservationErrorCode.DurationTooLong,
      "A reservation cannot last longer than 8 hours.",
    );
  }
}
