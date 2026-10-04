/** One distribution-only policy, shared by Vite's copier and frontend audit.
 * Authoring assets remain in public/art-source for reproducible editing. */
export const COMPACT_SOURCE_RIGS = new Set([
  'effects/bigwin-v2', 'altar/altar', 'character/alchemist',
  'effects/reel-blue', 'effects/reel-red', 'effects/reel-gold', 'effects/reel-green',
  'environment/laboratory-motion', 'effects/bonus-entry',
].map(file => `alchemist/${file}.json`));

export const RUNTIME_RIG_REPLACEMENTS: Readonly<Record<string, string>> = {
  'alchemist/character/alchemist-acting-v42.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist-acting-v41.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist-acting-v40.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/altar/altar.json': 'alchemist/altar/altar-volume-v36.json',
  'alchemist/altar/altar-compact-v27.json': 'alchemist/altar/altar-volume-v36.json',
  'alchemist/altar/altar-hinge-v34.json': 'alchemist/altar/altar-volume-v36.json',
  'alchemist/altar/altar-volume-v35.json': 'alchemist/altar/altar-volume-v36.json',
  'alchemist/character/alchemist-acting-v39.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist-acting-v38.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist-expression-v37.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist-compact-v27.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist-performance-v33.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist-performance-v34.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist-coherent-face-v35.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/character/alchemist-salute-v36.json': 'alchemist/character/alchemist-acting-v42-smooth.json',
  'alchemist/environment/laboratory-motion.json': 'alchemist/environment/laboratory-motion-v38.json',
  'alchemist/environment/laboratory-motion-compact-v27.json': 'alchemist/environment/laboratory-motion-v38.json',
  'alchemist/environment/laboratory-motion-v34.json': 'alchemist/environment/laboratory-motion-v38.json',
};

