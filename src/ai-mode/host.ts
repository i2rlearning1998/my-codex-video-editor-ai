// ROUND-B: what AI mode gets from the editor shell. Types only, so the shell
// can name them without loading the AI mode chunk. AI mode never holds a
// copy of the project: it reads `engine.state` and `session`, previews with
// the engine's own preview path and changes things only through commands.
import type { EditorCommand, EditorEngine } from '../core';
import type { EditorSession } from '../ui/session';
import type { EditorChatEngine } from '../contracts/p3';
import type { VideoPlan } from '../video-plan';
import type { Theme } from '../themes/themes';

export interface AiBuildResult {
  readonly sceneIds: readonly string[];
  /** Why the video is silent (no voice engine), or null. */
  readonly silent: string | null;
  /** Files the plan expected and did not find, by name. */
  readonly missing: readonly string[];
}
export interface AiHost {
  readonly engine: EditorEngine;
  readonly session: EditorSession;
  /** The editor shell's root (`.editor-shell`) and the stage with the canvas. */
  readonly shell: HTMLElement;
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** The signed-in person. */
  readonly userId: string;
  toast(text: string, kind?: 'info' | 'success' | 'error'): void;
  /** Composition units to canvas CSS pixels, as drawn now. */
  viewMatrix(): readonly [number, number, number, number, number, number];
  /** The layer under a point of the canvas (CSS px), as a click would pick it. */
  pick(point: { x: number; y: number }): string | null;
  /** Draws the canvas again and fits it to the stage. */
  redraw(): void;
  fit(): void;
  /** A small picture of a scene (a data URL), or undefined. */
  poster(sceneId: string, width: number): string | undefined;
  togglePlayback(): void;
  openExport(): void;
  /** Leaves the editor the way the browser's Back does (asks to save). */
  back(): void;
  runCommand(id: string): void;
  /** Imports files into Project Media; returns the new asset ids. */
  importFiles(files: readonly File[]): Promise<readonly string[]>;
  /** Takes media away again (a cancelled build). */
  discardAssets(ids: readonly string[]): Promise<void>;
  /**
   * Builds a plan headless and adds its scenes in ONE step. Rejects on
   * cancel or failure, and then nothing was added.
   */
  buildPlan(
    plan: VideoPlan,
    options: {
      signal: AbortSignal;
      progress(step: string, state: string, detail?: string): void;
      /** Scenes of an earlier build this one replaces (same step). */
      replace?: readonly string[];
      /** Where the new scenes go (after this scene); the end when absent. */
      after?: string;
    },
  ): Promise<AiBuildResult>;
  /** The existing Controls of the selected layer (code or preset), or []. */
  controls(): HTMLElement[];
  /** The commands that would add a media file to the open scene (not run). */
  placeAssetCommands(assetId: string): EditorCommand[];
  /** The editor's own Fit or Fill for a picture or video of the open scene. */
  fitCommands(layerId: string, mode: 'fit' | 'fill'): EditorCommand[];
  /** Shows commands on the canvas without committing them (null: stop). */
  preview(commands: readonly EditorCommand[] | null): void;
  /** The editor chat engine (proposals, one-transaction apply), when given. */
  chat(): Promise<EditorChatEngine | null>;
  chatSettings(): { enabled: boolean; maxMessagesPerDay: number };
  themes(): readonly Theme[];
  themeCommands(theme: Theme): EditorCommand[];
  currentThemeId(): string | null;
  /** Marks this Video as AI-made for the panel. */
  markAi(): void;
}
export interface AiMode {
  show(): void;
  hide(): void;
  dispose(): void;
}
