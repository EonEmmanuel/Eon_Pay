# EonPay Device Policy Controller

Native Android Device Policy Controller for financed devices. The application is intended to be
provisioned as the Android **Device Owner** during out-of-box setup; installing the APK normally
does not grant the management authority it requires.

## Required deployment configuration

No backend address, signing key, certificate pin, Firebase project, or Play Integrity project is
embedded in this repository. Before producing a usable build, add these entries to the uncommitted
`local.properties` file (see `local.properties.example`):

```properties
DPC_BACKEND_BASE_URL=https://your-real-api-host/
DPC_POLICY_PUBLIC_KEY=base64-raw-Ed25519-public-key-or-PEM-body
DPC_API_CERT_PINS=sha256/primary-pin,sha256/backup-pin
DPC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER=123456789012
DPC_ALLOWED_PACKAGES=com.oem.dialer,com.oem.messaging,com.yourco.payment
DPC_FRP_ACCOUNT_IDS=google-people-api-numeric-user-id
```

`DPC_FRP_ACCOUNT_IDS` is optional. Each value must be the numeric Google `userId` returned in
`people/[userId]` by People API `people.get("people/me")`; an email address is not accepted by the
custom DPC API. When the list is empty, the agent does not override Android's consumer FRP policy.
Enterprise FRP authorizes recovery after an untrusted reset but does not reinstall the APK or
restore Device Owner enrollment.

The build accepts the same names as Gradle properties or environment variables. API construction
fails closed unless the URL is HTTPS and both a primary and backup `sha256/` certificate pin are
present.

For repeatable release signing, configure all four `DPC_RELEASE_STORE_FILE`,
`DPC_RELEASE_STORE_PASSWORD`, `DPC_RELEASE_KEY_ALIAS`, and `DPC_RELEASE_KEY_PASSWORD` values in
ignored `local.properties` or protected CI secrets. Partial signing configuration fails the Gradle
configuration instead of silently using the wrong identity. Preserve the keystore and passwords in
an offline recovery backup: Android upgrades must remain signed by the same key.

Place the production `google-services.json` at `app/google-services.json`. The Google Services and
Crashlytics Gradle plugins are applied only when that file exists, preventing an accidental build
against an invented Firebase project. The agent reports both its Firebase Installation ID and its
legacy registration token. FCM messages are wake-up hints only: the agent performs an authenticated
backend check-in and treats the resulting signed policy as authoritative.

## Backend enrollment protocol

The backend first reserves the contract's physical inventory unit and creates a short-lived,
one-time enrollment token. Device Owner provisioning passes the backend-issued device ID and token
through the admin extras bundle. On its first worker run, the DPC exchanges that token at
`POST /devices-mgmt/{deviceId}/enroll` for a separate long-lived device credential. Subsequent
heartbeats use `POST /devices-mgmt/{deviceId}/checkin`; queued commands are acknowledged through
`POST /devices-mgmt/{deviceId}/commands/{commandId}/ack`.

The backend stores only SHA-256 credential hashes, signs every policy with Ed25519, and prevents
contract activation until the selected IMEI has completed Device Owner enrollment and check-in.

## Policy token wire format

The verifier accepts the following Ed25519-signed forms:

- `base64url(payload JSON).base64url(signature)`, where the decoded payload bytes are signed.
- Compact JWS `header.payload.signature`, where ASCII `header.payload` is signed.
- JSON envelope `{"payload":"base64url(...)","signature":"base64url(...)"}`, where the decoded
  payload bytes are signed.

The payload must contain `deviceId`, `tenantId`, `policyTier`, `amountDue`, `daysOverdue`,
`brandingConfig`, `issuedAt`, and `expiresAt`. It should also contain a non-negative, monotonically
increasing `policyVersion`. Timestamps may be ISO-8601 strings or Unix seconds / milliseconds
encoded as JSON strings. The backend team should confirm which accepted wire form is canonical
before production rollout.

`policyVersion` prevents a correctly signed but older token from replacing a newer cached policy.
For migration, two legacy tokens without a version are ordered by `issuedAt`. After a versioned
token is cached, unversioned tokens are rejected.

