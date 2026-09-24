import type { Reservation } from "../domain/reservation";

/*
 * Here, application use cases share a domain-oriented persistence contract.
 * Implementations return Reservation entities so callers can ask the entity to
 * perform behavior instead of rebuilding business rules from database records.
 */
export interface ReservationRepository {
  findById(id: string): Promise<Reservation | null>;
  hasOverlap(reservation: Reservation): Promise<boolean>;
  save(reservation: Reservation): Promise<void>;
}
