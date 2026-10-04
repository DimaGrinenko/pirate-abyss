import type { SharkPose } from './shark-renderer-v28';

const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const t = clamp(v); return t ** 3 * (t * (t * 6 - 15) + 10); };
const mix = (a: number, b: number, v: number) => a + (b - a) * v;
const HEADING_SCALE = Math.tanh(2.6);

/** Distinct projected-height corridors include fins and the leader's enlarged
 * glass charge. Depth opacity alone cannot prevent silhouettes intersecting. */
export const SHARK_PATROLS = [
  { frequency: TAU / 15.5, phase: -.8, amplitude: 55, y: 370, bob: 12, width: 137, alpha: .96 },
  { frequency: TAU / 20, phase: 1.85, amplitude: 40, y: 210, bob: 9, width: 99, alpha: .82 },
  { frequency: TAU / 23.2, phase: 3.1, amplitude: 30, y: 497, bob: 8, width: 78, alpha: .67 },
  { frequency: TAU / 18.6, phase: 4.6, amplitude: 37, y: 275, bob: 5, width: 65, alpha: .56 },
] as const;

export function sharkPatrol(time: number, index: number, pose: SharkPose): void {
  const route = SHARK_PATROLS[index], angle = time * route.frequency + route.phase, sine = Math.sin(angle);
  const direction = Math.tanh(Math.cos(angle) * 2.6) / HEADING_SCALE;
  pose.x = (index === 2 ? 238 : 190) + route.amplitude * sine; pose.y = route.y + route.bob * Math.cos(angle + .4);
  pose.width = route.width; pose.yaw = -Math.acos(direction); pose.pitch = Math.sin(angle + .7) * .05;
  pose.angle = sine * .045; pose.alpha = route.alpha;
}

export function sharkGlassCharge(pose: SharkPose, age: number): void {
  if (age < 0 || age >= 3.8) return;
  const focus = ease(age / 1.1) * (1 - ease((age - 2.3) / 1.5));
  const charge = ease((age - 1.1) / .55) * (1 - ease((age - 1.7) / .62));
  pose.x = mix(pose.x, 202, focus); pose.y = mix(pose.y, 374, focus);
  pose.yaw = mix(pose.yaw, -Math.PI / 2, focus); pose.pitch = mix(pose.pitch, -.055, focus);
  pose.width *= 1 + .47 * charge;
  pose.angle += Math.sin(Math.PI * clamp((age - 1.65) / .75)) * .095;
  pose.alpha = mix(pose.alpha, 1, focus);
}
