import { strict as assert } from "node:assert";
import { test } from "node:test";

import { Reservation, ReservationStatus } from "../domain/reservation";
import {
  AuthenticatedUser,
  AuthenticationContext,
  Clock,
  CreateReservation,
  CreateReservationError,
  CreateReservationErrorCode,
  IdGenerator,
  ReservationRepository,
  RoomAvailability,
} from "./create-reservation";

class InMemoryReservationRepository implements ReservationRepository {
  readonly reservations: Reservation[] = [];

  async hasOverlap(reservation: Reservation): Promise<boolean> {
    return this.reservations.some((savedReservation) =>
      savedReservation.overlaps(reservation),
    );
  }

  async save(reservation: Reservation): Promise<void> {
    this.reservations.push(reservation);
  }
}

class InMemoryRoomAvailability implements RoomAvailability {
  constructor(private readonly reservableRoomIds: ReadonlySet<string>) {}

  async isReservable(roomId: string): Promise<boolean> {
    return this.reservableRoomIds.has(roomId);
  }
}

const AUTHENTICATED_USER: AuthenticatedUser = {
  userId: "user-ana",
  organizationId: "organization-a",
};

class FixedAuthenticationContext implements AuthenticationContext {
  constructor(private readonly authenticatedUser: AuthenticatedUser) {}

  getAuthenticatedUser(): AuthenticatedUser {
    return { ...this.authenticatedUser };
  }
}

function createAuthenticationContext(): AuthenticationContext {
  return new FixedAuthenticationContext(AUTHENTICATED_USER);
}

class FixedClock implements Clock {
  constructor(private readonly currentTime: Date) {}

  now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

class FixedIdGenerator implements IdGenerator {
  constructor(private readonly id: string) {}

  generate(): string {
    return this.id;
  }
}

test("creates and saves a reservation for the authenticated user and organization", async () => {
  const repository = new InMemoryReservationRepository();

  const createReservation = new CreateReservation({
    repository,
    roomAvailability: new InMemoryRoomAvailability(new Set(["room-a"])),
    authenticationContext: createAuthenticationContext(),
    clock: new FixedClock(new Date("2030-05-01T09:00:00Z")),
    idGenerator: new FixedIdGenerator("reservation-1"),
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
  const repository = new InMemoryReservationRepository();

  const createReservation = new CreateReservation({
    repository,
    roomAvailability: new InMemoryRoomAvailability(new Set(["room-a"])),
    authenticationContext: createAuthenticationContext(),
    clock: new FixedClock(new Date("2030-05-10T10:00:00Z")),
    idGenerator: new FixedIdGenerator("reservation-2"),
  });

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-05-10T09:00:00Z",
        endAt: "2030-05-10T10:00:00Z",
      }),
    {
      constructor: CreateReservationError,
      code: CreateReservationErrorCode.StartInPast,
    },
  );

  assert.equal(repository.reservations.length, 0);
});

test("rejects a reservation more than 90 days in advance", async () => {
  const repository = new InMemoryReservationRepository();

  const createReservation = new CreateReservation({
    repository,
    roomAvailability: new InMemoryRoomAvailability(new Set(["room-a"])),
    authenticationContext: createAuthenticationContext(),
    clock: new FixedClock(new Date("2030-05-01T10:00:00Z")),
    idGenerator: new FixedIdGenerator("reservation-3"),
  });

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-07-30T10:00:01Z",
        endAt: "2030-07-30T11:00:01Z",
      }),
    {
      constructor: CreateReservationError,
      code: CreateReservationErrorCode.StartTooFarInAdvance,
    },
  );

  assert.equal(repository.reservations.length, 0);
});

test("accepts a reservation exactly 90 days in advance", async () => {
  const repository = new InMemoryReservationRepository();

  const createReservation = new CreateReservation({
    repository,
    roomAvailability: new InMemoryRoomAvailability(new Set(["room-a"])),
    authenticationContext: createAuthenticationContext(),
    clock: new FixedClock(new Date("2030-05-01T10:00:00Z")),
    idGenerator: new FixedIdGenerator("reservation-4"),
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
  const repository = new InMemoryReservationRepository();

  const existingReservation = Reservation.create({
    id: "existing-reservation",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-existing",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  await repository.save(existingReservation);

  const createReservation = new CreateReservation({
    repository,
    roomAvailability: new InMemoryRoomAvailability(new Set(["room-a"])),
    authenticationContext: createAuthenticationContext(),
    clock: new FixedClock(new Date("2030-05-01T10:00:00Z")),
    idGenerator: new FixedIdGenerator("reservation-5"),
  });

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-05-10T10:30:00Z",
        endAt: "2030-05-10T11:30:00Z",
      }),
    {
      constructor: CreateReservationError,
      code: CreateReservationErrorCode.Overlap,
    },
  );

  assert.equal(repository.reservations.length, 1);
});

test("allows an adjacent reservation in the same room", async () => {
  const repository = new InMemoryReservationRepository();

  const existingReservation = Reservation.create({
    id: "existing-reservation",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-existing",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  await repository.save(existingReservation);

  const createReservation = new CreateReservation({
    repository,
    roomAvailability: new InMemoryRoomAvailability(new Set(["room-a"])),
    authenticationContext: createAuthenticationContext(),
    clock: new FixedClock(new Date("2030-05-01T10:00:00Z")),
    idGenerator: new FixedIdGenerator("reservation-6"),
  });

  const result = await createReservation.execute({
    roomId: "room-a",
    startAt: "2030-05-10T11:00:00Z",
    endAt: "2030-05-10T12:00:00Z",
  });

  assert.equal(result.id, "reservation-6");
  assert.equal(repository.reservations.length, 2);
});

test("rejects a reservation when the room is unavailable", async () => {
  const repository = new InMemoryReservationRepository();

  const createReservation = new CreateReservation({
    repository,
    roomAvailability: new InMemoryRoomAvailability(new Set()),
    authenticationContext: createAuthenticationContext(),
    clock: new FixedClock(new Date("2030-05-01T10:00:00Z")),
    idGenerator: new FixedIdGenerator("reservation-7"),
  });

  await assert.rejects(
    () =>
      createReservation.execute({
        roomId: "room-a",
        startAt: "2030-05-10T10:00:00Z",
        endAt: "2030-05-10T11:00:00Z",
      }),
    {
      constructor: CreateReservationError,
      code: CreateReservationErrorCode.RoomUnavailable,
    },
  );

  assert.equal(repository.reservations.length, 0);
});
