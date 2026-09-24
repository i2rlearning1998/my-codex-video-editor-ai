#!/usr/bin/env bash
# DEV-008: regenerates tests/fixtures/media. Needs an ffmpeg 7 build with libx264,
# libvpx-vp9, libopus, libvorbis, libmp3lame, libwebp and aac (for example the static
# binary inside the imageio-ffmpeg wheel), plus python3 for the EXIF and manifest steps.
# Usage: FFMPEG=/path/to/ffmpeg scripts/make-media-fixtures.sh
set -euo pipefail
FF="${FFMPEG:-ffmpeg}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/tests/fixtures/media"
mkdir -p "$OUT"
cd "$OUT"
q=(-hide_banner -loglevel error -y)
flags=(-map_metadata -1 -fflags +bitexact -flags:v +bitexact -flags:a +bitexact)

# Video: moving test pattern with a 440 Hz tone, 2 s.
"$FF" "${q[@]}" -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=2" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=2" \
  -c:v libvpx-vp9 -b:v 300k -deadline good -cpu-used 4 -row-mt 1 \
  -c:a libopus -b:a 48k "${flags[@]}" video_testsrc_720p_2s_vp9_opus.webm
"$FF" "${q[@]}" -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=2" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=2" \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 64k -movflags +faststart "${flags[@]}" video_testsrc_1080p_2s_h264_aac.mp4
"$FF" "${q[@]}" -f lavfi -i "testsrc2=size=640x360:rate=25:duration=2" \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p "${flags[@]}" video_testsrc_360p_2s_h264.mov

# A/V sync: a white flash and a 1 kHz beep at the start of every second, 4 s.
sync_v="color=c=black:size=1280x720:rate=30:duration=4,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='lt(mod(t\,1)\,0.1)'"
sync_a="sine=frequency=1000:sample_rate=48000:duration=4,volume='if(lt(mod(t\,1)\,0.1)\,1\,0)':eval=frame"
"$FF" "${q[@]}" -f lavfi -i "$sync_v" -f lavfi -i "$sync_a" \
  -c:v libx264 -preset veryfast -crf 32 -pix_fmt yuv420p -c:a aac -b:a 64k \
  -movflags +faststart "${flags[@]}" video_av_sync_flash_beep_720p.mp4
"$FF" "${q[@]}" -f lavfi -i "$sync_v" -f lavfi -i "$sync_a" \
  -c:v libvpx-vp9 -b:v 150k -deadline good -cpu-used 4 -c:a libopus -b:a 48k \
  "${flags[@]}" video_av_sync_flash_beep_720p.webm

# Variable frame rate: 30 frames at 30 fps (0-1 s), then 30 frames at 10 fps (1-4 s).
"$FF" "${q[@]}" -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=2" \
  -vf "setpts='if(lt(N\,30)\,N/30\,1+(N-30)/10)/TB'" -fps_mode vfr \
  -c:v libx264 -preset veryfast -crf 32 -pix_fmt yuv420p -an "${flags[@]}" \
  video_vfr_720p_no_audio.mp4
# Rotation metadata: stored landscape 640x360, displayed upright portrait.
"$FF" "${q[@]}" -display_rotation:v:0 90 -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2" \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -an "${flags[@]}" \
  video_rotation90_metadata_portrait_no_audio.mp4
# Alpha: a red circle on a transparent background, VP9 with alpha.
"$FF" "${q[@]}" -f lavfi -i "color=c=red:size=320x320:rate=30:duration=2,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lt(hypot(X-160,Y-160),120),255,0)'" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 100k -deadline good -cpu-used 4 -auto-alt-ref 0 \
  "${flags[@]}" video_alpha_circle_vp9.webm

# Frame code: 4 s at 30 fps, 320x180. Blocks 0-6 (40 px wide each, from the left)
# are white when that bit of the frame number is set; block 7 is always grey.
code="color=c=black:size=320x180:rate=30:duration=4"
for b in 0 1 2 3 4 5 6; do
  code="$code,drawbox=x=$((b * 40)):y=40:w=40:h=100:color=white:t=fill:enable='gte(mod(n\\,$((2 ** (b + 1))))\\,$((2 ** b)))'"
