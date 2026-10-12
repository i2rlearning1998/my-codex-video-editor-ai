# AI authoring prompt / editable motion graphics

Paste this system prompt into Claude/GPT, then describe the animation. Runtime
usage and limits are in [FREECODE.md](FREECODE.md). The full tier contract lives in
[CODE-TIERS-SPEC.md](specs/CODE-TIERS-SPEC.md).

## System prompt

```text
You author original motion graphics for an AI-native video editor. Choose the
most editable representation that preserves the requested quality:
A: Composition Spec v1 JSON using src/ai-spec and its actual schema. Prefer A
   whenever native layers, keyframes, shapes, text and effects can express it.
B: the restricted src/blocks object accepted by compileBlock. Prefer B for
   closed-form Canvas animations with editable params. Follow CODE-LAYER.md;
   B is not unrestricted JavaScript and cannot retain simulation state.
C: this Free-code contract only when A/B cannot preserve the intended result
   (stateful simulations, complex gradients/blends, WebGL, 3D or library content).
Never pick C merely because it is easier to write. Explain the choice briefly
outside the source. ALWAYS expose meaningful editable params: colours, text,
counts, speeds, sizes, etc. The host supplies a fixed seed. Do not hard-code
user-facing content that could sensibly be a parameter. Do not copy templates
or animations from other creators; author original assets and compositions.

For C return one complete JavaScript module string with export default { ... }
or window.__block = { ... }. Top-level variables/classes/functions are allowed.
Do not import anything. Export a literal object containing exactly one literal
meta, one async init method and one renderFrame method. No TypeScript annotations.

meta: { id: safeSlug, name, version:'1.0.0', category, duration:0.1..120,
        fps:optional1..120, seekable:false, keepFrame:false, thumbnailTime,
        libs:[], params:[] }
init({canvas, ctx, gl, params, size:{width,height}, fps, duration, seed, libs, rng})
renderFrame({t,frame,dt})

meta must contain literal JSON: no variables, calls, spread, computed keys or
getters. ParamSpec reuses src/blocks. All specs need name,label,type,default.
number: also min,max,step>0; defaults must be in range. color: #RRGGBB or
#RRGGBBAA. text: optional maxLength <=1000 (default 200). bool: boolean.
select: options array of unique strings, default in options. Maximum 32 specs.
Source <=1 MiB UTF-8. Never resize the host canvas or mutate params.

ctx and gl are lazy getters. For Canvas2D destructure ctx. For WebGL/three/PIXI,
destructure canvas and libs but DO NOT destructure ctx (it would lock the canvas
to 2D). Select canvas.getContext('webgl'/'webgl2') or use a renderer. Use
helpers.rendererOptions(canvas) when constructing THREE.WebGLRenderer or
PIXI.Renderer; it forces alpha and preserveDrawingBuffer. Use libs.three,
libs.PIXI and libs.lottie after declaring 'three','pixi','lottie' in meta.libs.
Only those locally bundled libraries exist. GSAP is unavailable due to licence
uncertainty; use helpers.ease/spring and explicit time formulas instead.

Init is awaited. It may decode inline data: image/font assets; no external URL.
Await every required asset before finishing init. Lottie animationData must be
inline JSON, renderer:'canvas', autoplay:false, loop:false; use goToAndStop with
an explicit frame. Lottie owns canvas clearing, so keepFrame:true is appropriate.
Timers/RAF do nothing; do not await timer-driven DOMLoaded callbacks or tickers.
Drive every library explicitly in renderFrame. No network, imports, storage,
cookies, parent/top/opener/frames, form submission, eval or Function.

Time is t seconds. dt is zero on frame zero, 1/fps thereafter. Date.now and
performance.now expose t*1000 milliseconds; do not use new Date() as a clock.
Math.random and rng are seeded; prefer helpers.rng(seed) or rngFor(seed,index)
when explicitly reconstructing a seekable scene. A seekable frame's Math.random
stream resets to the session seed. Use no real clock, asynchronous animation
loop, browser size, devicePixelRatio or unseeded inputs. Use the given dimensions.

A stateful simulation gets frames 0..ceil(duration*fps)-1 in order. Initial state
belongs in init and the fixed-step update belongs in renderFrame. Seekable:true
promises arbitrary frame ordering, including 3->1->3 and repeated frames: derive
all rendered state from t and fixed initial data. Do not claim seekability for
an integrator. Host clears to transparency each frame unless keepFrame:true.
For trails use keepFrame:true and destination-out fading; do not paint an opaque
background unless the design needs it. Balance Canvas save/restore calls.

Available helpers (global helpers, also passed to init):
clamp(x,a=0,b=1), lerp(a,b,t), map(x,a,b,c,d), rng(seed)->generator,
rngFor(seed,index)->number, ease(name,t) using linear/ease-in/ease-out/
ease-in-out/hold, spring(t,frequency=2.4,damping=.62),
valueNoise(seed,x,y), simplexNoise(seed,x,y),
vec.add(a,b), vec.scale(a,s), vec.length(a), vec.normalize(a),
emitter(seed,count,{x,y},speed)->particles {x,y,vx,vy,age,life},
splitText(ctx,text,'character'|'word')->[{text,x,width}],
pathLength(svgPathString), drawPath(ctx,svgPathString,progress),
hex('#RRGGBBAA')->{r,g,b,a}, hsl(h,sPercent,lPercent,a=1),
gradient(ctx,{x,y},{x,y},[[offset,color],...]), rendererOptions(canvas).
Emitter initializes particles; author the fixed-step update/collisions yourself.
Character splitting uses Unicode code points, not full grapheme segmentation.

Keep CPU/GPU/memory bounded. Direct named array allocations have a cumulative
64 MiB estimate limit; loops/functions face a cooperative step/time budget.
Do not try to bypass guards. Per-frame default timeout is 5 s and session total
120 s. These limits are rejection limits, not desired performance targets.
Design for 1080p: coherent palette, intentional spacing, strong hierarchy, clean
easing, depth and a useful thumbnail pose. Avoid flicker and random per-frame
layout. Transparent margins help compositing. Verify two complete bakes in the
same browser/machine, and inspect the thumbnail plus several animation poses.
Never claim pixel parity across browsers or GPUs.
```

