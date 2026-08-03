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
```

The build accepts the same names as Gradle properties or environment variables. API construction
fails closed unless the URL is HTTPS and both a primary and backup `sha256/` certificate pin are
present.

Place the production `google-services.json` at `app/google-services.json`. The Google Services and
Crashlytics Gradle plugins are applied only when that file exists, preventing an accidental build
against an invented Firebase project.

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
- Expired token: the local repository changes the effective tier to `soft_lock`; a one-time
  WorkManager expiry guard and boot receiver reassert it even without a network.

The periodic check-in cadence is 15 minutes, Android's WorkManager minimum. FCM data messages and
expedited one-time check-ins provide the near-live path.

## Build

Open the directory in Android Studio with JDK 17 and Android SDK 35 installed, or run:

```text
gradlew.bat :app:assembleDebug
```

An APK installed outside Device Owner provisioning is useful only for UI development. Use a
factory-reset test device or Android's supported test provisioning commands for policy QA.

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