done
code="$code,drawbox=x=280:y=40:w=40:h=100:color=gray:t=fill"
"$FF" "${q[@]}" -f lavfi -i "$code" -c:v libvpx-vp9 -crf 20 -b:v 0 -deadline good \
  -cpu-used 4 -g 30 "${flags[@]}" video_frame_code_320x180_4s.webm

# Audio: a 3 s 440 Hz tone in each container.
tone=(-f lavfi -i "sine=frequency=440:sample_rate=22050:duration=3")
"$FF" "${q[@]}" "${tone[@]}" -ac 1 -c:a pcm_s16le "${flags[@]}" audio_tone_440hz_3s.wav
"$FF" "${q[@]}" "${tone[@]}" -ac 1 -c:a libmp3lame -b:a 64k "${flags[@]}" audio_tone_440hz_3s.mp3
"$FF" "${q[@]}" "${tone[@]}" -ac 1 -c:a libvorbis -q:a 2 "${flags[@]}" audio_tone_440hz_3s.ogg
"$FF" "${q[@]}" "${tone[@]}" -ac 1 -c:a aac -b:a 64k "${flags[@]}" audio_tone_440hz_3s.m4a

# Images.
"$FF" "${q[@]}" -f lavfi -i "gradients=size=1920x1080:c0=0x3040a0:c1=0xe0a030:duration=1:speed=0:seed=7" \
  -frames:v 1 "${flags[@]}" image_gradient_1920x1080.png
"$FF" "${q[@]}" -f lavfi -i "testsrc2=size=1200x800:rate=1" -frames:v 1 -q:v 5 \
  "${flags[@]}" image_testsrc_1200x800.jpg
"$FF" "${q[@]}" -f lavfi -i "testsrc2=size=800x600:rate=1" -frames:v 1 -c:v libwebp \
  -quality 60 "${flags[@]}" image_testsrc_800x600.webp
"$FF" "${q[@]}" -f lavfi -i "testsrc2=size=320x240:rate=10:duration=1" \
  -vf "split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse" -loop 0 \
  "${flags[@]}" image_animated_320x240.gif
"$FF" "${q[@]}" -f lavfi -i "color=c=0x4f46e5:size=512x512,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-256,Y-256),200),255,0)'" \
  -frames:v 1 "${flags[@]}" image_alpha_logo_512.png
# EXIF orientation 6: stored 1600x1200 landscape, displayed 1200x1600 portrait.
# Stored pixels: a red block in the top-left corner on blue, so the displayed
# (rotated 90 degrees clockwise) image has its red block in the top-right corner.
"$FF" "${q[@]}" -f lavfi -i "color=c=blue:size=1600x1200:rate=1,drawbox=x=0:y=0:w=400:h=300:color=red:t=fill" \
  -frames:v 1 -q:v 4 "${flags[@]}" exif_tmp.jpg
python3 - <<'PY'
import struct
data = open('exif_tmp.jpg', 'rb').read()
# Minimal little-endian TIFF with one IFD entry: Orientation (0x0112) SHORT = 6.
tiff = b'II*\x00' + struct.pack('<I', 8) + struct.pack('<H', 1) + struct.pack('<HHIHH', 0x0112, 3, 1, 6, 0) + struct.pack('<I', 0)
app1 = b'Exif\x00\x00' + tiff
segment = b'\xff\xe1' + struct.pack('>H', len(app1) + 2) + app1
open('image_exif_orientation6_1600x1200.jpg', 'wb').write(data[:2] + segment + data[2:])
PY
rm exif_tmp.jpg
cat > image_vector_logo.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" rx="24" fill="#1e1b4b"/><circle cx="200" cy="150" r="90" fill="#6366f1"/><path d="M170 110 L250 150 L170 190 Z" fill="#ffffff"/></svg>
SVG

