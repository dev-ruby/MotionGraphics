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

const bladeVertex = `
  attribute vec2 a_uv;
  attribute float a_blade;
  uniform vec2 u_aspect;
  uniform float u_phase;
  varying vec2 v_uv;

  vec2 rotate(vec2 p, float angle) {
    float c = cos(angle), s = sin(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  void main() {
    float u = a_uv.x, v = a_uv.y;
    float opening = 0.5 - 0.5 * cos(u_phase);
    float inner = 0.12 + 1.14 * opening;
    float outer = 2.72 - 0.22 * pow(2.0 * v - 1.0, 2.0);
    float radius = mix(inner + 0.18 * sin(3.14159265 * v), outer, u);
    float turn = 0.91 * pow(1.0 - u, 1.2) * (0.82 + 0.18 * sin(u_phase));
    float angle = a_blade + turn + (v - 0.5) * (0.13 + 0.47 * u) + u_phase;
    float fold = 1.0 - abs(2.0 * v - 1.0);
    float height = 0.37 * sin(3.14159265 * u) * fold + 0.39 * (v - 0.5);
    height += 0.27 * opening * (1.0 - u);
    vec3 p = vec3(radius * cos(angle), radius * sin(angle), height);
    p.yz = rotate(p.yz, 0.22 + 0.20 * sin(u_phase));
    p.xz = rotate(p.xz, 0.12 * cos(u_phase));
    gl_Position = vec4(p.xy * u_aspect * 0.303, -p.z * 0.25, 1.0 - 0.065 * p.z);
    v_uv = a_uv;
  }
`;

const bladeFragment = ink + `
  varying vec2 v_uv;

  void main() {
    float u = v_uv.x, v = v_uv.y;
    float edge = max(step(0.984, u), 1.0 - step(0.018, u));
    edge = max(edge, max(step(0.976, v), 1.0 - step(0.024, v)));
    float crease = step(0.49, v) - step(0.515, v);
    float darkFold = step(0.515, v);
    float fineLines = step(0.88, fract(u * 27.0));
    float engraving = fineLines * step(0.16, v) * (1.0 - step(0.37, v));
    float mark = max(edge, max(crease, max(darkFold, engraving)));
    if (!gl_FrontFacing) mark = max(edge, 1.0 - fineLines);
    gl_FragColor = vec4(pigment(mark), 1.0);
  }
`;

function createBlades(gl) {
  const vertices = [];
  const radialSteps = 56;
  const widthSteps = 12;
  const corners = [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]];
  for (let blade = 0; blade < 18; blade++) {
    for (let u = 0; u < radialSteps; u++) {
      for (let v = 0; v < widthSteps; v++) {
        for (const [du, dv] of corners) {
          vertices.push((u + du) / radialSteps, (v + dv) / widthSteps, blade * tau / 18);
        }
      }
    }
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  return { buffer, count: vertices.length / 3 };
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
  const iris = createProgram(gl, bladeVertex, bladeFragment, ['aspect', 'phase']);
  const blade = gl.getAttribLocation(iris.program, 'a_blade');
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const mesh = createBlades(gl);
  const bytes = Float32Array.BYTES_PER_ELEMENT;
  gl.disable(gl.DITHER);

  function bind(pass, buffer, stride = 0) {
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(pass.uv);
    gl.vertexAttribPointer(pass.uv, 2, gl.FLOAT, false, stride, 0);
  }

  return (time, width, height) => {
    const span = Math.min(width, height);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    bind(field, quad);
    gl.uniform2f(field.uniform.size, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(field.uniform.view, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    bind(iris, mesh.buffer, 3 * bytes);
    gl.enableVertexAttribArray(blade);
    gl.vertexAttribPointer(blade, 1, gl.FLOAT, false, 3 * bytes, 2 * bytes);
    gl.uniform2f(iris.uniform.aspect, span / width, span / height);
    gl.uniform1f(iris.uniform.phase, (time % duration) / duration * tau);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    gl.disableVertexAttribArray(blade);
  };
}

startStudy({ createRenderer, duration, stillTime: 3.8 });
