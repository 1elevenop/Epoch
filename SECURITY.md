# Security policy

## Supported versions

Only the latest release on the GitHub Releases page gets fixes.

## Reporting a problem

Please do not open a public issue for a security problem. Use GitHub's private reporting instead: on the repository page, open **Security → Report a vulnerability**. Include the Epoch version (Settings, bottom of the page), your phone model and Android version, and the steps to reproduce.

You should get an answer within a week. Once a fix is released, the report can be made public.

## Scope

Epoch has no internet permission, no server and no account, so most web-style attacks do not apply. Relevant problems include:

- A crafted backup file that the import accepts or that crashes the app
- Another app on the phone triggering Epoch's alarms, receivers or deep links
- Alarms that can be silenced or skipped without solving the challenge
- Personal data stored or logged where other apps could read it

## Verifying the APK

Every release lists the SHA-256 checksum of each APK and the fingerprint of the signing certificate. Updates are only accepted by Android when they are signed with the same key, so a matching fingerprint means the APK comes from this repository.
