# Kocia Kawiarnia VR — cat café (Meta Quest, WebXR)

A cozy pastel cat café: pet six cats, play with them with a feather wand, a laser pointer and
balls, and feed them kibble and treats. Runs in the Quest Browser (Three.js + WebXR, no build
step, everything procedural — no image or audio files).

## Play online
**https://daamioo.github.io/vrCatCaffe/** — open it in the Quest Browser and press **Enter VR**
(on a PC it works as a desktop test mode). Deployed by GitHub Actions on every push to `main`
after the syntax check and headless tests pass (`.github/workflows/pages.yml`).

## Run locally
```
npm start                      # http://localhost:8001
adb reverse tcp:8001 tcp:8001  # Quest over USB, then open http://localhost:8001 in the Quest Browser
```
Or `npm run cert && npm run start:https` and open `https://<your-LAN-ip>:8001` on the Quest.

## In the café
- **Cats** — Tygrysek (tabby, playful), Łatka (calico, cuddly), Frak (tuxedo, hunter), Puszek
  (white, lazy), Mgiełka (grey, shy), Kluska (ginger, greedy). They wander, groom, nap, climb
  the cat trees and shelves, chase toys and come for food.
- **Petting** — move an open hand (no grip) along a cat's back or head; content cats purr (with
  controller rumble), squint and lean in. Each walks off when its patience runs out; the shy
  one needs slow hands.
- **Toys** — feather wand (wave it low), laser pointer (hold the trigger; Space on desktop),
  yarn balls and a crinkle ball to throw.
- **Food** — tilt the kibble pouch over a bowl to fill it; take a treat from the jar on the
  counter and hold it out low for a cat to eat from your hand.
- **Radio** on the counter (generated café music) and a **paw reset button** by the door
  (push and hold for a second).

## Development
`npm run check` (syntax) · `npm test` (headless simulation of the café, cats, toys and food).
