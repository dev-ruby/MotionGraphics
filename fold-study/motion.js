'use strict';

const duration = 10;
const tau = 2 * Math.PI;

// The field and ribbon use the same hard-edged wipe and the same two inks.
const ink = `
  precision highp float;
  uniform vec2 u_size;
  uniform float u_wipe;
  const vec3 paper = vec3(244.0, 241.0, 232.0) / 255.0;
  const vec3 coal = vec3(25.0, 25.0, 23.0) / 255.0;

  vec3 pigment(float mark) {
    vec2 uv = gl_FragCoord.xy / u_size;
    float dark = step(uv.x + 0.24 * (1.0 - uv.y), u_wipe);
    return mix(paper, coal, abs(mark - dark));
  }
`;

const fieldVertex = `
  attribute vec2 a_uv;
  void main() { gl_Position = vec4(a_uv, 0.0, 1.0); }
`;

const fieldFragment = ink + `
  uniform vec2 u_view;

  void main() {
    vec2 p = gl_FragCoord.xy * u_view / u_size;
    vec2 center = p - u_view * 0.5;
    vec2 edge = min(p, u_view - p);
    vec2 corner = edge - 16.5;
    float mark = 0.0;

    // Registration corners, two dotted axes and perimeter graduations.
    if ((abs(corner.x) < 0.55 && corner.y >= 0.0 && corner.y < 10.0) ||
        (abs(corner.y) < 0.55 && corner.x >= 0.0 && corner.x < 10.0)) mark = 1.0;
    if ((abs(center.x) < 0.55 && mod(center.y + 0.75, 12.0) < 1.5 && edge.y > 24.0) ||
        (abs(center.y) < 0.55 && mod(center.x + 0.75, 12.0) < 1.5 && edge.x > 24.0)) mark = 1.0;
    if ((abs(center.x) < 0.55 && edge.y < 8.0) ||
        (abs(center.y) < 0.55 && edge.x < 8.0)) mark = 1.0;

    gl_FragColor = vec4(pigment(mark), 1.0);
  }
`;

const ribbonVertex = `
  attribute vec2 a_uv;
  varying vec2 v_uv;
  uniform vec2 u_aspect;
  uniform float u_phase;
  uniform float u_open;

  vec2 rotate(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  void main() {
    float t = a_uv.x * 6.28318530718;
    float v = a_uv.y * 2.0 - 1.0;
    float phase = u_phase;
    float lobe = 3.0 * t - phase;
    float radius = 2.03 + 0.74 * cos(lobe);
    vec3 radial = vec3(cos(2.0 * t), sin(2.0 * t), 0.0);
    vec3 azimuth = vec3(-radial.y, radial.x, 0.0);
    vec3 point = radius * radial + vec3(0.0, 0.0, 0.88 * sin(lobe));

    // A local frame lets the width twist independently along the closed knot.
    vec3 tangent = normalize(-2.22 * sin(lobe) * radial + 2.0 * radius * azimuth
                            + vec3(0.0, 0.0, 2.64 * cos(lobe)));
    vec3 across = normalize(radial - tangent * dot(radial, tangent));
    vec3 normal = cross(tangent, across);
    float twist = t + 0.66 * sin(lobe) + 0.48 * sin(phase);
    vec3 width = cos(twist) * across + sin(twist) * normal;
    vec3 camber = cross(tangent, width);
    float taper = 0.51 + 0.105 * cos(lobe + 0.7);
    point += v * taper * width + 0.16 * (v * v - 0.25) * camber;

    point.yz = rotate(point.yz, 0.49 + 0.32 * cos(phase + 0.9));
    point.xz = rotate(point.xz, -0.31 + 0.30 * sin(phase));
    point.xy = rotate(point.xy, -0.26 + phase + 0.18 * sin(phase));
    point.y *= u_open;

    float scale = 0.263 + 0.016 * sin(phase - 0.5);
    gl_Position = vec4(point.xy * u_aspect * scale, -point.z * 0.14, 1.0 - point.z * 0.11);
    v_uv = a_uv;
  }
`;

const ribbonFragment = ink + `
  varying vec2 v_uv;

  void main() {
    float v = gl_FrontFacing ? v_uv.y : 1.0 - v_uv.y;
    float panel = step(0.16, v) * (1.0 - step(0.33, v));
    float hairlines = step(0.78, fract(v * 13.0));
    float binding = step(0.95, v) + (1.0 - step(0.034, v));
    float mark = max(max(panel, hairlines), binding);
    if (!gl_FrontFacing) mark = max(binding, 1.0 - mark);
    gl_FragColor = vec4(pigment(mark), 1.0);
  }
`;

function createProgram(gl, vertexSource, fragmentSource, uniforms) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

  return {
    program,
    uv: gl.getAttribLocation(program, 'a_uv'),
    uniform: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, `u_${name}`)])),
  };
}

function createMesh(gl) {
  const lengthSteps = 432;
  const widthSteps = 18;
  const row = widthSteps + 1;
  const vertices = new Float32Array((lengthSteps + 1) * row * 2);
  const indices = new Uint16Array(lengthSteps * widthSteps * 6);
  let vertex = 0;
  let index = 0;

  for (let u = 0; u <= lengthSteps; u++) {
    for (let v = 0; v <= widthSteps; v++) {
      vertices[vertex++] = u / lengthSteps;
      vertices[vertex++] = v / widthSteps;
      if (u < lengthSteps && v < widthSteps) {
        const a = u * row + v;
        indices.set([a, a + row, a + 1, a + 1, a + row, a + row + 1], index);
        index += 6;
      }
    }
  }

  const surface = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, surface);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const triangles = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangles);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  return { surface, triangles, count: indices.length };
}

function ease(start, end, time) {
  const x = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return x * x * x * (x * (6 * x - 15) + 10);
}

function createRenderer(gl) {
  const field = createProgram(gl, fieldVertex, fieldFragment, ['size', 'view', 'wipe']);
  const ribbon = createProgram(gl, ribbonVertex, ribbonFragment, ['size', 'wipe', 'aspect', 'phase', 'open']);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const mesh = createMesh(gl);
  gl.disable(gl.DITHER);

  function bind(pass, buffer, wipe) {
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(pass.uv);
    gl.vertexAttribPointer(pass.uv, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(pass.uniform.size, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(pass.uniform.wipe, wipe);
  }

  return (time, width, height) => {
    const phase = (time % duration) / duration * tau;
    const opening = ease(0.02, 2.25, time) * (1 - ease(7.85, 9.95, time));
    const inversion = ease(4.13, 5.04, time) * (1 - ease(7.08, 7.97, time));
    const wipe = -0.015 + 1.27 * inversion;
    const span = Math.min(width, height);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    bind(field, quad, wipe);
    gl.uniform2f(field.uniform.view, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    bind(ribbon, mesh.surface, wipe);
    gl.uniform2f(ribbon.uniform.aspect, span / width, span / height);
    gl.uniform1f(ribbon.uniform.phase, phase);
    gl.uniform1f(ribbon.uniform.open, 0.08 + 0.92 * opening);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.triangles);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  };
}

startStudy({ createRenderer, duration, stillTime: 2.85 });
