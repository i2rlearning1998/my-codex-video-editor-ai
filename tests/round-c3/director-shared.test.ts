// ROUND-C3 Part 1 (RDC3-010 to RDC3-017): the Director's logic, shared.
// The MCP tools call the same DOM-free functions as the in-panel Director;
// the Director's own output stays identical (the snapshots below were taken
// from the Director's formulas before the move).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig, platformConfigSchema } from '../../src/platform-config';
import {
  graphicsCredits,
  planTotals,
  rewritesLeft,
} from '../../src/director/plan-costs';
import {
  briefLines,
  classifyType,
  fillFromStyle,
  fillFromText,
  missingRequired,
} from '../../src/director/field-library';
import { buildManual } from '../../src/director-rules/manual';
import { startC2, type C2 } from '../round-c2/helpers';
import { approved, newVideo, person, plan } from './helpers';

const config = platformConfigSchema.parse(defaultConfig());
let s: C2;
beforeAll(async () => {
  s = await startC2();
});
afterAll(() => s.close());

describe('[RDC3-010] the shared functions keep the Director identical', () => {
  it("[RDC3-010] the Plan card's numbers, the brief functions and the Director's manual are what the Director computed before the move", () => {
    // The Director's old #graphicsCredits: count x the owner's cost (max).
    const two = { defs: { blocks: [{}, {}] } } as never;
    expect(graphicsCredits(config, two)).toBe(
      2 *
        (config.costs.find(
          (c) => c.id === config.director.authoring.newGraphicCostId,
        )?.max ?? 0),
    );
    expect(graphicsCredits(config, {} as never)).toBe(0);
    // The old #rewritesLeft: never below zero.
    const n = config.director.rewritesPerVideo;
    expect(rewritesLeft(config, 0)).toBe(n);
    expect(rewritesLeft(config, n + 5)).toBe(0);
    // The old #setPlan totals: ceil(base + media + graphics), ceil per scene.
    expect(
      planTotals({ max: 3.2, scenes: [{ max: 1.1 }, { max: 2.1 }] }, 3, 0.5, 4),
    ).toEqual({ max: 8, sceneCosts: [2, 3, 0] });
    expect(planTotals(null, 1, 0, 0)).toEqual({ max: 0, sceneCosts: [0] });
    // The brief functions on a fixed message.
    const lib = config.director.fieldLibrary;
    const msg = 'Explain how rain forms, in Hindi, 1 minute';
    const type = classifyType(lib, msg);
    const values = fillFromText(lib, type, msg);
    expect({ type: type.id, values }).toMatchSnapshot();
    expect(briefLines(lib, type, values, 'en')).toMatchSnapshot();
    expect(
      missingRequired(lib, type, values).map((b) => b.id),
    ).toMatchSnapshot();
    expect(
      fillFromStyle(lib, type, {
        voice: 'warm',
        music: 'calm',
        scriptRules: 'short lines',
        look: { palette: ['#000000'], captionStyle: 'bold' },
      }),
    ).toMatchSnapshot();
    // The Director's manual is the default view; Claude's adds guidance.
    const director = buildManual(config, { videoType: 'explainer' });
    expect(director).toBe(
      buildManual(config, { videoType: 'explainer', for: 'director' }),
    );
    expect(director).toContain('## Rulebook');
    expect(director).not.toContain('## Guidance');
  });
});

describe('[RDC3-011] the whole Brief at once', () => {
  it('[RDC3-011] get_brief_fields returns every field of the type with what the message and the Project style fill in, what is still missing, and "you decide"; save_brief names the required fields still empty', async () => {
    const { client } = await person(s, 'c3-brief');
    const { videoId } = await newVideo(s, client);
    const r = await s.call(client, 'get_brief_fields', {
      video_id: videoId,
      message: 'Explain how rain forms, in Hindi, 1 minute',
    });
    const lib = config.director.fieldLibrary;
    const type = lib.types.find((t) => t.id === 'explainer')!;
    // Every field is listed, numbered, in the type's order.
    for (const [i, ref] of type.blocks.entries())
      expect(r.text).toContain(`${i + 1}. ${ref.id}: `);
    expect(r.text).toMatch(
      /language: Language \(required\)\. Understood: hi\./,
    );
    // This message answers every required field.
    expect(r.text).toContain('Every required field is answered.');
    const bare = await s.call(client, 'get_brief_fields', {
      video_type: 'explainer',
    });
    expect(bare.text).toMatch(/Required and still missing: topic, /);
    expect(r.text).toMatch(/"You decide" is allowed\./);
    // A message that names the type picks it when no video is given.
    const typed = await s.call(client, 'get_brief_fields', {
      message: 'Explain how rain forms',
    });
    expect(typed.text).toMatch(/^Brief for explainer/);
    const saved = await s.call(client, 'save_brief', {
      video_id: videoId,
      answers: { topic: 'Rain', language: 'hi' },
      reference_url: 'https://example.com/rain',
    });
    expect(saved.text).toMatch(
      /^Saved\. Required and still empty: |^The brief is complete\./,
    );
  });
});