// An atlas replacement also requires every referenced texture page. The audit
// follows those page declarations; there is no hashed filename duplicated here.
export const SUPERSEDED_FRONTEND_ASSETS: Readonly<Record<string, string>> = {
  'alchemist/ceremony/vault-background-v32.webp': 'alchemist/ceremony/vault-background-v42.webp',
  'alchemist/ui/cabin-bonus-panel-v42.webp': 'alchemist/ui/interface-panel.webp',
  'alchemist/ui/cabin-bonus-cta-v42.webp': 'alchemist/ui/v4/button-primary-base.webp',
  ...RUNTIME_RIG_REPLACEMENTS,
  ...Object.fromEntries(['ogg', 'mp3'].flatMap(ext => [
    [`alchemist/audio/pirate-ship-theme.${ext}`, `alchemist/audio/pirate-voyage-v42.${ext}`],
    [`alchemist/audio/underwater-ambient.${ext}`, `alchemist/audio/pirate-bonus-v42.${ext}`],
  ])),
  'alchemist/character/setup-pose-v41.png': 'alchemist/character/setup-pose-v42.png',
  'alchemist/character/captain-platform-v41.webp': 'alchemist/character/captain-platform-v42.webp',
  'alchemist/environment/shark-turns-v40.webp': 'alchemist/environment/shark-smooth-v41.webp',
  ...Object.fromEntries(['alchemist-v33.atlas', 'alchemist-v40.atlas', 'alchemist-v41.atlas'].map(file => [`alchemist/character/${file}`, 'alchemist/character/alchemist-v42.atlas'])),
  ...Object.fromEntries(['captain-expressions-v40.webp', 'alchemist-v33-8e1845b55bfb.webp', 'captain-puppet-v41.webp'].map(file => [`alchemist/character/${file}`, 'alchemist/character/captain-puppet-v42.webp'])),
  'alchemist/character/setup-pose-v33.png': 'alchemist/character/setup-pose-v42.png',
  'alchemist/ui/bonus-chest-v39.webp': 'alchemist/altar/guardian-v41/side-poster.webp',
  ...Object.fromEntries(['json', 'atlas', 'webp'].map(extension => [`alchemist/altar/octopus-guardian-v40.${extension}`, `alchemist/altar/octopus-guardian-v41.${extension}`])),
  'alchemist/altar/octopus-guardian-poster-v40.webp': 'alchemist/altar/octopus-guardian-poster-v41.webp',
  ...Object.fromEntries(['v40', 'v42'].flatMap(version => ['front', 'side', 'treasure', 'inner', 'outer', 'cap', 'pile', 'open-poster', 'side-poster'].map(material => [`alchemist/altar/guardian-${version}/${material}.webp`, `alchemist/altar/guardian-v41/${material}.webp`]))),
  'alchemist/ui/bonus-depth-v40.webp': 'alchemist/ui/bonus-depth-v41.webp',
  'alchemist/ui/bonus-treasure-v38.webp': 'alchemist/ui/bonus-gold-v39.webp',
  ...Object.fromEntries(['reel-vfx.atlas', 'reel-vfx-v32.atlas', 'reel-vfx.webp', 'reel-vfx-v25.webp', 'reel-vfx-v26.webp', 'reel-vfx-v32-0c00c274ac.webp'].map(file => [`alchemist/effects/${file}`, 'alchemist/effects/reel-vfx-v36.atlas'])),
  ...Object.fromEntries(['blue', 'red', 'gold', 'green'].map(type => [`alchemist/effects/rail-${type}-diamond-v26.webp`, `alchemist/effects/rail-${type}-cartoon-v36.webp`])),
  'alchemist/effects/column-jamb.webp': 'alchemist/effects/column-jamb-v36.webp',
  ...Object.fromEntries(['laboratory-motion.atlas', 'laboratory-motion.webp', 'fish-school-v12.webp', 'laboratory-motion-v36.atlas', 'laboratory-motion-v36.webp', 'fish-school-v36.webp'].map(file => [`alchemist/environment/${file}`, 'alchemist/environment/laboratory-motion-v38.atlas'])),
  ...Object.fromEntries(['marine-fish-v36.webp', 'fish-school-volume-v36.webp', 'marine-faces-v36.webp'].map(file => [`alchemist/environment/${file}`, 'alchemist/environment/marine-side-v38.webp'])),
  'alchemist/altar/arrival-pose-v21.png': 'alchemist/altar/arrival-pose-v36.png',
  'alchemist/altar/setup-pose.png': 'alchemist/altar/setup-pose-v36.png',
  'alchemist/altar/reward-broken-pose-v21.png': 'alchemist/altar/reward-broken-pose-v36.png',
  ...Object.fromEntries(['arrival-pose', 'setup-pose', 'reward-broken-pose'].flatMap(pose => ['34', '35'].map(version => [`alchemist/altar/${pose}-v${version}.png`, `alchemist/altar/${pose}-v36.png`]))),
  'alchemist/environment/laboratory-walls-v32.webp': 'alchemist/environment/laboratory-walls-v34.webp',
  'alchemist/environment/fish-routes-v27.json': 'alchemist/environment/fish-routes-v34.json',
  'alchemist/environment/bonus-window-v22.json': 'alchemist/environment/bonus-window-v34.json',
  ...Object.fromEntries(['bonus-shark-v24.webp', 'bonus-shark-v35.webp', 'bonus-shark-v36.webp', 'bonus-shark-front-v26.webp', 'bonus-shark-front-v35.webp', 'bonus-shark-face-material-v35.webp', 'bonus-shark-face-material-v36.webp'].map(file => [`alchemist/environment/${file}`, 'alchemist/environment/shark-side-v38.webp'])),
  'alchemist/character/alchemist.atlas': 'alchemist/character/alchemist-v42.atlas',
  'alchemist/character/setup-pose.png': 'alchemist/character/setup-pose-v42.png',
  'alchemist/character/portrait.png': 'alchemist/character/setup-pose-v42.png',
  ...Object.fromEntries([
    'captain-v20-costume.webp', 'captain-v19-long-cutlass.webp', 'captain-v18-cutlass.webp',
    'captain-v17-volume-arm.webp', 'captain-v16-seated-arm.webp', 'captain-v15-acting.webp',
    'captain-v13-shoulder.webp', 'captain-v13.webp', 'captain-v12.webp', 'captain-v11.webp',
    'captain-v10-articulated.webp', 'captain-v9-living.webp', 'captain-v8-calm.webp',
    'captain-v7-arms3.webp', 'captain-v7.webp', 'pirate-captain-v3.webp', 'captain-cutlass-grip-v18.webp',
  ].map(file => [`alchemist/character/${file}`, 'alchemist/character/alchemist-v42.atlas'])),
  'alchemist/effects/bigwin-v2.atlas': 'alchemist/effects/bigwin-v33.atlas',
  'alchemist/effects/bigwin-v32.atlas': 'alchemist/effects/bigwin-v33.atlas',
};

export const normalizedPublicPath = (name: string) => name.replace(/\\/g, '/').replace(/^\.\//, '');
export const isFrontendMathAsset = (name: string) => {
  const path = normalizedPublicPath(name);
  return path === 'alchemist/math' || path.startsWith('alchemist/math/');
};
export function shouldCopyFrontendAsset(name: string) {
  const path = normalizedPublicPath(name);
  return !isFrontendMathAsset(path) && !COMPACT_SOURCE_RIGS.has(path) && !(path in SUPERSEDED_FRONTEND_ASSETS);
}
