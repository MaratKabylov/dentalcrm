# Phase 8 — Patient Experience

Phase 8 adds provider-neutral notifications and a patient-facing security boundary for portal access, public booking, digital intake, OCR confirmation, family access, and reviews.

## Security boundary

The patient portal does not reuse staff authentication or RBAC. A staff member with `portal.manage` creates an invitation after verifying an evidence reference. The invitation is single-use, expires, and is stored only as a SHA-256 hash. Exchanging it creates a separately hashed, expiring portal session.

Every accessible patient must have an explicit, non-revoked `portal_patient_links` row. Family and representative access additionally records the verified relationship in `legal_representative_links`; matching phone numbers never grant access. Portal responses expose only the linked patient's allowed summary and mask the account contact.

## Notifications

Message templates are immutable and versioned. Notification jobs snapshot rendered content, carry a correlation ID and an idempotency key, and retain provider delivery history. `MessagingProvider` is the adapter boundary for WhatsApp, SMS, email, push, or in-app implementations; domain services have no dependency on a vendor SDK. The worker can deliver through the provider-neutral `MESSAGING_WEBHOOK_URL`, uses exponential retry, and moves a job to `dead_letter` after five attempts. Outbound logs and events contain identifiers and status, not message bodies.

## Online booking

Staff configure `booking_rules` and publish slots. A slot is published only when it:

- is inside the configured horizon and notice period;
- aligns to the configured interval;
- fits entirely inside a doctor shift and outside breaks and unavailable exceptions;
- has no doctor, chair, appointment, reservation, or already-published-slot conflict.

The public API returns only published server-approved slots. Confirmation locks the slot, repeats the resource check, creates the appointment and request atomically, and relies on the appointment exclusion constraints as the final concurrency guard. `Idempotency-Key` is mandatory.

## Digital intake and OCR

Each intake link is an expiring, hashed capability bound to one patient and one immutable form version. Uploaded submissions can create an OCR job. Provider output is stored in immutable `ocr_results`, separate from the patient record. The patient must explicitly confirm accepted data, after which staff must review it and explicitly choose whether to apply the supported fields to the patient record. Confirmed OCR data cannot be modified in place.

## Reviews

Review requests are issued only for completed appointments. All ratings and comments are retained. Ratings of three or lower create a high-priority service-recovery task; the configured public-review destination remains visible in the public flow and is not selectively hidden.

## HTTP surface

Staff endpoints:

- `POST /api/v1/experience/message-templates`
- `POST /api/v1/experience/message-templates/:id/versions`
- `GET|POST /api/v1/experience/notifications`
- `POST /api/v1/experience/portal/invitations`
- `POST /api/v1/experience/booking/rules`
- `POST /api/v1/experience/booking/rules/:id/slots`
- `POST /api/v1/experience/intake/forms`
- `POST /api/v1/experience/intake/forms/:id/versions`
- `POST /api/v1/experience/intake/forms/:id/issues`
- `POST /api/v1/experience/intake/submissions/:id/ocr-result|review`
- `POST /api/v1/experience/reviews/destinations|requests`
- `GET /api/v1/experience/reviews/feedback`

Public and portal endpoints:

- `GET /api/v1/public/tenants/:tenantId/organizations/:organizationId/booking-slots`
- `POST /api/v1/public/tenants/:tenantId/organizations/:organizationId/bookings`
- `POST /api/v1/public/portal/sessions`
- `GET /api/v1/portal/me`
- `GET /api/v1/portal/patients/:patientId/summary`
- `POST /api/v1/portal/appointments/:id/cancel|reschedule`
- `GET|POST /api/v1/public/intake/:token`
- `GET /api/v1/public/intake/:token/ocr`
- `POST /api/v1/public/intake/:token/ocr/confirm`
- `GET|POST /api/v1/public/reviews/:token`

## Verification

`patient-experience.integration.test.ts` verifies idempotent booking and resource-conflict rejection, explicit verified family access, the OCR confirmation/review boundary, provider-neutral notification jobs, and service-recovery task creation.