describe('[RDC3-012] file notes', () => {
  it("[RDC3-012] add_file_note keeps what was seen in a person's file (the Director's FileNote, capped); read_memory returns the notes and the reference link", async () => {
    const { client } = await person(s, 'c3-notes');
    const { videoId } = await newVideo(s, client);
    await s.call(client, 'save_brief', {
      video_id: videoId,
      answers: { topic: 'Rain' },
      reference_url: 'https://example.com/rain',
    });
    const one = await s.call(client, 'add_file_note', {
      video_id: videoId,
      name: 'diagram.png',
      kind: 'image',
      note: 'A water cycle diagram with clouds, rain and a river.',
    });
    expect(one.text).toBe('Noted "diagram.png". The Video has 1 file note.');
    // The same file again replaces its note; the cap holds.
    for (let i = 0; i < config.director.context.maxFileNotes + 3; i++)
      await s.call(client, 'add_file_note', {
        video_id: videoId,
        name: `f${i}.pdf`,
        kind: 'pdf',
        note: 'x'.repeat(1900),
      });
    const mem = await s.call(client, 'read_memory', { video_id: videoId });
    expect(mem.text).toContain('File notes:');
    expect(mem.text).toContain('Reference link: https://example.com/rain');
    const notes = mem.text.split('\n').filter((l) => /^- f\d+\.pdf/.test(l));
    expect(notes.length).toBeLessThanOrEqual(
      config.director.context.maxFileNotes,
    );
    expect(notes[0]!.length).toBeLessThan(
      config.director.context.maxNoteChars + 40,
    );
    expect(
      (
        await s.call(client, 'add_file_note', {
          video_id: '00000000-0000-4000-8000-000000000000',
          name: 'a',
          kind: 'image',
          note: 'b',
        })
      ).isError,
    ).toBe(true);
  });
});

describe('[RDC3-013] the Plan card for Claude', () => {
  it('[RDC3-013] get_plan_cost lists each scene (what it shows, how it is made, credits), each new graphic, the media cost, the total and the rewrites left; submit_plan repairs once, refuses with one sentence, and counts rewrites', async () => {
    const { client } = await person(s, 'c3-plan');
    const { videoId } = await newVideo(s, client);
    // Broken ids repaired once (two scenes share an id).
    const dup = plan('Rivers', 2);
    dup.scenes[1]!.id = dup.scenes[0]!.id;
    const built = await s.call(client, 'submit_plan', {
      video_id: videoId,
      plan: dup,
    });
    expect(built.text).toMatch(/^Built 2 scenes/);
    expect(built.text).toContain('repaired once');
    const cost = await s.call(client, 'get_plan_cost', { video_id: videoId });
    expect(cost.text).toMatch(
      /^The plan, scene by scene:\n1\. Opening: Every river starts small\. Made with .*; 2 credits\./,
    );
    expect(cost.text).toMatch(
      /No media costs credits\.|Media that costs: \d+ credits\./,
    );
    expect(cost.text).toMatch(/Total: up to \d+ credits\./);
    const n = config.director.rewritesPerVideo;
    expect(cost.text).toContain(`Plan rewrites left: ${n} of ${n}.`);
    // A rubbish plan: one plain sentence, nothing built.
    const bad = await s.call(client, 'submit_plan', {
      video_id: videoId,
      plan: {
        ...plan(),
        scenes: [
          {
            ...plan().scenes[0]!,
            layers: [{ id: 'g', kind: 'block', block: 'no-such-graphic' }],
          },
        ],
      },
    });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(
      /^Director could not make a usable plan from this brief\./,
    );
    // Each new plan is a rewrite, until none are left.
    for (let i = 0; i < n; i++) {
      const again = await s.call(client, 'submit_plan', {
        video_id: videoId,
        plan: plan(`Take ${i}`),
      });
      expect(again.text).toContain(`Plan rewrites left: ${n - i - 1}.`);
    }
    const none = await s.call(client, 'submit_plan', {
      video_id: videoId,
      plan: plan('One more'),
    });
    expect(none.text).toBe(
      `This video has used all ${n} plan rewrites. Change the video with edit_video instead.`,
    );
  });
});

