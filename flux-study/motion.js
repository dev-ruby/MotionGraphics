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

const needleVertex = `
  attribute vec2 a_uv;
  attribute vec3 a_needle;
  uniform vec2 u_aspect;
  uniform float u_phase;

  vec2 perpendicular(vec2 p) {
    return vec2(-p.y, p.x);
  }

  vec2 source(vec2 delta) {
    return delta / (dot(delta, delta) + 0.014);
  }

  void main() {
    float phase = u_phase;
    float spread = 0.5 - 0.5 * cos(phase);
    float heading = 0.31 + phase + 0.21 * sin(2.0 * phase);
    vec2 axis = vec2(cos(heading), sin(heading));
    vec2 across = perpendicular(axis);
    vec2 pole = axis * (0.17 + 0.33 * spread) + across * 0.08 * sin(phase * 2.0);

    float seed = a_needle.z;
    float ripple = 3.6 * a_uv.x - 4.2 * a_uv.y + 3.2 * seed;
    vec2 point = a_uv + 0.012 * vec2(sin(phase + ripple), cos(phase - ripple));
    vec2 fromPositive = point - pole;
    vec2 fromNegative = point + pole;
    vec2 field = source(fromPositive) - source(fromNegative);
    field += 0.15 * sin(2.0 * phase) * perpendicular(point) / (dot(point, point) + 0.17);
    float speed = length(field);
    vec2 direction = field / max(speed, 0.001);

    // The angle difference is the stream function of a two-dimensional source and sink.
    float stream = atan(fromPositive.y, fromPositive.x + 0.000001)
                 - atan(fromNegative.y, fromNegative.x + 0.000001);
    float band = 0.5 + 0.5 * cos(7.0 * stream - 2.0 * phase + 2.5 * length(point));
    float engraved = smoothstep(0.08, 0.91, band);

    vec2 envelope = vec2(0.93 * dot(point, axis), dot(point, across) / (0.69 + 0.19 * spread));
    float radius = length(envelope);
    float body = 1.0 - smoothstep(0.68, 1.01, radius + 0.046 * cos(4.0 * stream + phase));
    float distanceToPole = min(length(fromPositive), length(fromNegative));
    float hollow = smoothstep(0.061, 0.19, distanceToPole);
    float inkWeight = pow(body, 0.8) * hollow * smoothstep(0.04, 0.36, speed);

    float lengthScale = inkWeight * mix(0.69, 1.16, seed) * mix(0.010, 0.032, engraved);
    float widthScale = inkWeight * mix(0.0019, 0.0064, engraved);
    vec2 needle = point + direction * (a_needle.x * lengthScale)
                        + perpendicular(direction) * (a_needle.y * widthScale);
    gl_Position = vec4(needle * u_aspect * 0.88, 0.0, 1.0);
  }
`;

const needleFragment = ink + `
  void main() { gl_FragColor = vec4(coal, 1.0); }
`;

function createNeedles(gl) {
  const spacing = 0.0285;
  const tips = [[-1, 0], [0, 1], [1, 0], [-1, 0], [1, 0], [0, -1]];
  const vertices = [];
  let state = 61;

  function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  }

  for (let row = -45; row <= 45; row++) {
    for (let column = -39; column <= 39; column++) {
      const x = (column + (row & 1) * 0.5 + (random() - 0.5) * 0.67) * spacing;
      const y = (row * 0.866 + (random() - 0.5) * 0.67) * spacing;
      if (Math.hypot(x, y) > 1.14) continue;
      const grain = random();
      for (const [along, across] of tips) vertices.push(x, y, along, across, grain);
    }
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  return { buffer, count: vertices.length / 5 };
}

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
    uniform: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, 'u_' + name)])),
  };
}

function createRenderer(gl) {
  const field = createProgram(gl, fieldVertex, fieldFragment, ['size', 'view']);
  const flux = createProgram(gl, needleVertex, needleFragment, ['aspect', 'phase']);
  const needle = gl.getAttribLocation(flux.program, 'a_needle');
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const needles = createNeedles(gl);
  const floatBytes = Float32Array.BYTES_PER_ELEMENT;
  gl.disable(gl.DITHER);

  function bind(pass, buffer, stride = 0) {
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(pass.uv);
    gl.vertexAttribPointer(pass.uv, 2, gl.FLOAT, false, stride, 0);
  }

  return (time, width, height) => {
    const span = Math.min(width, height);
    const phase = (time % duration) / duration * tau;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    bind(field, quad);
    gl.uniform2f(field.uniform.size, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(field.uniform.view, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    bind(flux, needles.buffer, 5 * floatBytes);
    gl.enableVertexAttribArray(needle);
    gl.vertexAttribPointer(needle, 3, gl.FLOAT, false, 5 * floatBytes, 2 * floatBytes);
    gl.uniform2f(flux.uniform.aspect, span / width, span / height);
    gl.uniform1f(flux.uniform.phase, phase);
    gl.drawArrays(gl.TRIANGLES, 0, needles.count);
    gl.disableVertexAttribArray(needle);
  };
}

startStudy({ createRenderer, duration, stillTime: 3.65 });
