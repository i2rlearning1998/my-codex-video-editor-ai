// P3-WIRING: what the UI uses (docs/CONTRACTS-P3.md 5b).
export { createDirectorService, type DirectorDeps } from './director-service';
export { createStudioService, type StudioDeps } from './studio-service';
export { createAttachments, type AttachDeps } from './attach';
export { createWiringStore, indexedDbBackend, memoryBackend } from './store';
export { loadEngines, EngineMissingError } from './engines';
export { paramsRequest, visionRequest } from './vision';
export { P3Error } from './errors';