## Ask the AI like this

- “Use native Tier A if possible: an editable title and three bars with keyframes.
  Follow the repository's actual Composition Spec v1 schema.”
- “Use Tier B for a deterministic lower third. Expose speaker, role, accent,
  width and entrance duration; prove 3 → 1 → 3 gives the same frame.”
- “Use Tier C only if necessary: transparent bouncing particles with collisions
  and fading trails. Expose count, colour and speed. Use a fixed timestep.”
- “Create a procedural 3D sculpture with three.js, no external models or textures.
  Expose material colours, detail count and motion speed; keep the canvas alpha.”
- “Revise the source without changing its ID: calmer timing, fewer particles and
  warmer default colours. Keep all existing editable parameters working.”

## Complete example 1: stateful Canvas simulation

Sequential particles with elastic collisions and alpha trails. Restart the session
when params change; it cannot scrub directly without a bake.

```js
let c, p, w, h;
let particles;
export default {
  meta: {
    id: 'particles',
    name: '01 / Collision field',
    version: '1.0.0',
    category: 'Original studies',
    duration: 4,
    fps: 24,
    seekable: false,
    keepFrame: true,
    thumbnailTime: 2,
    libs: [],
    params: [
      {
        name: 'accent',
        label: 'Accent',
        type: 'color',
        default: '#62f5d0',
      },
      {
        name: 'secondary',
        label: 'Secondary',
        type: 'color',
        default: '#8976ff',
      },
      {
        name: 'speed',
        label: 'Motion speed',
        type: 'number',
        min: 0.2,
        max: 2,
        step: 0.1,
        default: 1,
      },
      {
        name: 'count',
        label: 'Detail count',
        type: 'number',
        min: 8,
        max: 100,
        step: 1,
        default: 40,
      },
      {
        name: 'title',
        label: 'Title',
        type: 'text',
        default: 'FORM / MOTION',
        maxLength: 36,
      },
    ],
  },
  async init({ canvas, ctx, params, size, fps, seed, libs, rng }) {
    c = ctx;
    p = params;
    w = size.width;
    h = size.height;
    particles = helpers
      .emitter(seed, Math.round(p.count), { x: 960, y: 540 }, 180)
      .map((v, i) => ({
        ...v,
        x: 160 + rng() * 1600,
        y: 230 + rng() * 610,
        r: 6 + rng() * 12,
      }));
  },
  renderFrame({ t, frame, dt }) {
    c.save();
    c.scale(w / 1920, h / 1080);
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(0, 0, 1920, 1080);
    c.globalCompositeOperation = 'source-over';
    for (const a of particles) {
      a.x += a.vx * dt * p.speed;
      a.y += a.vy * dt * p.speed;
      if (a.x < a.r + 110 || a.x > 1810 - a.r) {
        a.vx *= -1;
        a.x = helpers.clamp(a.x, 110 + a.r, 1810 - a.r);
      }
      if (a.y < 210 + a.r || a.y > 900 - a.r) {
        a.vy *= -1;
        a.y = helpers.clamp(a.y, 210 + a.r, 900 - a.r);
      }
    }
    for (let i = 0; i < particles.length; i++)
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i],
          b = particles[j],
          dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy),
          r = a.r + b.r;
        if (d > 0 && d < r) {
          const nx = dx / d,
            ny = dy / d,
            impulse = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (impulse > 0) {
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
          }
          const k = (r - d) / 2;
          a.x -= nx * k;
          a.y -= ny * k;
          b.x += nx * k;
          b.y += ny * k;
        }
      }
    c.lineWidth = 1;
    c.strokeStyle = p.secondary;
    c.globalAlpha = 0.16;
    c.strokeRect(110, 210, 1700, 690);
    c.globalAlpha = 1;
    for (const a of particles) {
      c.shadowBlur = 18;
      c.shadowColor = p.accent;
      c.fillStyle = p.accent;
      c.beginPath();
      c.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      c.fill();
    }
    c.shadowBlur = 0;
    c.clearRect(0, 0, 1920, 180);
    c.fillStyle = '#dce8fa';
    c.font = '600 24px Arial';
    c.fillText(p.title, 110, 120);
    c.fillStyle = p.accent;
    c.fillRect(110, 144, 64, 3);
    c.fillStyle = '#8398b3';
    c.font = '20px Arial';
    c.fillText('KINETIC SYSTEMS     /     ELASTIC COLLISIONS', 110, 980);
    c.restore();
  },
};
```

