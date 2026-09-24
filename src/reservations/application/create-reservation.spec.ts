import { strict as assert } from "node:assert";
import { test } from "node:test";

import { Reservation } from "../domain/reservation";
import {
  Clock,
  CreateReservation,
  CreateReservationError,
  CreateReservationErrorCode,
  IdGenerator,
  ReservationRepository,
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

test("creates and saves a valid reservation", async () => {
  const repository = new InMemoryReservationRepository();

  const createReservation = new CreateReservation({
    repository,
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
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  await repository.save(existingReservation);

  const createReservation = new CreateReservation({
    repository,
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
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  await repository.save(existingReservation);

  const createReservation = new CreateReservation({
    repository,
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
