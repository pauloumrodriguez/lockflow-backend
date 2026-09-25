// Named keys and inferred literal types keep error handling independent of prose.
export const ReservationApplicationErrorCode = {
  StartInPast: "START_IN_PAST",
  StartTooFarInAdvance: "START_TOO_FAR_IN_ADVANCE",
  Overlap: "RESERVATION_OVERLAP",
  RoomUnavailable: "ROOM_UNAVAILABLE",
  OrganizationAccountRequired: "ORGANIZATION_ACCOUNT_REQUIRED",
  PlatformAccountRequired: "PLATFORM_ACCOUNT_REQUIRED",
  NotFound: "RESERVATION_NOT_FOUND",
  NotAllowed: "RESERVATION_OPERATION_NOT_ALLOWED",
} as const;

export type ReservationApplicationErrorCode =
  (typeof ReservationApplicationErrorCode)[keyof typeof ReservationApplicationErrorCode];

export class ReservationApplicationError extends Error {
  constructor(
    readonly code: ReservationApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReservationApplicationError";
  }
}
