# Pirate Abyss captain v13

Native Spine 4.2, 41 bones, 46 raster mesh slots and 20 game animations. The free arm uses a new continuous generated raster split into six mesh regions with identical shared seam vertices. The shoulder is blended into the chest with a repainted continuous coat surface; no separate circular shoulder cap remains. Sleeve, elbow, cuff, wrist and palm remain connected during flexion. The active atlas page is `captain-v13-shoulder.webp`.

Shoulder, elbow and wrist follow overlapping quintic curves sampled at 60 Hz. The shoulder leads and the wrist settles last; segment lengths remain fixed. There are no hand texture swaps or palm-width compression. Gaze, eyebrows, head, coat and lantern remain active while inverse-kinematic ankles stay planted.

Ambient gestures begin after 2.2 seconds of idle, with 0.8-second entry mixes. Event transitions use 1-second mixes; anticipation to suspense uses 0.4 seconds. Native queue validation records 25 gestures in two minutes.

Rebuild: `node scripts/generate-pirate-character-v13.mjs --publish`

Validate: `node scripts/check-pirate-character-v13.mjs --public`

Native preview: `node scripts/preview-pirate-character-v13.mjs`

Source, exact imagegen prompts, independent geometry reports and visual proof: `art-source/pirate/character-v13`. Earlier source and atlas files remain as history. Shared camera and body placement are defined in `src/alchemist/character-layout.ts`.
