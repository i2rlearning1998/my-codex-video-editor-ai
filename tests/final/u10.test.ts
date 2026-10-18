import { expect, test } from 'vitest';
import { PARAMS_HEADER, savedParams } from '../../src/ui/ai-import-dialog';
import {
  restingCamera,
  setCameraValue,
  toggleCameraKeyframes,
} from '../../src/ui/camera-panel';
import { sceneCameraAt } from '../../src/camera/scene';

// FINAL2 U10: exported control values and the camera panel's edits.
test('an exported code animation keeps its control values in its first line', () => {
  const source = `${PARAMS_HEADER}{"speed":2,"label":"Hi"}\nexport default {}`;
  expect(savedParams(source)).toEqual({ speed: 2, label: 'Hi' });
  expect(savedParams('export default {}')).toEqual({});
  expect(savedParams(`${PARAMS_HEADER}not json\nx`)).toEqual({});
});

test('camera values: a still value, then keyframes at the playhead', () => {
  const holder = (camera: unknown) => ({ camera, width: 100, height: 100 });
  let camera = setCameraValue(restingCamera(), 'zoom', 1.5, 0);
  expect(sceneCameraAt(holder(camera), 3)?.zoom).toBe(1.5);
  camera = toggleCameraKeyframes(camera, 'x', 0);
  camera = setCameraValue(camera, 'x', 50, 2);
  expect(sceneCameraAt(holder(camera), 0)?.x).toBe(0);
  expect(sceneCameraAt(holder(camera), 2)?.x).toBe(50);
  camera = toggleCameraKeyframes(camera, 'x', 2);
  expect(camera.x.animated).toBe(false);
  expect(camera.x.value).toBe(50);
});
