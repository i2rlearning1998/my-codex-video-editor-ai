import { describe, expect, it } from 'vitest';
import {
  codecMessage,
  probeNotes,
  probeRows,
} from '../src/ui/media-probe-info';
import type { MediaDetails } from '../src/media-probe';

const phone: MediaDetails = {
  kind: 'video',
  container: 'video/mp4',
  videoCodec: 'avc',
  audioCodec: null,
  width: 1080,
  height: 1920,
  rotation: 90,
  fps: null,
  isVariableFrameRate: true,
  durationSec: 4,
  audioChannels: null,
  sampleRate: null,
  bitrate: null,
  hasAudio: false,
  sizeBytes: 1000,
};

describe('FINAL2 U8 media probe info', () => {
  it('shows unknown values as Unknown and notes rotation and variable timing', () => {
    const rows = Object.fromEntries(probeRows(phone));
    expect(rows['Frame rate']).toBe('Unknown');
    expect(rows['Audio codec']).toBe('None');
    expect(rows['Rotation']).toBe('90°');
    expect(rows['Variable frame rate']).toBe('Yes');
    const notes = probeNotes(phone, 'clip.mp4');
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('upright automatically');
    expect(notes[1]).toContain('Nothing needs fixing');
  });
  it('turns a codec failure into a plain sentence', () => {
    expect(
      codecMessage('a.mp4', 'This browser cannot decode video codec hevc'),
    ).toContain('video format hevc');
    expect(codecMessage('a.mp4', 'Media metadata could not be read')).toBe(
      null,
    );
  });
});
