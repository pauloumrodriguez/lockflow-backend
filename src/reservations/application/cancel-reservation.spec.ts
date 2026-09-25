import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  type AuthenticatedUser,
  UserRole,
} from "../../authentication/application/authentication-context";
import {
  InvalidReservationError,
  Reservation,
  ReservationErrorCode,
  ReservationStatus,
} from "../domain/reservation";
import {
  CancelReservation,
} from "./cancel-reservation";
import { ReservationApplicationError, ReservationApplicationErrorCode } from "./reservation-application-error";
import type { ReservationRepository } from "./reservation-repository";

import {
  InMemoryReservationRepository,
  FixedAuthenticationContext,
} from "./reservation.test-support";

interface TestReservationOptions {
  readonly id?: string;
  readonly organizationId?: string;
  readonly createdByUserId?: string;
}

const MEMBER_ANA: AuthenticatedUser = {
  userId: "user-ana",
  organizationId: "organization-a",
  role: UserRole.Member,
};

function createReservation(
  options: TestReservationOptions = {},
): Reservation {
  return Reservation.create({
    id: options.id ?? "reservation-1",
    roomId: "room-a",
    organizationId: options.organizationId ?? "organization-a",
    createdByUserId: options.createdByUserId ?? "user-ana",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });
}

function createCancelReservation(
  repository: ReservationRepository,
  authenticatedUser: AuthenticatedUser = MEMBER_ANA,
): CancelReservation {
  return new CancelReservation({
    repository,
    authenticationContext: new FixedAuthenticationContext(authenticatedUser),
  });
}

/*
 * These scenarios follow cancellation through lookup, domain behavior, and
 * persistence. Failed operations never ask the repository to save a new state.
 */
test("cancels and saves an active reservation", async () => {
  const reservation = createReservation();
  const repository = new InMemoryReservationRepository([reservation]);
  const cancelReservation = createCancelReservation(repository);

  const result = await cancelReservation.execute({
    reservationId: reservation.id,
  });

  assert.deepEqual(result, {
    id: "reservation-1",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-ana",
    status: ReservationStatus.Cancelled,
    startAt: "2030-05-10T10:00:00.000Z",
    endAt: "2030-05-10T11:00:00.000Z",
  });
  assert.equal(repository.reservations.length, 1);
  assert.equal(repository.saveCalls, 1);
  assert.deepEqual(repository.reservations[0]?.toJSON(), result);
});

test("rejects cancellation when the reservation does not exist", async () => {
  const repository = new InMemoryReservationRepository();
  const cancelReservation = createCancelReservation(repository);

  await assert.rejects(
    () =>
      cancelReservation.execute({
        reservationId: "missing-reservation",
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.NotFound,
    },
  );

  assert.equal(repository.saveCalls, 0);
});

test("rejects cancellation when the reservation is already cancelled", async () => {
  const reservation = createReservation();
  reservation.cancel();
  const repository = new InMemoryReservationRepository([reservation]);
  const cancelReservation = createCancelReservation(repository);

  await assert.rejects(
    () =>
      cancelReservation.execute({
        reservationId: reservation.id,
      }),
    {
      constructor: InvalidReservationError,
      code: ReservationErrorCode.AlreadyCancelled,
    },
  );

  assert.equal(repository.saveCalls, 0);
  assert.equal(reservation.status, ReservationStatus.Cancelled);
});

test("rejects a member cancelling another member's reservation", async () => {
  const reservation = createReservation({ createdByUserId: "user-bruno" });
  const repository = new InMemoryReservationRepository([reservation]);
  const cancelReservation = createCancelReservation(repository);

  await assert.rejects(
    () =>
      cancelReservation.execute({
        reservationId: reservation.id,
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.NotAllowed,
    },
  );

  assert.equal(repository.saveCalls, 0);
  assert.equal(reservation.status, ReservationStatus.Active);
});

test("allows an organization administrator to cancel within their organization", async () => {
  const reservation = createReservation({ createdByUserId: "user-bruno" });
  const repository = new InMemoryReservationRepository([reservation]);
  const cancelReservation = createCancelReservation(repository, {
    userId: "organization-admin-olivia",
    organizationId: "organization-a",
    role: UserRole.OrganizationAdmin,
  });

  const result = await cancelReservation.execute({
    reservationId: reservation.id,
  });

  assert.equal(result.status, ReservationStatus.Cancelled);
  assert.equal(repository.saveCalls, 1);
});

test("hides another organization's reservation from a member", async () => {
  const reservation = createReservation({
    organizationId: "organization-b",
    createdByUserId: "user-bruno",
  });
  const repository = new InMemoryReservationRepository([reservation]);
  const cancelReservation = createCancelReservation(repository);

  await assert.rejects(
    () =>
      cancelReservation.execute({
        reservationId: reservation.id,
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.NotFound,
      message: "The requested reservation was not found.",
    },
  );

  assert.equal(repository.saveCalls, 0);
  assert.equal(reservation.status, ReservationStatus.Active);
});

test("hides another organization's reservation from an organization administrator", async () => {
  const reservation = createReservation({
    organizationId: "organization-b",
    createdByUserId: "user-bruno",
  });
  const repository = new InMemoryReservationRepository([reservation]);
  const cancelReservation = createCancelReservation(repository, {
    userId: "organization-admin-olivia",
    organizationId: "organization-a",
    role: UserRole.OrganizationAdmin,
  });

  await assert.rejects(
    () =>
      cancelReservation.execute({
        reservationId: reservation.id,
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.NotFound,
      message: "The requested reservation was not found.",
    },
  );

  assert.equal(repository.saveCalls, 0);
  assert.equal(reservation.status, ReservationStatus.Active);
});

test("allows a platform administrator to explicitly cancel a reservation", async () => {
  const reservation = createReservation({
    organizationId: "organization-b",
    createdByUserId: "user-bruno",
  });
  const repository = new InMemoryReservationRepository([reservation]);
  const cancelReservation = createCancelReservation(repository, {
    userId: "platform-admin-patricia",
    role: UserRole.PlatformAdmin,
  });

  const result = await cancelReservation.execute({
    reservationId: reservation.id,
  });

  assert.equal(result.status, ReservationStatus.Cancelled);
  assert.equal(repository.saveCalls, 1);
});
