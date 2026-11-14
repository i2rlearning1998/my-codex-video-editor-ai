// RDC1-010: every plan that existed before Round C1 builds to the SAME
// project (the snapshots were written by the Round B builder, before any
// Round C1 change to src/video-plan/build.ts).
import { describe, expect, it } from 'vitest';
import { buildVideoFromPlan } from '../../src/video-plan';
import { OLD_PLANS, oldDeps, stable } from './old-plans';

describe('[RDC1-010] old plans build the same project', () => {
  for (const [name, plan] of Object.entries(OLD_PLANS))
    it(`[RDC1-010] ${name}`, async () => {
      const a = await buildVideoFromPlan(plan, oldDeps());
      expect(a.errors).toEqual([]);
      const b = await buildVideoFromPlan(plan, oldDeps());
      expect(stable(b.project)).toEqual(stable(a.project));
      await expect(
        JSON.stringify(
          { project: stable(a.project), flags: a.flags, resolved: a.resolved },
          null,
          1,
        ),
      ).toMatchFileSnapshot(`./__snapshots__/old-${name}.json`);
    });
});