## Provisioning extras

The QR/NFC provisioning payload must name
`com.eonpay.deviceagent/.admin.FinanceDeviceAdminReceiver` as the admin component and include:

```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.eonpay.deviceagent/.admin.FinanceDeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://your-controlled-download-location/dpc.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "your-apk-signature-checksum",
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    "deviceId": "backend-issued-device-id",
    "enrollmentCredential": "single-device-enrollment-credential"
  }
}
```

The enrollment credential and all cached signed policy material are encrypted with an AES-GCM key
held by Android Keystore in device-protected storage. Cloud backup and device-transfer backup are
disabled.

## Enforcement behavior

- Baseline: factory reset and safe boot are disallowed, and uninstall is blocked for the DPC.
- `active`: kiosk restrictions and warnings are removed.
- `warning`: a public lock-screen-visible foreground notification is maintained.
- `soft_lock`: the DPC becomes the persistent HOME activity and enters lock task with only this
  package plus explicitly configured dialer, SMS, and payment packages.
- `hard_lock`: `LockScreenActivity` becomes the lock-task foreground. Its state is always rendered
  from the cached, re-verified signed token.
- Before Device Owner enrollment is recorded, absent policy state is `Unenrolled` and does not
  trigger restrictions. After enrollment, missing or invalid policy fails closed to `soft_lock`.
- Expired token: when a signed offline policy and a successful check-in exist, the last signed tier
  remains effective only until the signed offline deadline. Without that safe grace context, expiry
  falls back to `soft_lock`. WorkManager and the boot receiver re-evaluate both deadlines.
- Offline timeout: the backend signs an offline grace period. A separate network-independent
  WorkManager guard applies only a recoverable `soft_lock`; it never mutates the signed payload or
  converts an offline device into a locally invented hard lock.
- Soft and hard lock screens keep internet settings, payment, support, emergency calling, and
  authenticated status refresh paths available. A signed `active` policy immediately exits lock
  task. The backend `release` command creates an explicit signed-policy override, so support can
  recover a device even when its contract-derived state would otherwise remain hard locked.

The periodic check-in cadence is 15 minutes, Android's WorkManager minimum. FCM data messages and
expedited one-time check-ins provide the near-live path.

## Build

Open the directory in Android Studio with JDK 17 and Android SDK 35 installed, or run:

```text
gradlew.bat :app:assembleDebug
```

An APK installed outside Device Owner provisioning is useful only for UI development. Use a
factory-reset test device or Android's supported test provisioning commands for policy QA.

## Backend production configuration

The server must use the matching Ed25519 private key and the final signed APK:

```text
DPC_POLICY_PRIVATE_KEY_BASE64=base64-pkcs8-ed25519-private-key
DPC_APK_DOWNLOAD_URL=https://controlled-host/eonpay-device-agent.apk
DPC_APK_SIGNATURE_CHECKSUM=android-provisioning-signature-checksum
DPC_POLICY_TTL_MINUTES=360
DPC_OFFLINE_GRACE_HOURS=48
FIREBASE_SERVICE_ACCOUNT_BASE64=base64-firebase-service-account-json
PLAY_INTEGRITY_ENABLED=true
PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64=base64-play-integrity-service-account-json
DPC_ANDROID_PACKAGE_NAME=com.eonpay.deviceagent
```

The FCM service account needs only permission to send messages. The Play Integrity account needs
permission to decode integrity tokens. Keep both JSON files out of Git and store only their Base64
representations in the protected server environment.

## Production prerequisites

- Replace the application ID / namespace if `com.eonpay.deviceagent` is not the final package.
- Confirm the backend authorization header and enrollment credential lifecycle.
- Confirm the signed-token wire form and branding schema, and issue a monotonic `policyVersion`
  for every device policy.
- Supply a payment-app package and deep link in signed tenant branding. A Mobile Money push flow
  cannot be invented client-side because no payment-initiation endpoint was included in the backend
  contract.
- Validate all explicitly allowed OEM package names before enrollment.
- Complete `qa/DEVICE_POLICY_QA.md` on representative production hardware.
