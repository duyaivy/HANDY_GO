# Chat media compression implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement in this session.

**Goal:** Reduce chat image/video upload bytes on mobile, then commit on the current feature branch.

**Architecture:** Prepare media before the existing upload helper; use Expo image manipulation and native video compression. Keep private signing and verification unchanged.

**Tech Stack:** Expo 54, expo-image-manipulator, expo-file-system, react-native-compressor, Jest.

**Spec:** ../specs/2026-11-09-chat-media-compression-design.md

## Global constraints

Chat only; images 1600 px/JPEG 0.8, videos over 5 MiB at 1280 px/2 Mbps; preserve smaller originals, cancellation and private upload contracts.

## Review focus

Oversized outputs, transparent images, portrait dimensions, cancellation during codecs, and cleanup after upload failures need explicit tests.

## Task 1: Prepare and upload optimized media

- [x] Add dependencies and native plugin configuration.
- [x] Write failing `chat-media-preparation.test.ts` covering image resize, no enlargement, smaller originals, transparent inputs, video thresholds/output metadata, cancellation and output cleanup.
- [x] Run Jest and confirm failures before implementing `prepareChatMedia(asset, signal, onProgress)` in `mobile/src/features/chat/chat-media-preparation.ts`; return `{asset, cleanup}`.
- [x] Integrate preparation with `chat-media.ts`: validate resulting metadata, send exact prepared URI and bytes, and release outputs in finally.
- [x] Add failing upload integration tests for prepared signed video metadata and cleanup on rejection; implement until passing.

## Task 2: User feedback and verification

- [x] Update `chat-screen.tsx` to show compression/preparation status separately and retain cancel behavior.
- [x] Test preparation UI and cancellation, then run all chat suites, mobile TypeScript and lint on changed files.
- [x] Review diff, document native-device validation limitation, and commit implementation and documentation on the current branch.

## Execution record

- Task 1: preparation tests initially failed because the helper was missing; upload integration tests then failed on original URI/metadata and missing cleanup. Both suites passed after implementation.
- Task 2: 77 tests across chat and chat entry points passed; TypeScript passed; changed-file lint has no errors (six existing hook-name warnings in screen mocks).
- Final review found native Android partial-output cleanup missing in the dependency. Added an install-time pnpm patch and covered the native rejection shape in JavaScript tests; patched Android Kotlin compilation passed under JDK 21. Physical codec/quality checks and iOS build remain for device validation.
- Final whole-mobile suite: 79 suites, 559 tests passed. No deferred code-review findings remain.
