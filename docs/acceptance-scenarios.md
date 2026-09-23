# Acceptance Scenarios

This document describes observable examples of how LockFlow must behave.

The scenarios use the Given–When–Then format:

- **Given** describes the initial context;
- **When** describes the action;
- **Then** describes the expected result.

## 1. Authentication Scenarios

### AS-01 — Successful sign-in

**Given** Ana is an active member of Company A  
**And** Company A is active  
**When** Ana provides the correct organization, email, and password  
**Then** the system authenticates Ana as a member of Company A.

### AS-02 — Invalid password

**Given** Ana has an active account  
**When** she provides an incorrect password  
**Then** the system rejects the sign-in attempt  
**And** returns a generic invalid credentials message.

### AS-03 — Inactive user

**Given** Ana's account has been deactivated  
**When** she attempts to sign in or access a protected operation  
**Then** the system rejects the request.

### AS-04 — Inactive organization

**Given** Company A has been deactivated  
**When** one of its users attempts to sign in or access a protected operation  
**Then** the system rejects the request.

## 2. Member Scenarios

### AS-05 — Create a reservation

**Given** Ana is authenticated as a member of Company A  
**And** Room A is active and available from 10:00 to 11:00  
**When** Ana requests Room A from 10:00 to 11:00  
**Then** the system creates an active reservation  
**And** associates it with Ana and Company A.

### AS-06 — Reject an invalid time interval

**Given** Ana is authenticated  
**When** she requests a reservation starting at 11:00 and ending at 10:00  
**Then** the system rejects the request as an invalid time interval.

### AS-07 — Reject a reservation for an inactive room

**Given** Room A has been deactivated  
**When** Ana attempts to reserve Room A  
**Then** the system rejects the request.

### AS-08 — Reject an overlapping reservation from the same organization

**Given** Ana reserved Room A from 10:00 to 11:00  
**When** Bernardo, also from Company A, requests Room A from 10:30 to 11:30  
**Then** the system rejects Bernardo's reservation because the intervals overlap.

### AS-09 — Reject an overlapping reservation from another organization

**Given** Ana, from Company A, reserved Room A from 10:00 to 11:00  
**When** Carlos, from Company B, requests Room A from 10:30 to 11:30  
**Then** the system rejects Carlos's reservation because the intervals overlap  
**And** does not reveal Ana's identity or Company A.

### AS-10 — Allow adjacent reservations

**Given** Ana reserved Room A from 10:00 to 11:00  
**When** Carlos requests Room A from 11:00 to 12:00  
**Then** the system creates Carlos's reservation.

### AS-11 — List reservations from the same organization

**Given** Company A and Company B both have active reservations  
**When** Ana lists reservations  
**Then** she sees the active reservations from Company A  
**And** does not see reservations from Company B.

### AS-12 — Cancel a member's own reservation

**Given** Ana created an active reservation  
**When** Ana cancels it  
**Then** the reservation becomes cancelled  
**And** its historical record is preserved  
**And** the previous time interval becomes available.

### AS-13 — Reject cancellation of another member's reservation

**Given** Ana created an active reservation  
**When** Bernardo, another member of Company A, attempts to cancel it  
**Then** the system rejects the operation.

### AS-14 — Reschedule a member's own reservation

**Given** Ana has an active reservation  
**And** the requested new time does not conflict with another reservation  
**When** Ana reschedules her reservation  
**Then** the system updates its time interval.

### AS-15 — Reject a conflicting reschedule

**Given** Ana reserved Room A from 10:00 to 11:00  
**And** Room A has another reservation from 12:00 to 13:00  
**When** Ana attempts to reschedule her reservation to 12:30–13:30  
**Then** the system rejects the change  
**And** preserves Ana's original reservation interval.

## 3. Organization Administrator Scenarios

### AS-16 — Create a user within the same organization

**Given** Olivia is an administrator of Company A  
**When** she creates a valid user in Company A  
**Then** the system creates the user  
**And** associates the user with Company A.

### AS-17 — Reject management of another organization

**Given** Olivia is an administrator of Company A  
**When** she attempts to view, create, or deactivate users from Company B  
**Then** the system rejects the operation.

### AS-18 — Cancel a reservation from the same organization

**Given** Ana has an active reservation belonging to Company A  
**And** Olivia is an administrator of Company A  
**When** Olivia cancels Ana's reservation  
**Then** the reservation becomes cancelled  
**And** its time interval becomes available.

### AS-19 — Reschedule a reservation from the same organization

**Given** Ana has an active reservation belonging to Company A  
**And** the requested new time is available  
**When** Olivia reschedules Ana's reservation  
**Then** the system updates the reservation.

### AS-20 — Reject access to another organization's reservation

**Given** a reservation belongs to Company B  
**When** Olivia, an administrator of Company A, attempts to access, reschedule, or cancel it  
**Then** the system does not expose the reservation  
**And** rejects the operation.

### AS-21 — Reject self-deactivation

**Given** Olivia is authenticated as an organization administrator  
**When** she attempts to deactivate her own account  
**Then** the system rejects the operation.

## 4. Platform Administrator Scenarios

### AS-22 — Create an organization

**Given** Patricia is authenticated as a platform administrator  
**When** she creates an organization with a valid and unused identifier  
**Then** the system creates an active organization.

### AS-23 — Reject a duplicate organization

**Given** Company A is already registered  
**When** Patricia attempts to create another organization with the same identifier  
**Then** the system rejects the operation because of the conflict.

### AS-24 — Create a shared room

