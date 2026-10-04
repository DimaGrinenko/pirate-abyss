# Pirate Abyss raster symbol rigs

15 original pirate component sheets and exact generation prompts are preserved under art-source/pirate/symbols. No alchemical images or vector artwork are used. Compatibility IDs are retained solely for the inherited game math.

Each painted component has a separate Spine bone and region attachment. Native Spine 4.2.43 animations: subtle idle (4 s), land/drop (0.3 s), win (1.2 s). Animation concepts, alpha extraction audit, SHA-256 source hashes and authoring coordinates are preserved. Assembled transparent 768×768 PNGs are in art-source/pirate/symbols/assembled. Runtime previews are 512×512 WebP; world coordinates are centered in 288×288 units.

Rebuild offline: node scripts/generate-pirate-symbols.mjs
