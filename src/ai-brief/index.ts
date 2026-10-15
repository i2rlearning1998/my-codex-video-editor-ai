// T2: the brief with the authoring rules bundled (docs/AI-BRIEF.md).
import authoring from '../../docs/CREATOR-PACK-AUTHORING.md?raw';
import { buildAiBrief, type BriefInput } from './brief';

export * from './brief';
export const AUTHORING_RULES_SOURCE = authoring;
export const aiBrief = (input: Omit<BriefInput, 'authoring'>) =>
  buildAiBrief({ ...input, authoring });