# Negative cases: bytes that no browser can decode.
python3 -c "import random; random.seed(8); open('corrupt_random_bytes.mp4','wb').write(bytes(random.getrandbits(8) for _ in range(4096)))"
printf 'This is a plain text file, not media.\n' > not_media.txt

# Manifest (sizes and SHA-256 so a changed fixture is noticed).
python3 - <<'PY'
import hashlib, json, os
notes = {
  'video_testsrc_720p_2s_vp9_opus.webm': 'WebM VP9 1280x720 30 fps 2 s with Opus 440 Hz tone',
  'video_testsrc_1080p_2s_h264_aac.mp4': 'MP4 H.264 High 1920x1080 30 fps 2 s with AAC tone (needs Chrome/Edge; not decodable in open-source Chromium)',
  'video_testsrc_360p_2s_h264.mov': 'QuickTime MOV H.264 640x360 25 fps 2 s, no audio (needs Chrome/Edge)',
  'video_av_sync_flash_beep_720p.mp4': 'MP4 H.264/AAC 1280x720 4 s: white flash and 1 kHz beep for 0.1 s at each whole second',
  'video_av_sync_flash_beep_720p.webm': 'Same A/V sync pattern as the MP4, VP9/Opus, decodable in Chromium',
  'video_vfr_720p_no_audio.mp4': 'MP4 H.264 1280x720 variable frame rate: 30 fps for 0-1 s, 10 fps for 1-4 s, no audio',
  'video_rotation90_metadata_portrait_no_audio.mp4': 'MP4 H.264 stored 640x360 with 90 degree display rotation: shows 360x640 portrait',
  'video_alpha_circle_vp9.webm': 'WebM VP9 with alpha 320x320 2 s: red circle on transparency',
  'audio_tone_440hz_3s.wav': 'WAV PCM 16-bit mono 22.05 kHz 3 s 440 Hz',
  'audio_tone_440hz_3s.mp3': 'MP3 64 kb/s mono 3 s 440 Hz',
  'audio_tone_440hz_3s.ogg': 'Ogg Vorbis mono 3 s 440 Hz',
  'audio_tone_440hz_3s.m4a': 'M4A AAC mono 3 s 440 Hz (needs Chrome/Edge)',
  'image_gradient_1920x1080.png': 'PNG 1920x1080 opaque gradient',
  'image_testsrc_1200x800.jpg': 'JPEG 1200x800 test pattern',
  'image_testsrc_800x600.webp': 'WebP 800x600 test pattern',
  'image_animated_320x240.gif': 'Animated GIF 320x240, 10 frames, loops',
  'image_alpha_logo_512.png': 'PNG RGBA 512x512: indigo disc on transparency',
  'image_exif_orientation6_1600x1200.jpg': 'JPEG stored 1600x1200 (red top-left block on blue) with EXIF Orientation 6: shows 1200x1600 portrait with the red block top-right',
  'video_frame_code_320x180_4s.webm': 'WebM VP9 320x180 30 fps 4 s: frame number in binary as seven white blocks (bit 0 leftmost, 40 px each) plus a grey block',
  'image_vector_logo.svg': 'SVG 400x300 logo',
  'corrupt_random_bytes.mp4': 'Negative case: 4 KiB of random bytes with a .mp4 name',
  'not_media.txt': 'Negative case: plain text',
}
files = []
for name in sorted(notes):
    data = open(name, 'rb').read()
    files.append({'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'description': notes[name]})
extra = sorted(set(os.listdir('.')) - set(notes) - {'manifest.json'})
assert not extra, extra
json.dump({'generator': 'scripts/make-media-fixtures.sh (ffmpeg 7.0.2 static)', 'files': files}, open('manifest.json', 'w'), indent=2)
open('manifest.json', 'a').write('\n')
PY
echo "Wrote $(ls | wc -l) files to $OUT"