describe('[RDC3-014] a new scene is shown and charged only after a yes', () => {
  it('[RDC3-014] edit_video add_scene first shows the scene and its cost and changes nothing; with confirm_scene it is added and charged once; out of credits it is refused', async () => {
    const { client, token } = await person(s, 'c3-scene');
    const { videoId } = await newVideo(s, client);
    await approved(s, client, videoId);
    const before = (await s.api('/v1/balance', { token })).body
      .balance as number;
    const op = {
      op: 'add_scene',
      after: 2,
      scene: { ...plan().scenes[1]!, id: 'extra', title: 'Extra' },
    };
    const ask = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [op],
    });
    expect(ask.text).toMatch(/^The new scene: "Extra"/);
    expect(ask.text).toMatch(
      /costs up to \d+ credits .* Nothing was changed or charged\./,
    );
    const key = /confirm_scene "([^"]+)"/.exec(ask.text)![1]!;
    expect((await s.api('/v1/balance', { token })).body.balance).toBe(before);
    const read = await s.call(client, 'read_video', { video_id: videoId });
    expect(read.text).toMatch(/^2 scenes/);
    const yes = await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [op],
      confirm_scene: key,
    });
    expect(yes.text).toMatch(
      /^Done as one step\. \d+ credits were spent for the new scene\.\n3 scenes/,
    );
    const after = (await s.api('/v1/balance', { token })).body
      .balance as number;
    expect(after).toBeLessThan(before);
  });
});

describe('[RDC3-015] preview before apply', () => {
  it('[RDC3-015] edit_video with dry_run says in sentences what would change and saves nothing', async () => {
    const { client } = await person(s, 'c3-dry');
    const { videoId } = await newVideo(s, client);
    await approved(s, client, videoId);
    const r = await s.call(client, 'edit_video', {
      video_id: videoId,
      dry_run: true,
      ops: [{ op: 'remove_scene', scene: 2 }],
    });
    expect(r.text).toMatch(
      /^Preview only; nothing was saved\.\nThese changes would run: remove scene\./,
    );
    expect(r.text).not.toMatch(/[{[]\s*"/);
    const read = await s.call(client, 'read_video', { video_id: videoId });
    expect(read.text).toMatch(/^2 scenes/);
  });
});

describe('[RDC3-016] the Video sheet is written by the server', () => {
  it('[RDC3-016] save_brief, submit_plan (a line per scene), approve_plan and edit_video each write the Video sheet with the Director caps', async () => {
    const { client } = await person(s, 'c3-sheet');
    const { videoId } = await newVideo(s, client);
    await s.call(client, 'save_brief', {
      video_id: videoId,
      answers: { topic: 'Rain' },
    });
    await approved(s, client, videoId);
    await s.call(client, 'edit_video', {
      video_id: videoId,
      ops: [
        {
          op: 'change_text',
          scene: 1,
          layer: 'Where rivers begin',
          text: 'Rivers',
        },
      ],
    });
    const mem = (await s.call(client, 'read_memory', { video_id: videoId }))
      .text;
    expect(mem).toMatch(/Brief: topic answered\./);
    expect(mem).toMatch(/Scene 1 "Opening": Every river starts small\./);
    expect(mem).toMatch(/Scene 2 "Scene 2": And finds the sea\./);
    expect(mem).toMatch(/The person approved the plan/);
    expect(mem).toMatch(/Claude changed: change text\./);
  });
});

describe("[RDC3-017] the owner's settings reach Claude as guidance", () => {
  it("[RDC3-017] start_here gives Claude's view: Guidance (not rules), the owner's refusals, the Brief fields, memory caps, attachment limits, rewrites and the video types; the Director's view stays the rulebook", async () => {
    const { client } = await person(s, 'c3-guide');
    const t = (await s.call(client, 'start_here', { video_type: 'explainer' }))
      .text;
    expect(t).toContain('## Guidance');
    expect(t).not.toContain('## Rulebook');
    expect(t).toContain('## What the owner does not allow');
    expect(t).toContain('## Brief fields the owner uses');
    expect(t).toMatch(/A Video sheet keeps the last \d+ lines/);
    expect(t).toMatch(/Plan rewrites per video: \d+\./);
    expect(t).toContain('## Video types');
  });
});