## Complete example 2: procedural three.js

Procedural geometry and lighting. The 2D ctx getter is deliberately not requested.

```js
let scene, camera, renderer, group, p;
export default {
  meta: {
    id: 'three-scene',
    name: '02 / Orbital sculpture',
    version: '1.0.0',
    category: 'Original studies',
    duration: 4,
    fps: 24,
    seekable: true,
    keepFrame: false,
    thumbnailTime: 2,
    libs: ['three'],
    params: [
      {
        name: 'accent',
        label: 'Accent',
        type: 'color',
        default: '#62f5d0',
      },
      {
        name: 'secondary',
        label: 'Secondary',
        type: 'color',
        default: '#8976ff',
      },
      {
        name: 'speed',
        label: 'Motion speed',
        type: 'number',
        min: 0.2,
        max: 2,
        step: 0.1,
        default: 1,
      },
      {
        name: 'count',
        label: 'Detail count',
        type: 'number',
        min: 8,
        max: 100,
        step: 1,
        default: 40,
      },
      {
        name: 'title',
        label: 'Title',
        type: 'text',
        default: 'FORM / MOTION',
        maxLength: 36,
      },
    ],
  },
  async init({ canvas, params, size, fps, seed, libs, rng }) {
    p = params;
    const T = libs.three;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(38, size.width / size.height, 0.1, 100);
    camera.position.set(0, 0, 10);
    renderer = new T.WebGLRenderer(helpers.rendererOptions(canvas));
    renderer.setSize(size.width, size.height, false);
    renderer.setClearColor(0x000000, 0);
    scene.add(new T.AmbientLight(0xffffff, 1.2));
    const key = new T.DirectionalLight(0xffffff, 4);
    key.position.set(4, 5, 6);
    scene.add(key);
    const rim = new T.PointLight(p.secondary, 55);
    rim.position.set(-3, -2, 3);
    scene.add(rim);
    group = new T.Group();
    scene.add(group);
    const material = new T.MeshStandardMaterial({
      color: p.accent,
      metalness: 0.65,
      roughness: 0.23,
    });
    const center = new T.Mesh(
      new T.TorusKnotGeometry(1, 0.29, 180, 24),
      material,
    );
    group.add(center);
    for (let i = 0; i < Math.round(p.count); i++) {
      const a = (i / p.count) * Math.PI * 2;
      const mesh = new T.Mesh(
        new T.IcosahedronGeometry(0.06 + (i % 4) * 0.022, 1),
        new T.MeshStandardMaterial({
          color: i % 2 ? p.accent : p.secondary,
          metalness: 0.35,
          roughness: 0.3,
        }),
      );
      mesh.position.set(
        Math.cos(a) * 2.8,
        Math.sin(a) * 2.8,
        Math.sin(a * 3) * 0.5,
      );
      group.add(mesh);
    }
  },
  renderFrame({ t, frame, dt }) {
    const q = t * p.speed;
    group.rotation.set(
      0.25 + Math.sin(q * 0.4) * 0.2,
      q * 0.35,
      0.08 * Math.sin(q),
    );
    camera.position.x = Math.sin(q * 0.3) * 0.5;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  },
};
```

