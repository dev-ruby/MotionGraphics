'use strict';

const duration = 10;

const ink = `
  precision highp float;
  const vec3 paper = vec3(244.0, 241.0, 232.0) / 255.0;
  const vec3 coal = vec3(25.0, 25.0, 23.0) / 255.0;

  vec3 pigment(float mark) {
    return mix(paper, coal, mark);
  }
`;

const fieldVertex = `
  attribute vec2 a_uv;
  void main() { gl_Position = vec4(a_uv, 0.0, 1.0); }
`;

const fieldFragment = ink + `
  uniform vec2 u_size;
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

const plateVertex = `
  attribute vec3 a_local;
  attribute vec2 a_cell;
  attribute float a_face;
  varying vec3 v_local;
  varying vec2 v_board;
  varying float v_face;
  uniform vec2 u_aspect;
  uniform float u_time;
  uniform float u_release;

  const float pi = 3.14159265359;

  vec2 rotate(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  float ease(float t) {
    t = clamp(t, 0.0, 1.0);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  void main() {
    float diagonal = a_cell.x - a_cell.y + 10.0;
    float distance = (abs(a_cell.x) + abs(a_cell.y)) / 10.0;
    float forward = ease((u_time - 0.48 - 0.09 * diagonal) / 1.05);
    float backward = ease((u_time - 6.88 - 1.72 * (1.0 - distance)) / 1.10);
    float turn = pi * (forward + backward);
    float lift = 0.82 * abs(sin(turn));

    // Square rings take turns in opposite directions around the same center.
    float ring = max(abs(a_cell.x), abs(a_cell.y)) / 5.0;
    float spin = u_release * (1.13 - 1.71 * ring);
    float offset = sin(0.84 * a_cell.x - 0.76 * a_cell.y);
    float height = u_release * (2.3 * sin(pi * (0.18 + 0.78 * ring)) + 0.45 * offset - 0.70);
    vec2 center = rotate(a_cell, spin) * (1.0 + u_release * (0.16 + 0.12 * ring));

    vec3 plate = a_local;
    float handedness = 1.0 - 2.0 * mod(a_cell.y + 5.0, 2.0);
    plate.xz = rotate(plate.xz, handedness * turn + 0.46 * u_release * offset);
    plate.yz = rotate(plate.yz, u_release * (0.23 + 0.36 * sin(0.61 * a_cell.x + a_cell.y)));
    plate.xy = rotate(plate.xy, spin + 0.15 * u_release * offset);

    float phase = 2.0 * pi * u_time / 10.0;
    vec3 point = plate + vec3(center, height + lift);
    point.yz = rotate(point.yz, 0.09 + 0.055 * sin(phase) + 0.48 * u_release);
    point.xz = rotate(point.xz, 0.04 + 0.08 * sin(phase) + 0.22 * u_release);
    point.xy = rotate(point.xy, -0.04 * sin(phase) - 0.11 * u_release);
    point.y += 0.24 * u_release;

    float scale = 0.143 / (1.0 + 0.72 * u_release);
    gl_Position = vec4(point.xy * u_aspect * scale, -point.z * 0.16, 1.0 - point.z * 0.034);
    v_local = a_local;
    v_board = (a_cell + vec2(a_local.x * a_face, a_local.y)) / 5.5;
    v_face = a_face;
  }
`;

const plateFragment = ink + `
  varying vec3 v_local;
  varying vec2 v_board;
  varying float v_face;

  float arrow(vec2 p) {
    float stem = step(-0.75, p.x) * step(p.x, 0.17) * step(abs(p.y), 0.15);
    float head = step(0.07, p.x) * step(abs(p.y), (0.75 - p.x) * 0.74);
    return max(stem, head);
  }

  void main() {
    vec2 edge = abs(v_local.xy);
    float bevel = max(max(edge.x, edge.y), (edge.x + edge.y + 0.063) * 0.5);
    float rim = step(0.434, bevel);
    float mark = step(0.012, abs(v_local.z));
    if (v_face > 0.5) mark = max(rim, arrow(v_board));
    if (v_face < -0.5) mark = max(rim, 1.0 - arrow(vec2(-v_board.x, v_board.y)));
    gl_FragColor = vec4(pigment(mark), 1.0);
  }
`;

function createProgram(gl, vertexSource, fragmentSource, attributes, uniforms) {
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
    attributes: attributes.map(([name, components]) => [gl.getAttribLocation(program, `a_${name}`), components]),
    uniform: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, `u_${name}`)])),
  };
}

function createMesh(gl) {
  const side = 0.457;
  const corner = side - 0.065;
  const depth = 0.05;
  const outline = [[corner, side], [-corner, side], [-side, corner], [-side, -corner],
    [-corner, -side], [corner, -side], [side, -corner], [side, corner]];
  const center = [0, 0];
  const vertices = [];

  for (let y = -5; y <= 5; y++) {
    for (let x = -5; x <= 5; x++) {
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        vertices.push(
          ...center, depth, x, y, 1, ...a, depth, x, y, 1, ...b, depth, x, y, 1,
          ...center, -depth, x, y, -1, ...b, -depth, x, y, -1, ...a, -depth, x, y, -1,
          ...a, depth, x, y, 0, ...a, -depth, x, y, 0, ...b, -depth, x, y, 0,
          ...a, depth, x, y, 0, ...b, -depth, x, y, 0, ...b, depth, x, y, 0,
        );
      }
    }
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  return { buffer, count: vertices.length / 6 };
}

function ease(start, end, time) {
  const x = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return x * x * x * (x * (6 * x - 15) + 10);
}

function createRenderer(gl) {
  const field = createProgram(gl, fieldVertex, fieldFragment, [['uv', 2]], ['size', 'view']);
  const tiles = createProgram(gl, plateVertex, plateFragment, [['local', 3], ['cell', 2], ['face', 1]], ['aspect', 'time', 'release']);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const mesh = createMesh(gl);
  gl.disable(gl.DITHER);

  function bind(pass, buffer, componentsPerVertex) {
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const bytes = Float32Array.BYTES_PER_ELEMENT;
    let offset = 0;
    for (const [location, components] of pass.attributes) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, components, gl.FLOAT, false, componentsPerVertex * bytes, offset * bytes);
      offset += components;
    }
  }

  return (time, width, height) => {
    const release = ease(3.72, 5.34, time) * (1 - ease(5.59, 6.97, time));
    const span = Math.min(width, height);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    bind(field, quad, 2);
    gl.uniform2f(field.uniform.size, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(field.uniform.view, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    bind(tiles, mesh.buffer, 6);
    gl.uniform2f(tiles.uniform.aspect, span / width, span / height);
    gl.uniform1f(tiles.uniform.time, time % duration);
    gl.uniform1f(tiles.uniform.release, release);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    for (const [location] of tiles.attributes) gl.disableVertexAttribArray(location);
  };
}

startStudy({ createRenderer, duration, stillTime: 2.15 });
