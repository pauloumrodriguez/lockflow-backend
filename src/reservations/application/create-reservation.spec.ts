import { strict as assert } from "node:assert";
import { test } from "node:test";

import { Reservation, ReservationStatus } from "../domain/reservation";
import { UserRole } from "../../authentication/application/authentication-context";
import { CreateReservation } from "./create-reservation";
import {
  ReservationApplicationError,
  ReservationApplicationErrorCode,
} from "./reservation-application-error";

import {
  createDependencies,
  type TestContextOptions,
} from "./reservation.test-support";

/*
 * Each scenario starts with fresh collaborators and changes only relevant data.
 * Shared test doubles keep setup consistent with the other reservation use cases.
 */
function createTestContext(options: TestContextOptions = {}) {
  const dependencies = createDependencies(options);
  return {
    repository: dependencies.repository,
    createReservation: new CreateReservation(dependencies),
  };
}

/*
 * These scenarios follow a request through validation, ownership, and saving.
 * Successful requests preserve the expected data; rejected requests leave the
 * repository unchanged. No HTTP server or database is needed at this stage.
 */
test("creates and saves a reservation for the authenticated user and organization", async () => {
  const { repository, createReservation } = createTestContext({
    currentTime: "2030-05-01T09:00:00Z",
  });

  const result = await createReservation.execute({
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  assert.deepEqual(result, {
    id: "reservation-1",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-ana",
    status: ReservationStatus.Active,
    startAt: "2030-05-10T10:00:00.000Z",
    endAt: "2030-05-10T11:00:00.000Z",
  });

  assert.equal(repository.reservations.length, 1);
  assert.deepEqual(repository.reservations[0]?.toJSON(), result);
});

test("rejects a reservation that starts in the past", async () => {
  const { repository, createReservation } = createTestContext({
    currentTime: "2030-05-10T10:00:00Z",
    reservationId: "reservation-2",
  });

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-05-10T09:00:00Z",
        endAt: "2030-05-10T10:00:00Z",
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.StartInPast,
    },
  );

  assert.equal(repository.reservations.length, 0);
});

test("rejects a reservation more than 90 days in advance", async () => {
  const { repository, createReservation } = createTestContext({
    reservationId: "reservation-3",
  });

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-07-30T10:00:01Z",
        endAt: "2030-07-30T11:00:01Z",
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.StartTooFarInAdvance,
    },
  );

  assert.equal(repository.reservations.length, 0);
});

test("accepts a reservation exactly 90 days in advance", async () => {
  const { repository, createReservation } = createTestContext({
    reservationId: "reservation-4",
  });

  const result = await createReservation.execute({
    roomId: "room-a",
    startAt: "2030-07-30T10:00:00Z",
    endAt: "2030-07-30T11:00:00Z",
  });

  assert.equal(result.id, "reservation-4");
  assert.equal(repository.reservations.length, 1);
});

test("rejects an overlapping reservation in the same room", async () => {
  const { repository, createReservation } = createTestContext({
    reservationId: "reservation-5",
  });

  const existingReservation = Reservation.create({
    id: "existing-reservation",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-existing",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  await repository.save(existingReservation);

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-05-10T10:30:00Z",
        endAt: "2030-05-10T11:30:00Z",
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.Overlap,
    },
  );

  assert.equal(repository.reservations.length, 1);
});

test("allows an adjacent reservation in the same room", async () => {
  const { repository, createReservation } = createTestContext({
    reservationId: "reservation-6",
  });

  const existingReservation = Reservation.create({
    id: "existing-reservation",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-existing",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  await repository.save(existingReservation);

  const result = await createReservation.execute({
    roomId: "room-a",
    startAt: "2030-05-10T11:00:00Z",
    endAt: "2030-05-10T12:00:00Z",
  });

  assert.equal(result.id, "reservation-6");
  assert.equal(repository.reservations.length, 2);
});

test("rejects a reservation when the room is unavailable", async () => {
  const { repository, createReservation } = createTestContext({
    reservableRoomIds: [],
    reservationId: "reservation-7",
  });

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-05-10T10:00:00Z",
        endAt: "2030-05-10T11:00:00Z",
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.RoomUnavailable,
    },
  );

  assert.equal(repository.reservations.length, 0);
});

test("uses authenticated ownership even when extra owner fields are supplied", async () => {
  const { repository, createReservation } = createTestContext({
    authenticatedUser: {
      userId: "user-bruno",
      organizationId: "organization-b",
      role: UserRole.Member,
    },
  });

  // Extra runtime fields must not override the trusted identity.
  const request = {
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
    organizationId: "organization-spoofed",
    createdByUserId: "user-spoofed",
  };

  const result = await createReservation.execute(request);

  assert.equal(result.organizationId, "organization-b");
  assert.equal(result.createdByUserId, "user-bruno");
  assert.equal(repository.reservations.length, 1);
  assert.deepEqual(repository.reservations[0]?.toJSON(), result);
});

test("accepts a reservation starting at the current time", async () => {
  const { repository, createReservation } = createTestContext({
    currentTime: "2030-05-10T10:00:00Z",
  });

  const result = await createReservation.execute({
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  assert.equal(result.startAt, "2030-05-10T10:00:00.000Z");
  assert.equal(repository.reservations.length, 1);
});

test("rejects a conflict with another organization without exposing its owner", async () => {
  const { repository, createReservation } = createTestContext();
  const existingReservation = Reservation.create({
    id: "another-organization-reservation",
    roomId: "room-a",
    organizationId: "organization-b",
    createdByUserId: "user-bruno",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });
  await repository.save(existingReservation);
  const previousSnapshot = existingReservation.toJSON();

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-05-10T10:30:00Z",
        endAt: "2030-05-10T11:30:00Z",
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.Overlap,
      message: "The requested reservation time is unavailable.",
    },
  );

  assert.deepEqual(
    repository.reservations.map((reservation) => reservation.toJSON()),
    [previousSnapshot],
  );
});

test("creates a reservation in the time interval of a cancelled reservation", async () => {
  const { repository, createReservation } = createTestContext();
  const existingReservation = Reservation.create({
    id: "cancelled-reservation",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-ana",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });
  existingReservation.cancel();
  await repository.save(existingReservation);
  const cancelledSnapshot = existingReservation.toJSON();

  const result = await createReservation.execute({
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  assert.equal(result.status, ReservationStatus.Active);
  assert.deepEqual(
    repository.reservations.map((reservation) => reservation.toJSON()),
    [cancelledSnapshot, result],
  );
});

test("rejects regular reservation creation by a platform administrator", async () => {
  const { repository, createReservation } = createTestContext({
    authenticatedUser: {
      userId: "platform-admin-patricia",
      role: UserRole.PlatformAdmin,
    },
  });

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-05-10T10:00:00Z",
        endAt: "2030-05-10T11:00:00Z",
      }),
    {
      constructor: ReservationApplicationError,
      code: ReservationApplicationErrorCode.OrganizationAccountRequired,
    },
  );

  assert.equal(repository.reservations.length, 0);
});
