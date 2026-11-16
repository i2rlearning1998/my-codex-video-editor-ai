// ROUND-C3 (4.2, 4.3): the capability matrix. Every editor command family
// and every Video Plan v4 field, each with the way Claude reaches it
// through the connector (a plan field, an edit_video op, or a tool). A unit
// test (tests/round-c3/capability-matrix.test.ts) fails when an editor
// command or a plan field exists that no row names, so a new feature is not
// done until Claude can reach it (AGENTS.md section 3). DOM-free data.

export interface CapabilityRow {
  /** The family in plain words. */
  readonly family: string;
  /** Editor commands (core types and capability commands). */
  readonly commands: readonly string[];
  /** Plan v4 fields (layer, scene or top level) that make it. */
  readonly plan: readonly string[];
  /** edit_video ops and tools Claude uses for it. */
  readonly mcp: readonly string[];
  /**
   * Set when Claude has no way through the connector, with the reason (an
   * internal editor bookkeeping command, never a visible result).
   */
  readonly internal?: string;
}

export const CAPABILITY_MATRIX: readonly CapabilityRow[] = [
  {
    family: 'Text and fonts',
    commands: ['SET_PROPERTY'],
    plan: [
      'text',
      'font',
      'fontSize',
      'weight',
      'letterSpacing',
      'color',
      'highlight',
      'outline',
    ],
    mcp: ['submit_plan', 'edit_video change_text', 'edit_video change_look'],
  },
  {
    family: 'Shapes and lines',
    commands: ['CREATE_LAYER'],
    plan: [
      'shape',
      'from',
      'to',
      'stroke',
      'strokeWidth',
      'dash',
      'arrowStart',
      'radius',
      'startAngle',
      'endAngle',
    ],
    mcp: ['submit_plan', 'edit_video add_scene'],
  },
  {
    family: 'Speech bubbles',
    commands: [],
    plan: ['bubble', 'tail'],
    mcp: ['submit_plan', 'edit_video add_scene'],
  },
  {
    family: 'Media and poses',
    commands: ['ADD_ASSET', 'SET_LAYER_ASSET', 'REPLACE_ASSET'],
    plan: ['mediaIntent', 'queries', 'poses', 'sourceIn', 'fit', 'minDuration'],
    mcp: [
      'search_media',
      'import_media',
      'add_media',
      'make_asset',
      'edit_video replace_media',
    ],
  },
  {
    family: 'Kit items (lower thirds, cards, counters)',
    commands: [],
    plan: ['kit'],
    mcp: ['submit_plan', 'list_library'],
  },
  {
    family: 'Code layers (Tier A, B, C)',
    commands: ['SET_LAYER_CODE'],
    plan: ['block', 'params', 'defs'],
    mcp: [
      'submit_plan (defs)',
      'edit_video add_graphic',
      'edit_video replace_graphic_code',
      'edit_video set_graphic_params',
      'read_graphic',
    ],
  },
  {
    family: 'Layout, layers and groups',
    commands: [
      'CREATE_LAYER',
      'DELETE_LAYER',
      'MOVE_LAYER',
      'GROUP',
      'UNGROUP',
      'SET_LAYER_NAME',
    ],
    plan: [
      'anchor',
      'size',
      'at',
      'width',
      'height',
      'rotation',
      'opacity',
      'order',
      'group',
      'name',
      'locked',
      'layers',
    ],
    mcp: ['submit_plan', 'edit_video add_scene'],
  },
  {
    family: 'Animation and keyframes',
    commands: ['SET_KEYFRAME', 'REMOVE_KEYFRAME', 'SET_CLIP_ANIMATION'],
    plan: [
      'enter',
      'exit',
      'move',
      'loop',
      'keyframes',
      'preset',
      'easing',
      'controller',
      'strength',
      'target',
    ],
    mcp: ['submit_plan', 'edit_video add_scene'],
  },
  {
    family: 'Transitions',
    commands: ['SET_CLIP_TRANSITION'],
    plan: ['transitionIn', 'transitionOut'],
    mcp: ['submit_plan', 'edit_video add_scene'],
  },
  {
    family: 'Effects and colour',
    commands: ['SET_CLIP_FX'],
    plan: ['fx', 'grade'],
    mcp: ['submit_plan'],
  },
  {
    family: 'Masks',
    commands: ['plugin:layer-masks:SET'],
    plan: ['mask', 'feather', 'featherEdge'],
    mcp: ['submit_plan'],
  },
  {
    family: 'Blend and chroma key',
    commands: ['plugin:layer-blend:SET', 'plugin:chroma-key:SET'],
    plan: ['blend', 'chromaKey'],
    mcp: ['submit_plan'],
  },
  {
    family: 'Speed, reverse and freeze',
    commands: ['SET_CLIP_SPEED', 'SET_CLIP_REVERSED', 'SET_CLIP_FREEZE_FRAME'],
    plan: ['speed', 'reverse'],
    mcp: ['submit_plan'],
  },
  {
    family: 'Audio volume, fades, music and sound effects',
    commands: [
      'plugin:audio:SET',
      'plugin:audio-mixer:SET',
      'SET_CLIP_AUDIO_DETACHED',
    ],
    plan: ['volume', 'fadeIn', 'fadeOut', 'music', 'sfx'],
    mcp: ['submit_plan', 'search_media', 'edit_video set_master_volume'],
  },
  {
    family: 'Narration track and voice',
    commands: ['plugin:tts:SET'],
    plan: ['narration', 'narrationTrack', 'voice'],
    mcp: ['submit_plan', 'make_asset (voice-over)', 'add_media'],
  },
  {
    family: 'Captions (every style)',
    commands: [],
    plan: ['captions'],
    mcp: ['submit_plan', 'edit_video change_caption_style'],
  },
  {
    family: 'Camera shots and controllers',
    commands: ['SET_COMPOSITION_CAMERA'],
    plan: ['camera', 'cameras'],
    mcp: ['submit_plan', 'edit_video change_camera_shot'],
  },
  {
    family: 'Backgrounds and the look',
    commands: ['SET_COMPOSITION_BACKGROUND', 'SET_PROJECT_BACKGROUND'],
    plan: ['background', 'feel'],
    mcp: ['submit_plan', 'edit_video change_look', 'style_chat'],
  },
  {
    family: 'Overlays across scenes',
    commands: [],
    plan: ['overlays'],
    mcp: ['submit_plan'],
  },
  {
    family: 'Scenes: order, timing and length',
    commands: [
      'CREATE_COMPOSITION',
      'DELETE_COMPOSITION',
      'MOVE_COMPOSITION',
      'SET_COMPOSITION',
      'SET_LAYER_TIMING',
      'SET_CLIP_TIMING',
      'MOVE_CLIP',
      'CREATE_CLIP',
      'DELETE_CLIP',
      'CREATE_TRACK',
      'DELETE_TRACK',
      'MOVE_TRACK',
    ],
    plan: [
      'scenes',
      'id',
      'title',
      'durationHint',
      'start',
      'duration',
      'notes',
    ],
    mcp: [
      'submit_plan',
      'edit_video add_scene',
      'edit_video remove_scene',
      'edit_video reorder_scene',
      'edit_video retime',
    ],
  },
  {
    family: 'Aspect, resolution and frame rate',
    commands: ['SET_COMPOSITION_SIZE', 'SET_COMPOSITION_FPS'],
    plan: ['meta'],
    mcp: ['submit_plan', 'edit_video set_frame', 'export_video (preset)'],
  },
  {
    family: 'Markers',
    commands: ['ADD_MARKER', 'UPDATE_MARKER', 'DELETE_MARKER'],
    plan: [],
    mcp: ['edit_video add_marker'],
  },
  {
    family: 'Plan bookkeeping',
    commands: [],
    plan: ['format', 'version', 'resolved', 'kind', 'kit'],
    mcp: ['validate_plan'],
  },
  {
    family: 'Nesting, clip links, lanes, the outliner and the playback range',
    commands: [
      'SET_NESTED_CONTENT',
      'SET_CLIP_LINK',
      'SET_CLIP_ENABLED',
      'SET_TRACK_STATE',
      'SET_OUTLINER',
      'SET_COMPOSITION_RANGE',
      'SET_PROJECT_NAME',
    ],
    plan: [],
    mcp: [],
    internal:
      'The editor organises the timeline with these for the person working by hand (how clips are bundled, linked, locked or listed, which part plays in the editor, the file name). They change no frame of the exported video; Claude reaches the same pictures with scenes, groups and timing.',
  },
];

/** The matrix as plain sentences (start_here and docs/MCP.md). */
export function capabilityLines(): string[] {
  return CAPABILITY_MATRIX.map((r) =>
    r.internal
      ? `- ${r.family}: kept for editing by hand in the editor (no change to the video).`
      : `- ${r.family}: ${r.mcp.join(', ')}.`,
  );
}
