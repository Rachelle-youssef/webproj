# jsQR 1.4.0

Unmodified browser distribution of jsQR, bundled locally for medicine label scanning.
The app loads this file only when the admin starts a camera scan or selects an image.
No CDN connection is needed at runtime. The Apache 2.0 license is included in LICENSE.

- Official source and API: https://github.com/cozmo/jsQR
- Pinned distribution: https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js
- License: https://cdn.jsdelivr.net/npm/jsqr@1.4.0/LICENSE
- jsQR.js SHA-256: bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859

The LifeLink camera/image handling is in Scripts/medicineScanner.js. Camera permission,
secure contexts and error handling follow the browser API documentation:
https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
