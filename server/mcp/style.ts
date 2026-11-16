// ROUND-C3 Part 3: the Project's style for Claude. After the first approved
// Video the server saves the style record from the plan (styleFromPlan,
// exactly what the Director's "make this the Project style" offer saves);
// later Videos read it (get_style) and their Brief starts from it; the Style
// chat (styleReply) proposes a before/after list that apply_style_change
// applies to later Videos only.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PlatformConfig } from '../../src/platform-config';
import { styleFromPlan } from '../../src/project/style-from';
import { emptyStyle, type StyleRecord } from '../../src/project/workspace';
import { styleReply } from '../../src/director/style-chat';
import type { McpToolSpec, ToolReply } from './index';
import type { ClaudeDoc, ClaudeProject } from './records';
import type { McpCtx } from './tools';

const oops = (text: string): ToolReply => ({ text, isError: true });
const id = z.string().min(1).max(80);

/** The style record a Project keeps (empty when none was saved yet). */
export const styleOf = (p: ClaudeProject): StyleRecord =>
  ({
    ...emptyStyle(),
    ...((p.style ?? {}) as Partial<StyleRecord>),
  }) as StyleRecord;

/**
 * After an approved plan: the first one saves the Project's style; later
 * ones add the Video as an example. Returns the sentence for Claude.
 */
export function rememberStyle(
  p: ClaudeProject,
  videoId: string,
  plan: unknown,
): string {
  const now = styleOf(p);
  if (now.source === 'empty') {
    p.style = {
      ...emptyStyle(),
      ...styleFromPlan(plan),
      examples: [videoId],
      source: 'video',
    } as unknown as Record<string, unknown>;
    return "This Project's style was saved from this video (look, fonts, captions, voice, music, script): later videos in this Project start from it.";
  }
  if (!now.examples.includes(videoId))
    p.style = {
      ...now,
      examples: [...now.examples, videoId].slice(-12),
    } as unknown as Record<string, unknown>;
  return '';
}

/** The style as plain sentences (never JSON). */
export function describeStyle(st: StyleRecord): string {
  const l = st.look;
  return [
    `Colours: ${l.palette.join(', ') || 'not set'}.`,
    `Fonts: ${l.headingFont || 'not set'} for headings, ${l.bodyFont || 'not set'} for text.`,
    `Captions: ${l.captionStyle || 'not set'}.`,
    `Graphics: ${st.graphics || 'not set'}.`,
    `Voice: ${st.voice || 'not set'}. Music: ${st.music || 'not set'}.`,
    `Script rules: ${st.scriptRules || 'not set'}.`,
    `Example videos: ${st.examples.length}.`,
  ].join('\n');
}

export function styleTools(h: {
  doc(u: string): Promise<ClaudeDoc>;
  save(u: string, d: ClaudeDoc): Promise<void>;
  desc(what: string, next: string): string;
  annotations: {
    read: McpToolSpec<McpCtx>['annotations'];
    write: McpToolSpec<McpCtx>['annotations'];
  };
}): McpToolSpec<McpCtx>[] {
  const { doc, save, desc } = h;
  const A = h.annotations;
  const noProject = oops(
    'There is no project with that id. Call list_projects.',
  );
  const pending = new Map<string, { next: unknown; key: string }>();
  return [
    {
      name: 'get_style',
      title: "The Project's style",
      description: desc(
        "Reads the Project's saved style (colours, fonts, captions, graphics, voice, music, script rules). New videos in the Project start from it.",
        'get_brief_fields for a new video, or style_chat to change it.',
      ),
      input: { project_id: id },
      annotations: A.read,
      async run(a, c) {
        const p = (await doc(c.userId)).projects[a.project_id as string];
        if (!p) return noProject;
        const st = styleOf(p);
        if (st.source === 'empty')
          return {
            text: 'This Project has no style yet. It is saved from the first approved video.',
          };
        return { text: `Style of "${p.name}":\n${describeStyle(st)}` };
      },
    },
    {
      name: 'style_chat',
      title: "Change the Project's style",
      description: desc(
        "The Style chat: send what the person wants changed about the Project's style in their words. Returns the proposed changes, before and after; nothing is saved.",
        'show the person the list, then apply_style_change after a yes.',
      ),
      input: { project_id: id, message: z.string().min(1).max(2000) },
      annotations: A.read,
      async run(a, c) {
        const p = (await doc(c.userId)).projects[a.project_id as string];
        if (!p) return noProject;
        const r = styleReply(
          c.config as PlatformConfig,
          styleOf(p),
          a.message as string,
        );
        if (r.kind === 'refusal') return { text: r.text };
        if (r.kind === 'question')
          return {
            text: 'It is not clear what to change. Ask the person which part: colours, fonts, captions, graphics, voice, music or script.',
          };
        if (r.kind === 'same')
          return {
            text: 'The style already is like that; nothing would change.',
          };
        if (r.kind === 'only')
          return {
            text: 'The Style chat changes only the Project style. For one video, change the video with edit_video.',
          };
        const key = createHash('sha256')
          .update(JSON.stringify(r.next))
          .digest('hex')
          .slice(0, 16);
        pending.set(`${c.userId}:${a.project_id as string}`, {
          next: r.next,
          key,
        });
        return {
          text: [
            'Proposed changes (nothing is saved yet):',
            ...r.changes.map(
              (x) =>
                `- ${x.field}: "${x.before || 'not set'}" becomes "${x.after}"`,
            ),
            'They apply to later videos only. After the person says yes, call apply_style_change.',
          ].join('\n'),
        };
      },
    },
    {
      name: 'apply_style_change',
      title: 'Apply the style change',
      description: desc(
        "Saves the changes style_chat proposed, after the person's yes. Videos already made stay as they are.",
        'new videos in the Project use it.',
      ),
      input: { project_id: id },
      annotations: A.write,
      async run(a, c) {
        const d = await doc(c.userId);
        const p = d.projects[a.project_id as string];
        if (!p) return noProject;
        const k = `${c.userId}:${a.project_id as string}`;
        const hit = pending.get(k);
        if (!hit)
          return oops('There is no proposed change. Call style_chat first.');
        pending.delete(k);
        p.style = {
          ...styleOf(p),
          ...(hit.next as object),
          source: 'user',
        } as unknown as Record<string, unknown>;
        await save(c.userId, d);
        return {
          text: `Saved. Later videos in "${p.name}" use the new style; videos already made are unchanged.`,
        };
      },
    },
  ];
}
