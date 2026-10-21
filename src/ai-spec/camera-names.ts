// FINAL3 C5: the camera controllers and easings (src/camera/rig.ts uses
// them; the Composition Spec validates cameraShots against them).
export const CONTROLLERS = [
  'push-in',
  'pull-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'tilt',
  'orbit',
  'dolly-zoom',
  'handheld',
  'whip-pan',
  'rack-focus',
  'follow',
  'parallax-drift',
  'hold',
] as const;
export const CAMERA_EASINGS = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'smooth',
  'snap',
] as const;
