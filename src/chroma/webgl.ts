import {
  settings,
  colorChannels,
  validateFrame,
  type ChromaKey,
  type PixelFrame,
} from './types';
export interface ChromaGpu {
  process(frame: PixelFrame, input: Readonly<ChromaKey>): PixelFrame;
  dispose(): void;
}
export const CHROMA_FRAGMENT = `precision highp float;
varying vec2 uv; uniform sampler2D image; uniform vec3 key; uniform float similarity; uniform float smoothness; uniform float spill; uniform float inverted; uniform int dominant;
void main(){vec4 c=texture2D(image,uv);float d=distance(c.rgb,key)/sqrt(3.0);float t=smoothness>0.0?clamp((d-similarity)/smoothness,0.0,1.0):(d>similarity?1.0:0.0);float keep=t*t*(3.0-2.0*t);float other=dominant==0?max(c.g,c.b):dominant==1?max(c.r,c.b):max(c.r,c.g);float amount=spill*(1.0-keep);if(dominant==0)c.r-=amount*max(0.0,c.r-other);else if(dominant==1)c.g-=amount*max(0.0,c.g-other);else c.b-=amount*max(0.0,c.b-other);c.a*=inverted>0.5?1.0-keep:keep;gl_FragColor=c;}`;
export function createWebGlChroma(): ChromaGpu | null {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1, 1)
      : typeof document !== 'undefined'
        ? document.createElement('canvas')
        : null;
  if (!canvas) return null;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  }) as WebGLRenderingContext | null;
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('Shader allocation failed');
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      throw new Error('Chroma shader compilation failed');
    }
    return s;
  };
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null,
    texture: WebGLTexture | null = null;
  try {
    const vertex = shader(
        gl.VERTEX_SHADER,
        'attribute vec2 position; varying vec2 uv; void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}',
      ),
      fragment = shader(gl.FRAGMENT_SHADER, CHROMA_FRAGMENT);
    program = gl.createProgram();
    if (!program) throw new Error('Program allocation failed');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('Chroma shader linking failed');
    buffer = gl.createBuffer();
    texture = gl.createTexture();
    if (!buffer || !texture) throw new Error('GPU allocation failed');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const current = program;
    return {
      process(frame, input) {
        validateFrame(frame);
        if (gl.isContextLost()) throw new Error('WebGL context lost');
        const p = settings(input),
          key = colorChannels(p.color);
        if (canvas.width !== frame.width) canvas.width = frame.width;
        if (canvas.height !== frame.height) canvas.height = frame.height;
        gl.viewport(0, 0, frame.width, frame.height);
        gl.useProgram(current);
        gl.disable(gl.BLEND);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const loc = gl.getAttribLocation(current, 'position');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          frame.width,
          frame.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(frame.data),
        );
        gl.uniform1i(gl.getUniformLocation(current, 'image'), 0);
        gl.uniform3fv(gl.getUniformLocation(current, 'key'), key);
        gl.uniform1i(
          gl.getUniformLocation(current, 'dominant'),
          key.indexOf(Math.max(...key)),
        );
        for (const [name, value] of Object.entries({
          similarity: p.similarity,
          smoothness: p.smoothness,
          spill: p.spill,
          inverted: p.invert ? 1 : 0,
        }))
          gl.uniform1f(gl.getUniformLocation(current, name), value);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        const data = new Uint8Array(frame.data.length);
        gl.readPixels(
          0,
          0,
          frame.width,
          frame.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data,
        );
        if (gl.getError() !== gl.NO_ERROR)
          throw new Error('WebGL chroma readback failed');
        return {
          width: frame.width,
          height: frame.height,
          data: new Uint8ClampedArray(data),
        };
      },
      dispose() {
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(current);
      },
    };
  } catch {
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    return null;
  }
}
