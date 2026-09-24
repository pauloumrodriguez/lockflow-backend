import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  InvalidReservationError,
  Reservation,
  ReservationErrorCode,
  ReservationStatus,
} from "../domain/reservation";
import {
  CancelReservation,
  CancelReservationError,
  CancelReservationErrorCode,
} from "./cancel-reservation";
import type { ReservationRepository } from "./reservation-repository";

/*
 * Here, the in-memory repository behaves like persistence while keeping each
 * scenario isolated. Saving replaces an existing entity with the same ID,
 * which makes cancellation an update rather than a second reservation.
 */
class InMemoryReservationRepository implements ReservationRepository {
  readonly reservations: Reservation[];
  saveCalls = 0;

  constructor(initialReservations: readonly Reservation[] = []) {
    this.reservations = [...initialReservations];
  }

  async findById(id: string): Promise<Reservation | null> {
    return (
      this.reservations.find((reservation) => reservation.id === id) ?? null
    );
  }

  async hasOverlap(reservation: Reservation): Promise<boolean> {
    return this.reservations.some((savedReservation) =>
      savedReservation.overlaps(reservation),
    );
  }

  async save(reservation: Reservation): Promise<void> {
    this.saveCalls += 1;
    const savedIndex = this.reservations.findIndex(
      (savedReservation) => savedReservation.id === reservation.id,
    );

    if (savedIndex === -1) {
      this.reservations.push(reservation);
      return;
    }

    this.reservations[savedIndex] = reservation;
  }
}

function createReservation(id = "reservation-1"): Reservation {
  return Reservation.create({
    id,
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-ana",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });
}

/*
 * These scenarios follow cancellation through lookup, domain behavior, and
 * persistence. Failed operations never ask the repository to save a new state.
 */
test("cancels and saves an active reservation", async () => {
  const reservation = createReservation();
  const repository = new InMemoryReservationRepository([reservation]);
  const cancelReservation = new CancelReservation(repository);

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
  const cancelReservation = new CancelReservation(repository);

  await assert.rejects(
    () =>
      cancelReservation.execute({
        reservationId: "missing-reservation",
      }),
    {
      constructor: CancelReservationError,
      code: CancelReservationErrorCode.NotFound,
    },
  );

  assert.equal(repository.saveCalls, 0);
});

test("rejects cancellation when the reservation is already cancelled", async () => {
  const reservation = createReservation();
  reservation.cancel();
  const repository = new InMemoryReservationRepository([reservation]);
  const cancelReservation = new CancelReservation(repository);

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
