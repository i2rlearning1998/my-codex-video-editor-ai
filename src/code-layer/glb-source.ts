// P1-3D: a .glb model becomes a Tier C code animation. The model's bytes are
// embedded (base64) in the generated source, so the animation is one
// self-contained code layer: no schema change, no network, same bake path.
// The vendored THREE bundle carries GLTFLoader (src/freecode/build-vendor.mjs).

/** The code source limit is 1 MiB; base64 adds a third. */
export const GLB_MAX_BYTES = 700_000;

export class GlbError extends Error {}

/** Checks the binary glTF header (magic, version 2, declared length). */
export function checkGlb(bytes: Uint8Array): void {
  if (bytes.length < 20)
    throw new GlbError('This file is too small to be a .glb model.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67)
    throw new GlbError(
      'This is not a .glb model (binary glTF). Export it from your 3D tool as "glTF Binary (.glb)".',
    );
  if (view.getUint32(4, true) !== 2)
    throw new GlbError('Only glTF version 2 models are supported.');
  if (view.getUint32(8, true) > bytes.length)
    throw new GlbError('This .glb file is cut off (incomplete download?).');
  if (bytes.length > GLB_MAX_BYTES)
    throw new GlbError(
      `This model is ${(bytes.length / 1024).toFixed(0)} KB. For now models up to ${Math.round(GLB_MAX_BYTES / 1000)} KB work; simplify or compress its textures.`,
    );
}

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** The Tier C module for a model. */
export function glbToTierCSource(bytes: Uint8Array, fileName: string): string {
  checkGlb(bytes);
  const name =
    fileName.replace(/\.glb$/i, '').replace(/[^\p{L}\p{N} _.-]+/gu, '') ||
    'Model';
  const id =
    'glb-' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const meta = {
    id: id === 'glb-' ? 'glb-model' : id,
    name: `3D / ${name}`.slice(0, 60),
    version: '1.0.0',
    category: '3D models',
    duration: 6,
    fps: 24,
    seekable: true,
    keepFrame: false,
    thumbnailTime: 1,
    libs: ['three'],
    params: [
      {
        name: 'spin',
        label: 'Spin speed',
        type: 'number',
        min: -2,
        max: 2,
        step: 0.1,
        default: 0.4,
      },
      {
        name: 'size',
        label: 'Size',
        type: 'number',
        min: 0.3,
        max: 2,
        step: 0.05,
        default: 1,
      },
      {
        name: 'tilt',
        label: 'Tilt',
        type: 'number',
        min: -60,
        max: 60,
        step: 1,
        default: 12,
      },
      {
        name: 'light',
        label: 'Light',
        type: 'number',
        min: 0.2,
        max: 3,
        step: 0.1,
        default: 1.2,
      },
      { name: 'tint', label: 'Tint colour', type: 'color', default: '#ffffff' },
    ],
  };
  return `let scene,camera,renderer,pivot,p,ready;
const GLB="${toBase64(bytes)}";
export default {
 meta: ${JSON.stringify(meta, null, 1)},
 async init({canvas, params, size, libs}) {
  p=params;const T=libs.three;scene=new T.Scene();
  camera=new T.PerspectiveCamera(35,size.width/size.height,.1,200);camera.position.set(0,0,9);
  renderer=new T.WebGLRenderer(helpers.rendererOptions(canvas));renderer.setSize(size.width,size.height,false);renderer.setClearColor(0x000000,0);
  scene.add(new T.AmbientLight(0xffffff,p.light*.8));
  const key=new T.DirectionalLight(0xffffff,p.light*3);key.position.set(4,6,8);scene.add(key);
  const back=new T.DirectionalLight(0xffffff,p.light*1.2);back.position.set(-5,-2,-6);scene.add(back);
  const raw=atob(GLB),buf=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)buf[i]=raw.charCodeAt(i);
  const gltf=await new Promise((ok,fail)=>new T.GLTFLoader().parse(buf.buffer,'',ok,fail));
  const model=gltf.scene,box=new T.Box3().setFromObject(model),c=box.getCenter(new T.Vector3()),s=box.getSize(new T.Vector3());
  const k=3.2/(Math.max(s.x,s.y,s.z)||1);model.scale.setScalar(k);model.position.set(-c.x*k,-c.y*k,-c.z*k);
  const tint=new T.Color(p.tint);if(tint.getHex()!==0xffffff)model.traverse(o=>{if(o.isMesh&&o.material){o.material=o.material.clone();if(o.material.color)o.material.color.multiply(tint);}});
  pivot=new T.Group();pivot.add(model);pivot.scale.setScalar(p.size);pivot.rotation.x=p.tilt*Math.PI/180;scene.add(pivot);ready=true;
 },
 renderFrame({t}) {
  pivot.rotation.y=t*p.spin*Math.PI*2/3;renderer.render(scene,camera);
 }
};
`;
}

export const isGlbName = (name: string) => /\.glb$/i.test(name);

/** A file the AI importer takes: text as is, a .glb as a generated Tier C source. */
export async function importFileText(file: File): Promise<string> {
  if (!isGlbName(file.name)) return file.text();
  return glbToTierCSource(new Uint8Array(await file.arrayBuffer()), file.name);
}
