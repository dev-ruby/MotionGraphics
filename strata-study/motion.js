'use strict';

const duration = 10;
const tau = 2 * Math.PI;

const ink = `
  precision highp float;
  const vec3 paper = vec3(244.0, 241.0, 232.0) / 255.0;
  const vec3 coal = vec3(25.0, 25.0, 23.0) / 255.0;

  vec3 pigment(float mark) {
    return mix(paper, coal, mark);
  }
`;

const fieldVertex = `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
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
  attribute vec3 a_position;
  attribute vec2 a_uv;
  attribute vec2 a_layer;
  uniform vec2 u_aspect;
  uniform float u_phase;
  uniform float u_spread;
  uniform float u_lag;
  varying vec2 v_uv;
  varying vec2 v_print;
  varying float v_face;

  vec2 rotate(vec2 p, float angle) {
    float c = cos(angle), s = sin(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  void main() {
    float layer = a_layer.x;
    // Sample one rotation at different times from the bottom to the top.
    float samplePhase = u_phase + u_lag * (1.81 * layer + 0.34 * layer * layer);
    vec3 point = a_position;
    point.xz *= 1.0 - 0.10 * layer * layer;
    point.xz = rotate(point.xz, samplePhase - 0.52);
    point.xz += 0.19 * u_spread * vec2(sin(samplePhase + 2.8 * layer), cos(samplePhase + 2.8 * layer));
    point.y *= mix(1.0, 0.62, u_spread);
    point.y += layer * mix(1.28, 2.02, u_spread);
    point.yz = rotate(point.yz, 0.48 + 0.095 * sin(u_phase + 0.3));
    point.xy = rotate(point.xy, -0.07 + 0.08 * sin(u_phase));

    float w = 1.0 - 0.062 * point.z;
    gl_Position = vec4(point.xy * u_aspect * 0.343, -point.z * 0.23, w);
    v_uv = a_uv;
    v_print = a_position.xz;
    v_face = a_layer.y;
  }
`;

const plateFragment = ink + `
  varying vec2 v_uv;
  varying vec2 v_print;
  varying float v_face;

  void main() {
    float edge = max(1.0 - step(0.028, v_uv.y), step(0.972, v_uv.y));
    float hatch = step(0.59, fract(8.4 * (v_print.x + 0.62 * v_print.y)));
    float inkLine = step(0.19, v_uv.y) - step(0.213, v_uv.y);
    float mark;

    if (v_face < 0.5) {
      // Alternate broad ivory and engraved panels on the printed surface.
      float engravedPanel = step(0.5, fract(v_uv.x * 2.0 + 0.125));
      mark = max(max(edge, inkLine), hatch * engravedPanel);
    } else if (v_face < 1.5) {
      mark = max(edge, step(0.28, fract(9.2 * (v_print.x - v_print.y))));
    } else {
      float keyline = step(0.43, v_uv.y) - step(0.56, v_uv.y);
      float outerWall = 1.0 - keyline;
      float innerWall = max(edge, step(0.34, fract(32.0 * v_uv.x + 0.9 * v_uv.y)));
      mark = v_face < 2.5 ? outerWall : innerWall;
    }

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
    attributes: attributes.map(([name, size]) => [gl.getAttribLocation(program, 'a_' + name), size]),
    uniforms: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, 'u_' + name)])),
  };
}

function createPlates(gl) {
  const outline = [[-1.50, -0.73], [-1.08, -1.19], [0.83, -1.19], [1.42, -0.61],
    [1.42, 0.76], [1.02, 1.14], [-0.88, 1.14], [-1.50, 0.57]];
  const aperture = outline.map(([x, z]) => [0.53 * x + 0.16, 0.55 * z - 0.09]);
  const height = 0.087;
  const vertices = [];
  const triangles = [0, 1, 2, 0, 2, 3];
  const layerCount = 15;

  function quad(points, face, layer, u, nextU) {
    const coords = [[u, 0], [nextU, 0], [nextU, 1], [u, 1]];
    for (const index of triangles) vertices.push(...points[index], ...coords[index], layer, face);
  }

  for (let index = 0; index < layerCount; index++) {
    const layer = 2 * index / (layerCount - 1) - 1;
    for (let side = 0; side < outline.length; side++) {
      const next = (side + 1) % outline.length;
      const u = side / outline.length, nextU = (side + 1) / outline.length;
      const [a, b] = [outline[side], outline[next]];
      const [c, d] = [aperture[side], aperture[next]];
      const [topA, topB, topC, topD] = [a, b, c, d].map(([x, z]) => [x, height, z]);
      const [bottomA, bottomB, bottomC, bottomD] = [a, b, c, d].map(([x, z]) => [x, -height, z]);

      quad([topC, topD, topB, topA], 0, layer, u, nextU);
      quad([bottomC, bottomD, bottomB, bottomA], 1, layer, u, nextU);
      quad([bottomA, bottomB, topB, topA], 2, layer, u, nextU);
      quad([bottomC, bottomD, topD, topC], 3, layer, u, nextU);
    }
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  return { buffer, count: vertices.length / 7 };
}

function ease(start, end, time) {
  const x = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return x * x * x * (x * (6 * x - 15) + 10);
}

function createRenderer(gl) {
  const field = createProgram(gl, fieldVertex, fieldFragment, [['position', 2]], ['size', 'view']);
  const plates = createProgram(gl, plateVertex, plateFragment,
    [['position', 3], ['uv', 2], ['layer', 2]], ['aspect', 'phase', 'spread', 'lag']);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const mesh = createPlates(gl);
  const bytes = Float32Array.BYTES_PER_ELEMENT;
  gl.disable(gl.DITHER);

  function bind(pass, buffer, stride) {
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    let offset = 0;
    for (const [attribute, size] of pass.attributes) {
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, stride * bytes, offset * bytes);
      offset += size;
    }
  }

  return (time, width, height) => {
    const loopTime = time % duration;
    const phase = loopTime / duration * tau;
    const spread = ease(0.85, 3.55, loopTime) * (1 - ease(6.35, 9.1, loopTime));
    const lag = spread * Math.cos((loopTime - 3.55) * Math.PI / 2.85);
    const span = Math.min(width, height);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    bind(field, quad, 2);
    gl.uniform2f(field.uniforms.size, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(field.uniforms.view, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    bind(plates, mesh.buffer, 7);
    gl.uniform2f(plates.uniforms.aspect, span / width, span / height);
    gl.uniform1f(plates.uniforms.phase, phase);
    gl.uniform1f(plates.uniforms.spread, spread);
    gl.uniform1f(plates.uniforms.lag, lag);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    for (const [attribute] of plates.attributes) gl.disableVertexAttribArray(attribute);
  };
}

startStudy({ createRenderer, duration, stillTime: 3.55 });
