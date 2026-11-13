# Chat media compression

Implement the chat-only optimization proposed in conversation and approved for implementation. Keep existing private Cloudinary upload and verification contracts.

## Approaches

- Client compression reduces upload bytes and recipient download size. Selected as the implementation approach.
- Cloudinary transformations optimize delivery but still require the original upload; deferred.
- Gateway transcoding adds server load and does not reduce mobile upload bytes; deferred.

## Behavior

- Images: JPEG quality 0.8, longest edge at most 1600 px, preserve aspect ratio, never enlarge. Use the smaller file unless resizing is needed. Retain PNG/WebP format when resizing those inputs to preserve transparency.
- Videos: native compression for files above 5 MiB, target 1280 px longest edge (720p landscape) and 2 Mbps, preserve audio; only upload the result if smaller. This threshold/bitrate is an implementation choice.
- Read actual output size and dimensions before upload/init; enforce existing 10/100 MiB limits on the chosen upload file.
- Cancellation must prevent upload and cancel native video compression; delete temporary outputs after success/failure/cancellation without deleting selected originals.
- Report preparation separately from upload; leave non-chat uploads unchanged.
- A native mobile rebuild is required for the video compressor. No cloud transformations or new backend endpoints.

## Implementation decisions

- Pin `react-native-compressor` to 1.19.4 to retain compatibility with the current native stack. Load it only for videos above the compression threshold.
- Preserve audio explicitly with `stripAudio: false`.
- Apply a pnpm patch that removes partial Android MP4 output on native failure/cancellation, since rejected native promises cannot return that path to JavaScript for cleanup.
- Image encoding cannot be interrupted mid-operation; cancellation discards its result and prevents upload. Native video cancellation can also take time to settle before preparation returns.
- Picker quality is 1 so the dedicated preparation stage owns JPEG compression rather than applying quality 0.8 twice.

## Validation

Mock native codecs for deterministic tests of output selection, dimensions, size limits, cancellation, cleanup, and signed upload metadata. Run mobile typecheck, focused lint and chat tests. Physical Android/iOS verification remains required for quality, audio and codec behavior.

Android module compilation passed with the existing JDK 21: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :react-native-compressor:compileDebugKotlin --console=plain` from `mobile/android`. The default Android Studio JDK 25 is incompatible with this project's Gradle plugin setup.

Device checks before release: rebuild the native app, send large portrait/landscape photos and transparent images, send a video with speech, cancel during compression and upload, and confirm receiver playback and private media verification. iOS compilation and physical-device checks were not performed in this session.
