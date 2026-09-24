# Business Rules

This document defines the expected behavior of the LockFlow reservation system independently of implementation details.

These rules describe the intended product, including features planned for later stages. Stage 2 implements the reservation domain checks described in the [README](../README.md#current-status); it does not implement every rule below.

## 1. Core Concepts

### Organization

An organization represents a company that uses the platform. Each organization has its own users and reservations.

### User

Members and organization administrators belong to one organization. Platform administrators use a platform-level account. Each user's role determines which actions they can perform.

### Room

A room is a physical resource shared by every organization registered on the platform. Rooms do not belong to individual organizations.

### Reservation

A reservation assigns a room to an organization and a user for a specific time interval. A reservation can be either active or cancelled.

## 2. User Roles

LockFlow has three user roles:

- `member`;
- `organization_admin`;
- `platform_admin`.

### Member

A member can:

- view active rooms;
- check room availability;
- create reservations;
- view active reservations from their organization;
- reschedule their own reservations;
- cancel their own reservations.

A member cannot:

- access users or reservations from another organization;
- reschedule or cancel another member's reservation;
- manage users, organizations, or rooms.

### Organization Administrator

An organization administrator can perform all member actions. They can also:

- view users from their organization;
- create users within their organization;
- deactivate users within their organization;
- reschedule any reservation from their organization;
- cancel any reservation from their organization.

An organization administrator cannot:

- manage another organization;
- access private data from another organization;
- create or deactivate global rooms;
- create or deactivate organizations.

### Platform Administrator

A platform administrator can:

- create and view organizations;
- deactivate organizations;
- create and view rooms;
- deactivate rooms;
- create and view members and organization administrators in any organization;
- deactivate members and organization administrators in any organization;
- view future reservations affected by an administrative action;
- explicitly cancel a reservation when required for an administrative operation.

A platform administrator does not create regular room reservations using the platform administration account. They also cannot create another `platform_admin` through regular user management operations.

## 3. Reservation Rules

### BR-01 — A reservation must have a valid time interval

The reservation start time must be earlier than its end time. A reservation whose start and end times are equal is invalid.

### BR-02 — Reservations use UTC

Reservation times must be represented in UTC using the ISO 8601 format, such as `2030-05-10T10:00:00Z`.

Accepted timestamps include seconds and end with `Z`. Fractional seconds are optional and may contain one to three digits. Dates must exist in the calendar. Serialized timestamps use three fractional digits, such as `2030-05-10T10:00:00.000Z`.

Clients may display local time, but they must convert it to UTC before sending it to the backend.

### BR-03 — Only active rooms can be reserved

A reservation can only be created for a room that exists and is active.

### BR-04 — Active reservations cannot overlap

A room cannot have two active reservations with overlapping time intervals. This rule applies across all organizations because rooms are globally shared.

For reservations A and B, an overlap exists when:

```text
startA < endB AND startB < endA
```

### BR-05 — Adjacent reservations are allowed

Two reservations may touch at their boundaries without overlapping. For example, `10:00–11:00` and `11:00–12:00` are both allowed.

### BR-06 — Reservation creation must be confirmed atomically

Checking availability does not guarantee that the room will remain available. Another user may reserve the room between the availability check and the reservation request.

When multiple users try to reserve the same room and time simultaneously, only one reservation may be accepted.

### BR-07 — A reservation belongs to an organization and a creator

The reservation organization and creator must come from the authenticated user's identity. Clients cannot choose the owner by sending a user ID or organization ID in the request.

### BR-08 — Members can modify only their own reservations

A member can reschedule or cancel only reservations they created.

### BR-09 — Organization administrators can manage reservations from their organization

An organization administrator can reschedule or cancel any reservation belonging to their organization. They cannot manage reservations belonging to another organization.

### BR-10 — Platform administrators cannot create regular reservations

A platform administrator account is intended for platform management. Regular reservations must be created through an account belonging to an organization.

## 4. Organization Data Isolation

### BR-11 — Organizations can access only their own private data

Members and organization administrators can access only the users and reservations belonging to their organization, subject to their role permissions. Platform administrators have the cross-organization access explicitly listed under their role.

### BR-12 — Reservation conflicts must not expose private data

A reservation from another organization can block a room without exposing:

- the reservation owner;
- the organization;
- private reservation details.

The system may report that the requested time is unavailable.

### BR-13 — Availability results contain no ownership information

Room availability results must contain only available time intervals. They must not reveal which users or organizations created existing reservations.

## 5. Reservation Lifecycle

### BR-14 — Cancelling a reservation preserves its history

Cancelling a reservation changes its status from active to cancelled. The reservation must not be physically deleted.

### BR-15 — Cancelled reservations do not block rooms

After a reservation is cancelled, its previous time interval becomes available for new reservations.

### BR-16 — Only active reservations can be rescheduled or cancelled

An already cancelled reservation cannot be rescheduled or cancelled again as an active reservation.

### BR-17 — Rescheduling must respect conflict rules

The new interval must not overlap another active reservation for the same room. If it is invalid or unavailable, the original reservation must remain unchanged.

## 6. Authentication and Account Status

### BR-18 — Only authenticated users can access protected operations

Room, reservation, user, and organization operations require an authenticated identity. Authentication itself is the exception.

### BR-19 — Inactive users cannot access the system

An inactive user cannot sign in or continue performing protected operations.

### BR-20 — Users from inactive organizations cannot access the system

When an organization becomes inactive, its users can no longer access protected operations.

## 7. Deactivation Rules

### BR-21 — Deactivation preserves historical data

Users, organizations, and rooms must be deactivated instead of physically deleted.

### BR-22 — A user cannot deactivate their own account

An authenticated administrator cannot deactivate their own account through the user management operation.

### BR-23 — A room with future active reservations cannot be deactivated

Before deactivating a room, all future active reservations for that room must be resolved explicitly. The system must not cancel them automatically.

### BR-24 — An organization with future active reservations cannot be deactivated

Before deactivating an organization, its future active reservations must be resolved explicitly.

### BR-25 — Deactivated rooms cannot receive new reservations

Historical reservations remain stored, but no new reservation can be created for an inactive room.

## 8. Availability Rules

### BR-26 — Availability is calculated for a specific room and time window

An availability request must specify:

- a room;
- the beginning of the search window;
- the end of the search window;
- the desired reservation duration.

### BR-27 — Availability returns intervals that fit the requested duration

The system returns free intervals that are long enough for the requested duration.

For example, if a room is free from 11:00 to 13:00, this entire interval may be returned for a requested duration of 30 minutes. The system does not need to divide it into individual 30-minute slots.

## 9. Initial Project Scope

The first version will not include:

- recurring reservations;
- payment processing;
- email or push notifications;
- external calendar integration;
- room equipment management;
- room capacity management;
- physical deletion of historical records;
- reactivation of users, rooms, or organizations;
- a web interface.

## 10. Final Product Decisions

### BR-28 — Reservations in the past are not allowed

A new or rescheduled reservation cannot start earlier than the current time.

Historical reservations remain stored, but they cannot be created retroactively.

### BR-29 — The minimum reservation duration is 15 minutes

A reservation must last at least 15 minutes.

### BR-30 — The maximum reservation duration is 8 hours

A reservation cannot last longer than 8 hours.

### BR-31 — Reservations can be created up to 90 days in advance

A new or rescheduled reservation cannot start more than 90 days after the time at which the operation is requested.

### BR-32 — Organization administrators can create other organization administrators

An organization administrator can create users with the `member` or `organization_admin` role within their own organization.

They cannot create a `platform_admin` or create users in another organization.

### BR-33 — Platform administrators can manage users from any organization

A platform administrator can create and deactivate users with the `member` or `organization_admin` role in any organization.

Users are deactivated rather than physically deleted so that historical ownership and audit information remain available.

A platform administrator cannot create another `platform_admin` through regular user management operations. Platform administrator provisioning requires a separate administrative process outside the scope of the first version.

### BR-34 — Reactivation is outside the scope of the first version

The first version does not provide operations to reactivate users, rooms, or organizations after they have been deactivated.

## 11. Identifier Rules

### BR-35 — Room identifiers must use a stable URL-safe format

A room identifier must contain between 1 and 40 characters.

It may contain only:

- lowercase letters from `a` to `z`;
- numbers from `0` to `9`;
- hyphens.

Examples of valid identifiers:

- `room-a`;
- `meeting-room-1`;
- `room-123`.

Examples of invalid identifiers:

- `Room A`;
- `room_a`;
- `room!`;
- an empty identifier;
- an identifier longer than 40 characters.
