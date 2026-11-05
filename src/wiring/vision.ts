// P3-WIRING (W4, W5): images and Studio parameters ride on the gateway
// request; the real adapters add them (src/gateway/adapters/extras.ts).
export {
  imagesOf,
  paramsRequest,
  visionRequest,
  withImages,
  withParams,
  type ImageInput,
} from '../gateway/adapters/extras';
