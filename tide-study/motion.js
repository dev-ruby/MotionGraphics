'use strict';

const duration = 10;
const tau = 2 * Math.PI;

// A circular sweep reverses the two inks on both the field and the disc.
const ink = `
  precision highp float;
  uniform vec2 u_size;
  uniform vec2 u_view;
  uniform float u_wipe;
  const vec3 paper = vec3(244.0, 241.0, 232.0) / 255.0;
  const vec3 coal = vec3(25.0, 25.0, 23.0) / 255.0;

  vec3 pigment(float mark) {
    vec2 offset = (gl_FragCoord.xy / u_size - 0.5) * u_view;
    float dark = step(length(offset), u_wipe);
    return mix(paper, coal, abs(mark - dark));
  }
`;

const fieldVertex = `
  attribute vec2 a_uv;
  void main() { gl_Position = vec4(a_uv, 0.0, 1.0); }
`;

const fieldFragment = ink + `
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

const tideVertex = `
  attribute vec2 a_uv;
  varying float v_radius;
  varying vec3 v_normal;
  uniform vec2 u_aspect;
  uniform float u_phase;
  uniform float u_swell;

  const float discRadius = 2.92;

  vec2 rotate(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  float elevation(float r, float angle) {
    float skew = r * (1.22 * sin(2.0 * angle + u_phase) + 0.42 * cos(3.0 * angle - u_phase));
    float swell = 0.5 + 0.5 * cos(12.8 * r - 2.0 * u_phase + skew);
    float envelope = smoothstep(0.01, 0.23, r) * (1.0 - smoothstep(0.72, 1.0, r));
    float center = 0.48 * sin(u_phase - 0.38) * exp(-11.0 * r * r);
    return u_swell * (envelope * (1.48 * swell * swell - 0.49) + center);
  }

  vec3 tilt(vec3 point) {
    point.yz = rotate(point.yz, 0.66 + 0.18 * sin(u_phase - 0.5));
    point.xz = rotate(point.xz, 0.15 * sin(u_phase + 0.4));
    point.xy = rotate(point.xy, 0.14 * sin(u_phase - 0.65));
    return point;
  }

  void main() {
    float angle = a_uv.x * 6.28318530718;
    float r = a_uv.y;
    vec2 radial = vec2(cos(angle), sin(angle));
    vec2 tangent = vec2(-radial.y, radial.x);
    float z = elevation(r, angle);

    // The height slopes control the thickness of the engraved rings.
    float dr = (elevation(r + 0.002, angle) - z) / (discRadius * 0.002);
    float da = (elevation(r, angle + 0.01) - z) / (discRadius * max(r, 0.01) * 0.01);
    v_normal = tilt(normalize(vec3(-dr * radial - da * tangent, 1.0)));
    v_radius = r;

    vec3 point = tilt(vec3(discRadius * r * radial, z));
    point.y += 0.11 * u_swell;
    gl_Position = vec4(point.xy * u_aspect * 0.286, -point.z * 0.16, 1.0 - point.z * 0.068);
  }
`;

const tideFragment = ink + `
  varying float v_radius;
  varying vec3 v_normal;

  void main() {
    float light = dot(normalize(v_normal), normalize(vec3(-0.66, -0.21, 0.72)));
    float lineWidth = mix(0.87, 0.16, smoothstep(0.02, 0.95, light));
    float groove = 2.0 * abs(fract(v_radius * 32.0) - 0.5);
    float rings = 1.0 - step(lineWidth, groove);
    float rim = step(0.988, v_radius);
    float hub = 1.0 - step(0.019, v_radius);
    float mark = max(rings, max(rim, hub));
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
  const angularSteps = 192;
  const radialSteps = 96;
  const row = radialSteps + 1;
  const vertices = new Float32Array((angularSteps + 1) * row * 2);
  const indices = new Uint16Array(angularSteps * radialSteps * 6);
  let vertex = 0;
  let index = 0;

  for (let angle = 0; angle <= angularSteps; angle++) {
    for (let radius = 0; radius <= radialSteps; radius++) {
      vertices[vertex++] = angle / angularSteps;
      vertices[vertex++] = radius / radialSteps;
      if (angle < angularSteps && radius < radialSteps) {
        const a = angle * row + radius;
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
  const tide = createProgram(gl, tideVertex, tideFragment, ['size', 'view', 'wipe', 'aspect', 'phase', 'swell']);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const mesh = createMesh(gl);
  gl.disable(gl.DITHER);

  function bind(pass, buffer, width, height, wipe) {
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(pass.uv);
    gl.vertexAttribPointer(pass.uv, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(pass.uniform.size, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(pass.uniform.view, width, height);
    gl.uniform1f(pass.uniform.wipe, wipe);
  }

  return (time, width, height) => {
    const phase = (time % duration) / duration * tau;
    const swell = ease(0.05, 2.55, time) * (1 - ease(7.10, 9.90, time));
    const inversion = ease(4.10, 5.25, time) * (1 - ease(6.95, 8.30, time));
    const wipe = -1 + (Math.hypot(width, height) / 2 + 2) * inversion;
    const span = Math.min(width, height);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    bind(field, quad, width, height, wipe);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    bind(tide, mesh.surface, width, height, wipe);
    gl.uniform2f(tide.uniform.aspect, span / width, span / height);
    gl.uniform1f(tide.uniform.phase, phase);
    gl.uniform1f(tide.uniform.swell, swell);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.triangles);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  };
}

startStudy({ createRenderer, duration, stillTime: 3.4 });
