/*
 * Here, small contracts describe the external information booking needs.
 * Production adapters will supply active rooms, time, and unique identifiers;
 * tests can supply controlled values through the same interfaces.
 */
export interface RoomAvailability {
  isReservable(roomId: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(): string;
}
