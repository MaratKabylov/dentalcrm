-- A completed or cancelled recall may retain the appointment that originally satisfied it.
ALTER TABLE recalls DROP CONSTRAINT recalls_check;
ALTER TABLE recalls ADD CONSTRAINT recalls_booked_appointment_required
  CHECK(status<>'booked' OR booked_appointment_id IS NOT NULL);
