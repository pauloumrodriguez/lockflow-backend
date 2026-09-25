import type { AuthenticationContext } from "../../authentication/application/authentication-context";
import {
  RoomAvailabilityWindow,
  type RoomAvailabilityRequest,
  type TimeIntervalSnapshot,
} from "../domain/room-availability";
import { requireOrganizationUser } from "./reservation-access";
import { ensureRoomIsReservable } from "./reservation-booking-policy";
import type { RoomScheduleReader } from "./reservation-repository";
import type { RoomAvailability } from "./reservation-services";

export interface GetRoomAvailabilityDependencies {
  readonly schedule: RoomScheduleReader;
  readonly roomAvailability: RoomAvailability;
  readonly authenticationContext: AuthenticationContext;
}

/*
 * Here, an organization user asks for free time in an active shared room.
 * The reader supplies only occupied intervals across all organizations, and the
 * domain calculates the gaps. Availability is informative; booking checks again.
 */
export class GetRoomAvailability {
  constructor(private readonly dependencies: GetRoomAvailabilityDependencies) {}

  async execute(
    request: RoomAvailabilityRequest,
  ): Promise<readonly TimeIntervalSnapshot[]> {
    requireOrganizationUser(
      this.dependencies.authenticationContext.getAuthenticatedUser(),
    );
    const window = RoomAvailabilityWindow.create(request);
    await ensureRoomIsReservable(
      this.dependencies.roomAvailability,
      request.roomId,
    );
    const busyIntervals = await this.dependencies.schedule.findBusyIntervals(
      window.toQuery(),
    );
    return window.findFreeIntervals(busyIntervals);
  }
}
