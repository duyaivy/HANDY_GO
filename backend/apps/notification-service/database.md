// HandyGo Notification Service — DBML (v1)
// Based on the Notification Service schema agreed in conversation.
// [NEW]: new field/table/enum; [CHANGED]: changed from original; [REMOVED]: removed from original.

Project handygo_notification_service {
database_type: 'PostgreSQL'
}

// [CHANGED] Only push, in-app and email; SMS is not supported.
Enum notification_channel {
push
in_app
email
}

// Aggregate status of a notification across requested delivery channels.
Enum notification_status {
queued
processing
sent
partially_sent
failed
cancelled
}

// [CHANGED] Track per-attempt processing explicitly.
Enum delivery_status {
queued
processing
sent
delivered
failed
opened
}

// [NEW] Business category for filtering/routing.
Enum notification_category {
request
matching
bidding
proposal
order
payment
wallet
system
}

// [NEW] Device platform.
Enum device_platform {
android
ios
web
}

// [CHANGED] Registered push tokens (FCM or compatible provider).
Table device_tokens {
id uuid [pk]
user_id uuid [not null, note: 'Logical reference -> User & Trust Service.users.id']
platform device_platform [not null]
device_id varchar(255)
push_token text [not null, unique]
provider varchar(50) [not null, default: 'fcm'] // [NEW]
is_active boolean [not null, default: true]
last_seen_at timestamptz
created_at timestamptz [not null]
updated_at timestamptz [not null]

indexes {
(user_id, is_active)
(user_id, device_id)
}
}

// [NEW] Per-user delivery preferences.
Table notification_preferences {
id uuid [pk]
user_id uuid [not null, unique, note: 'Logical reference -> User & Trust Service.users.id']
push_enabled boolean [not null, default: true]
in_app_enabled boolean [not null, default: true]
email_enabled boolean [not null, default: false]
created_at timestamptz [not null]
updated_at timestamptz [not null]
}

// [CHANGED] One notification for one recipient and one business event.
Table notifications {
id uuid [pk]
recipient_user_id uuid [not null, note: 'Logical reference -> User & Trust Service.users.id']
source_event_id uuid [not null] // [NEW] RabbitMQ event ID; one event may notify multiple users.
event_type varchar(100) [not null]
category notification_category [not null] // [NEW]
source_service varchar(80) [not null]
source_entity_id uuid
service_request_id uuid // [NEW] Logical reference -> Order Service.service_requests.id
dedupe_key varchar(255) [not null, unique] // [NEW] One logical notification per recipient/business event.
title varchar(300) [not null]
body text [not null]
payload jsonb // Navigation hints/minimal extra details; avoid sensitive content.
status notification_status [not null, default: 'queued']
read_at timestamptz // In-app read marker, separate from provider delivery.
scheduled_at timestamptz // [NEW] Optional send time.
created_at timestamptz [not null]
updated_at timestamptz [not null] // [NEW]

indexes {
(recipient_user_id, created_at)
(recipient_user_id, read_at, created_at)
(source_event_id)
(service_request_id, created_at)
(status, scheduled_at)
}
}

// [CHANGED] Track each channel/device attempt separately.
Table notification_delivery_attempts {
id uuid [pk]
notification_id uuid [not null]
channel notification_channel [not null]
device_token_id uuid // Nullable for email and in-app channels.
attempt_no int [not null, default: 1] // [NEW]
delivery_attempt_key varchar(255) [not null, unique] // [NEW] notification:channel:target:attemptNo
provider varchar(50) // fcm, smtp, email provider, etc.
provider_message_id varchar(255)
status delivery_status [not null, default: 'queued']
error_message text
next_retry_at timestamptz // [NEW]
attempted_at timestamptz
delivered_at timestamptz
opened_at timestamptz // [NEW]
created_at timestamptz [not null]

indexes {
(notification_id, channel)
(status, next_retry_at)
(device_token_id, created_at)
}
}

// [NEW] Dedup incoming RabbitMQ events.
Table consumed_events {
event_id uuid [pk]
event_type varchar(100) [not null]
consumed_at timestamptz [not null]
}

// [NEW] Publish notification.created to Gateway/WebSocket after DB commit.
Table outbox_events {
id uuid [pk]
aggregate_type varchar(50) [not null]
aggregate_id uuid [not null]
event_type varchar(100) [not null]
payload jsonb [not null]
created_at timestamptz [not null]
published_at timestamptz
publish_attempts int [not null, default: 0]

indexes {
(published_at, created_at)
}
}

Ref: notifications.id < notification_delivery_attempts.notification_id
Ref: device_tokens.id < notification_delivery_attempts.device_token_id

// [REMOVED] notification_channel.sms
// All cross-service IDs are logical references; do not add cross-DB foreign keys.
// Important implementation guards (in migration/application code):
// - Use idempotency (source_event_id, dedupe_key) for RabbitMQ retries/fan-out.
// - For delivery attempts, ensure attempt_no >= 1 and validate channel/device consistency.
// - FCM/email provider 'sent' does not guarantee 'delivered' or 'opened'.
// - Ensure only authorized users may view/read their own notifications.