**Given** Patricia is authenticated as a platform administrator  
**When** she creates Room A with valid information  
**Then** the system creates an active room  
**And** makes it available to every organization.

### AS-25 — Reject a duplicate room

**Given** Room A is already registered  
**When** Patricia attempts to create another room with the same identifier  
**Then** the system rejects the operation because of the conflict.

### AS-26 — Reject room deactivation with future reservations

**Given** Room A has at least one future active reservation  
**When** Patricia attempts to deactivate Room A  
**Then** the system rejects the deactivation  
**And** does not automatically cancel any reservation.

### AS-27 — Deactivate a room without future reservations

**Given** Room A has no future active reservations  
**When** Patricia deactivates Room A  
**Then** the room becomes inactive  
**And** its historical data is preserved  
**And** it can no longer receive reservations.

### AS-28 — Reject organization deactivation with future reservations

**Given** Company A has at least one future active reservation  
**When** Patricia attempts to deactivate Company A  
**Then** the system rejects the deactivation  
**And** preserves its reservations.

### AS-29 — Deactivate an organization without future reservations

**Given** Company A has no future active reservations  
**When** Patricia deactivates Company A  
**Then** Company A becomes inactive  
**And** its users can no longer access protected operations  
**And** its historical data is preserved.

### AS-30 — Reject regular reservations from a platform account

**Given** Patricia is authenticated as a platform administrator  
**When** she attempts to create a regular room reservation  
**Then** the system rejects the operation.

## 5. Availability and Concurrency Scenarios

### AS-31 — Check availability without exposing private data

**Given** Room A is occupied from 10:00 to 11:00  
**When** an authenticated user checks its availability from 09:00 to 13:00 for a 30-minute reservation  
**Then** the system returns 09:00–10:00 and 11:00–13:00 as available intervals  
**And** does not reveal the existing reservation owner or organization.

### AS-32 — Availability changes after being checked

**Given** Ana checked a time interval and found it available  
**And** Carlos reserved that interval before Ana submitted her reservation  
**When** Ana attempts to reserve the same interval  
**Then** the system rejects her request because the room is no longer available.

### AS-33 — Simultaneous reservation attempts

**Given** Room A is available from 10:00 to 11:00  
**When** users from two organizations attempt to reserve it simultaneously  
**Then** only one reservation is confirmed  
**And** the other request is rejected because of the conflict.

### AS-34 — Cancellation makes the room available again

**Given** Ana reserved Room A from 10:00 to 11:00  
**And** Carlos's overlapping reservation attempt was rejected  
**When** Ana cancels her reservation  
**Then** Carlos can create a new reservation for that interval.

## 6. Final Product Decision Scenarios

### AS-35 — Reject a reservation in the past

**Given** Ana is authenticated  
**When** she requests a reservation whose start time is earlier than the current time  
**Then** the system rejects the request  
**And** does not create a reservation.

### AS-36 — Reject a reservation shorter than 15 minutes

**Given** Ana is authenticated  
**When** she requests an available room from 10:00 to 10:14  
**Then** the system rejects the request because it is shorter than the minimum duration.

### AS-37 — Accept the minimum reservation duration

**Given** Ana is authenticated  
**And** Room A is available from 10:00 to 10:15  
**When** Ana requests Room A for that interval  
**Then** the system creates the 15-minute reservation.

### AS-38 — Reject a reservation longer than 8 hours

**Given** Ana is authenticated  
**When** she requests an available room from 09:00 to 17:01  
**Then** the system rejects the request because it exceeds the maximum duration.

### AS-39 — Accept the maximum reservation duration

**Given** Ana is authenticated  
**And** Room A is available from 09:00 to 17:00  
**When** Ana requests Room A for that interval  
**Then** the system creates the 8-hour reservation.

### AS-40 — Reject a reservation more than 90 days in advance

**Given** Ana is authenticated  
**When** she requests a reservation starting more than 90 days after the current time  
**Then** the system rejects the request.

### AS-41 — Organization administrator creates another administrator

**Given** Olivia is an administrator of Company A  
**When** she creates a user with the `organization_admin` role in Company A  
**Then** the system creates the organization administrator  
**And** associates the new user with Company A.

### AS-42 — Organization administrator cannot create a platform administrator

**Given** Olivia is an administrator of Company A  
**When** she attempts to create a user with the `platform_admin` role  
**Then** the system rejects the operation.

### AS-43 — Platform administrator creates organization users

**Given** Patricia is authenticated as a platform administrator  
**When** she creates a member or organization administrator in Company A  
**Then** the system creates the user in Company A  
**And** assigns only the requested organization role.

### AS-44 — Platform administrator deactivates an organization user

**Given** a member or organization administrator belongs to Company A  
**And** Patricia is authenticated as a platform administrator  
**When** Patricia deactivates that user  
**Then** the user becomes inactive  
**And** the user's historical data is preserved.

### AS-45 — Platform administrator cannot create another platform administrator

**Given** Patricia is authenticated as a platform administrator  
**When** she attempts to create another user with the `platform_admin` role through regular user management  
**Then** the system rejects the operation.

### AS-46 — Reactivation is unavailable in the first version

**Given** a user, room, or organization has been deactivated  
**When** an administrator looks for a reactivation operation  
**Then** no such operation is available in the first version  
**And** the inactive record remains preserved.

## 7. Identifier Scenarios

### AS-47 — Reject an invalid room identifier

**Given** Ana is creating a reservation  
**When** she provides a room identifier containing spaces or uppercase letters  
**Then** the system rejects the reservation as invalid.
