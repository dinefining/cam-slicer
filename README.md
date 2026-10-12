# Cam Slicer

A minimal, tactile collage tool that treats your live webcam feed as material to cut, clone, erase and rearrange.

A Maybe Machine by Ravi Popat — [ravipopat.info/maybe-machines](https://ravipopat.info/maybe-machines)

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Start the dev server: `npm run dev`
3. Open http://localhost:3000 and allow camera access.

### On a phone or iPad

Browsers only allow the camera over HTTPS (or on localhost), so use the HTTPS dev server:

1. `npm run dev:https`
2. On the device (same Wi-Fi), open `https://<your computer's IP>:3000` and accept the certificate warning once.

## Build

`npm run build` writes a static site to `dist/`, which can be hosted anywhere that serves HTTPS.
