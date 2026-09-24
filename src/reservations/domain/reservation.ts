export interface CreateReservationInput {
  readonly id: string;
  readonly roomId: string;
  readonly startAt: string;
  readonly endAt: string;
}

export interface ReservationSnapshot {
  readonly id: string;
  readonly roomId: string;
  readonly startAt: string;
  readonly endAt: string;
}

interface CreateReservationPeriodInput {
  readonly startAt: string;
  readonly endAt: string;
}

// Named codes let callers identify a failed rule without comparing messages.
export const ReservationErrorCode = {
  InvalidRoomId: "INVALID_ROOM_ID",
  InvalidDateFormat: "INVALID_DATE_FORMAT",
  InvalidCalendarDate: "INVALID_CALENDAR_DATE",
  InvalidTimeOrder: "INVALID_TIME_ORDER",
  DurationTooShort: "DURATION_TOO_SHORT",
  DurationTooLong: "DURATION_TOO_LONG",
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
 * Here, a reservation brings together its identity, room, and validated period.
 * The period handles time rules, while the reservation decides whether two
 * bookings compete for the same room.
 */
export class Reservation {
  readonly #period: ReservationPeriod;

  private constructor(
    readonly id: string,
    readonly roomId: string,
    period: ReservationPeriod,
  ) {
    this.#period = period;
  }

  static create(input: CreateReservationInput): Reservation {
    validateRoomId(input.roomId);

    const period = ReservationPeriod.create({
      startAt: input.startAt,
      endAt: input.endAt,
    });

    return new Reservation(input.id, input.roomId, period);
  }

  get startAt(): Date {
    return this.#period.startAt;
  }

  get endAt(): Date {
    return this.#period.endAt;
  }

  overlaps(other: Reservation): boolean {
    const sameRoom = this.roomId === other.roomId;

    return sameRoom && this.#period.overlaps(other.#period);
  }

  toJSON(): ReservationSnapshot {
    return {
      id: this.id,
      roomId: this.roomId,
      startAt: this.startAt.toISOString(),
      endAt: this.endAt.toISOString(),
    };
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

function validateRoomId(roomId: string): void {
  if (!ROOM_ID_PATTERN.test(roomId)) {
    throw new InvalidReservationError(
      ReservationErrorCode.InvalidRoomId,
      "A room identifier must contain 1 to 40 lowercase letters, numbers, or hyphens.",
    );
  }
}

function parseUtcDate(value: string): number {
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

function validateTimeOrder(startMs: number, endMs: number): void {
  if (startMs >= endMs) {
    throw new InvalidReservationError(
      ReservationErrorCode.InvalidTimeOrder,
      "The reservation start time must be earlier than the end time.",
    );
  }
}

function validateDuration(startMs: number, endMs: number): void {
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
