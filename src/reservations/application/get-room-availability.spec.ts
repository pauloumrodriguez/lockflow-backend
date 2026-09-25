import { strict as assert } from "node:assert";
import { test } from "node:test";
import { UserRole } from "../../authentication/application/authentication-context";
import { ReservationErrorCode } from "../domain/reservation";
import type { RoomScheduleQuery } from "../domain/room-availability";
import { GetRoomAvailability } from "./get-room-availability";
import { CreateReservation } from "./create-reservation";
import { CancelReservation } from "./cancel-reservation";
import { ReservationApplicationErrorCode } from "./reservation-application-error";
import {
  createDependencies,
  createStoredReservation,
  type TestContextOptions,
} from "./reservation.test-support";

const REQUEST = {
  roomId: "room-a",
  startAt: "2030-05-10T09:00:00Z",
  endAt: "2030-05-10T13:00:00Z",
  durationMinutes: 30,
};

function createContext(options: TestContextOptions = {}) {
  const dependencies = createDependencies(options);
  return {
    ...dependencies,
    useCase: new GetRoomAvailability({
      ...dependencies,
      schedule: dependencies.repository,
    }),
  };
}

/*
 * Here, availability observes active bookings from every organization while
 * exposing only free intervals. Workflow tests also show that cancellation frees
 * time and that a prior availability result never guarantees a later booking.
 */
for (const role of [UserRole.Member, UserRole.OrganizationAdmin]) {
  test(`returns private free-time results across organizations for ${role}`, async () => {
    const own = createStoredReservation();
    const foreign = createStoredReservation({
      id: "foreign",
      organizationId: "organization-b",
      createdByUserId: "bruno",
      startAt: "2030-05-10T11:00:00Z",
      endAt: "2030-05-10T12:00:00Z",
    });
    const cancelled = createStoredReservation({
      id: "cancelled",
      startAt: "2030-05-10T12:00:00Z",
      endAt: "2030-05-10T13:00:00Z",
    });
    cancelled.cancel();
    const otherRoom = createStoredReservation({
      id: "other-room",
      roomId: "room-b",
      startAt: REQUEST.startAt,
      endAt: REQUEST.endAt,
    });
    const { useCase } = createContext({
      reservations: [foreign, own, cancelled, otherRoom],
      authenticatedUser: {
        role,
        userId: "user-ana",
        organizationId: "organization-a",
      },
    });
    assert.deepEqual(await useCase.execute(REQUEST), [
      {
        startAt: "2030-05-10T09:00:00.000Z",
        endAt: "2030-05-10T10:00:00.000Z",
      },
      {
        startAt: "2030-05-10T12:00:00.000Z",
        endAt: "2030-05-10T13:00:00.000Z",
      },
    ]);
  });
}

test("passes a normalized room and window query without an organization filter", async () => {
  const dependencies = createDependencies();
  const queries: RoomScheduleQuery[] = [];
  const useCase = new GetRoomAvailability({
    ...dependencies,
    schedule: {
      async findBusyIntervals(query) {
        queries.push(query);
        return [];
      },
    },
  });
  await useCase.execute(REQUEST);
  assert.deepEqual(queries, [
    {
      roomId: "room-a",
      startAt: "2030-05-10T09:00:00.000Z",
      endAt: "2030-05-10T13:00:00.000Z",
    },
  ]);
});

test("rejects availability for a missing or inactive room before querying reservations", async () => {
  const dependencies = createDependencies({ reservableRoomIds: [] });
  let queries = 0;
  const useCase = new GetRoomAvailability({
    ...dependencies,
    schedule: {
      async findBusyIntervals() {
        queries += 1;
        return [];
      },
    },
  });
  await assert.rejects(() => useCase.execute(REQUEST), {
    code: ReservationApplicationErrorCode.RoomUnavailable,
  });
  assert.equal(queries, 0);
});

test("rejects platform administrators from the ordinary availability operation", async () => {
  const { useCase } = createContext({
    authenticatedUser: { role: UserRole.PlatformAdmin, userId: "patricia" },
  });
  await assert.rejects(() => useCase.execute(REQUEST), {
    code: ReservationApplicationErrorCode.OrganizationAccountRequired,
  });
});

test("rejects an invalid availability request before consulting the schedule", async () => {
  const dependencies = createDependencies();
  const useCase = new GetRoomAvailability({
    ...dependencies,
    schedule: {
      async findBusyIntervals() {
        assert.fail("Invalid input must not reach the schedule.");
      },
    },
  });
  await assert.rejects(
    () => useCase.execute({ ...REQUEST, endAt: REQUEST.startAt }),
    {
      code: ReservationErrorCode.InvalidTimeOrder,
    },
  );
});

test("cancelling a reservation makes its interval available again", async () => {
  const dependencies = createContext({
    reservations: [createStoredReservation()],
  });
  const cancel = new CancelReservation(dependencies);
  assert.equal((await dependencies.useCase.execute(REQUEST)).length, 2);
  await cancel.execute({ reservationId: "reservation-1" });
  assert.deepEqual(await dependencies.useCase.execute(REQUEST), [
    {
      startAt: "2030-05-10T09:00:00.000Z",
      endAt: "2030-05-10T13:00:00.000Z",
    },
  ]);
});

test("rejects booking when another reservation arrives after an availability query", async () => {
  const dependencies = createContext({ reservationId: "new-reservation" });
  assert.equal((await dependencies.useCase.execute(REQUEST)).length, 1);
  await dependencies.repository.save(
    createStoredReservation({
      id: "competing",
      organizationId: "organization-b",
    }),
  );
  const create = new CreateReservation(dependencies);
  await assert.rejects(
    () =>
      create.execute({
        roomId: "room-a",
        startAt: "2030-05-10T10:00:00Z",
        endAt: "2030-05-10T11:00:00Z",
      }),
    { code: ReservationApplicationErrorCode.Overlap },
  );
  assert.equal(dependencies.repository.reservations.length, 1);
});