## Complete example 3: inline Lottie

Hand-made inline Lottie shape JSON with explicit frame control. No assets or timer-driven events.

```js
let animation, p;
export default {
  meta: {
    id: 'lottie-mark',
    name: '04 / Signal rings',
    version: '1.0.0',
    category: 'Original studies',
    duration: 4,
    fps: 24,
    seekable: true,
    keepFrame: true,
    thumbnailTime: 2,
    libs: ['lottie'],
    params: [
      {
        name: 'accent',
        label: 'Accent',
        type: 'color',
        default: '#62f5d0',
      },
      {
        name: 'secondary',
        label: 'Secondary',
        type: 'color',
        default: '#8976ff',
      },
      {
        name: 'speed',
        label: 'Motion speed',
        type: 'number',
        min: 0.2,
        max: 2,
        step: 0.1,
        default: 1,
      },
      {
        name: 'count',
        label: 'Detail count',
        type: 'number',
        min: 8,
        max: 100,
        step: 1,
        default: 40,
      },
      {
        name: 'title',
        label: 'Title',
        type: 'text',
        default: 'FORM / MOTION',
        maxLength: 36,
      },
    ],
  },
  async init({ canvas, ctx, params, size, fps, seed, libs, rng }) {
    p = params;
    const color = helpers.hex(p.accent),
      secondary = helpers.hex(p.secondary);
    const layers = [];
    for (let i = 0; i < Math.max(3, Math.round(p.count / 10)); i++)
      layers.push({
        ddd: 0,
        ind: i + 1,
        ty: 4,
        nm: 'Original ring ' + i,
        sr: 1,
        ks: {
          o: { a: 0, k: 100 - i * 10 },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [960, 540, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: {
            a: 1,
            k: [
              {
                t: 0,
                s: [35, 35, 100],
                e: [100, 100, 100],
                o: { x: 0.3, y: 0 },
                i: { x: 0.7, y: 1 },
              },
              { t: 72, s: [100, 100, 100] },
            ],
          },
        },
        ao: 0,
        shapes: [
          {
            ty: 'el',
            p: { a: 0, k: [0, 0] },
            s: { a: 0, k: [220 + i * 125, 220 + i * 125] },
            nm: 'Circle',
          },
          {
            ty: 'st',
            c: {
              a: 0,
              k: [
                (i % 2 ? color : secondary).r / 255,
                (i % 2 ? color : secondary).g / 255,
                (i % 2 ? color : secondary).b / 255,
                1,
              ],
            },
            o: { a: 0, k: 100 },
            w: { a: 0, k: 10 - i },
            lc: 2,
            lj: 2,
            nm: 'Stroke',
          },
        ],
        ip: 0,
        op: 96,
        st: 0,
        bm: 0,
      });
    const data = {
      v: '5.12.2',
      fr: 24,
      ip: 0,
      op: 96,
      w: 1920,
      h: 1080,
      nm: p.title,
      ddd: 0,
      assets: [],
      layers,
    };
    animation = libs.lottie.loadAnimation({
      renderer: 'canvas',
      loop: false,
      autoplay: false,
      animationData: data,
      rendererSettings: {
        context: ctx,
        clearCanvas: true,
        progressiveLoad: false,
        preserveAspectRatio: 'xMidYMid meet',
      },
    });
    animation.setSubframe(false);
  },
  renderFrame({ t, frame, dt }) {
    animation.goToAndStop(Math.min(95, frame * p.speed), true);
  },
};
```
