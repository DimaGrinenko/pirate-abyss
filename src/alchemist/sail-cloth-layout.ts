/** Only the blank lower sail adapts to reel height. Embroidery keeps its ratio. */
export type SailClothLayout = {
  baseHeight: number;
  sailCloth?: {
    length: number; rows: number; firstFlexibleRow: number; bands: number;
    hiddenProjection: number; phaseBone: string;
  };
};
type Bone = { x: number; y: number; scaleY: number };
type Rig = {
  findBone(name: string): Bone | null;
  findSlot(name: string): { color: { a: number } } | null;
};
const smooth = (n: number) => { const x = Math.max(0, Math.min(1, n)); return x * x * (3 - 2 * x); };

export function applySailClothLayout(skeleton: Rig, worldHeight: number, layout: SailClothLayout) {
  const cloth = layout.sailCloth;
  if (!cloth) return;
  const { length, rows, firstFlexibleRow, bands, hiddenProjection, phaseBone } = cloth;
  const phase = skeleton.findBone(phaseBone);
  if (!phase) return;
  const progress = Math.max(0, Math.min(1, phase.x));
  // Keep a small positive lower panel even in a host with an unusually short
  // reel. Required mobile/desktop layouts use the exact requested height.
  const extra = Math.max(-(length * (rows - firstFlexibleRow) / rows) + 48, worldHeight - layout.baseHeight);
  const sailLength = length + extra;
  const materialDistance = (row: number) => length * row / rows + extra * Math.max(0, (row - firstFlexibleRow) / (rows - firstFlexibleRow));
  for (let row = 0; row <= rows; row++) {
    const driver = skeleton.findBone(`sail-driver-${row}`), strip = skeleton.findBone(`sail-row-${row}`);
    if (!driver || !strip) continue;
    const material = materialDistance(row), free = material - sailLength * progress;
    driver.scaleY = 1;
    strip.y = -Math.max(material * hiddenProjection, free);
    const billow = skeleton.findBone(`sail-billow-${row}`);
    if (billow) {
      const f = row / rows, time = phase.y;
      billow.y = 6 * Math.sin(Math.PI * f) * Math.sin(time * 9 - f * 8) * (1 - progress)
        * smooth((free - 80) / 180) * Math.sin(Math.PI * Math.min(1, time / 1.4));
    }
  }
  for (let band = 0; band < bands; band++) {
    const slot = skeleton.findSlot(`sail-fabric-${band}`);
    if (!slot) continue;
    const last = materialDistance((band + 1) * rows / bands);
    // The section is already behind the opaque drum before it is retired.
    slot.color.a = last - sailLength * progress > last * hiddenProjection + .0001 ? 1 : 0;
  }
  const collectorDriver = skeleton.findBone('sail-collector-driver'), collector = skeleton.findBone('sail-collector'), hem = skeleton.findBone('sail-hem');
  if (collectorDriver) collectorDriver.scaleY = 1;
  if (collector) collector.y = -Math.max(31, sailLength * (1 - progress));
  if (hem) hem.y = 0;
}
