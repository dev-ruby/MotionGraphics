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

const sculptureVertex = `
  attribute vec3 a_position;
  attribute vec3 a_normal;
  uniform vec2 u_aspect;
  uniform vec3 u_angles;
  uniform float u_scale;
  uniform float u_detail;
  varying vec3 v_point;
  varying vec3 v_normal;

  vec2 rotate(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  vec3 pose(vec3 p) {
    p.xz = rotate(p.xz, u_angles.x);
    p.yz = rotate(p.yz, u_angles.y);
    p.xy = rotate(p.xy, u_angles.z);
    return p;
  }

  void main() {
    vec3 point = pose(a_position);
    float w = 1.0 - 0.013 * point.z * u_detail;
    gl_Position = vec4(point.xy * u_aspect * u_scale, -point.z * 0.09, w);
    v_point = a_position;
    v_normal = pose(a_normal);
  }
`;

const sculptureFragment = ink + `
  uniform float u_detail;
  varying vec3 v_point;
  varying vec3 v_normal;

  void main() {
    float light = dot(v_normal, normalize(vec3(-0.42, 0.76, 0.49)));
    float exposure = smoothstep(-0.16, 0.86, light);
    float hatch = fract(0.53 + dot(v_point, vec3(2.7, 3.8, 3.2)));
    float mark = step(u_detail * mix(0.06, 0.87, exposure), hatch);
    gl_FragColor = vec4(pigment(mark), 1.0);
  }
`;

const letterHeight = 7;
const letters = {
  Y: {
    width: 4.8,
    paths: [[[0, 7], [1.61, 7], [2.4, 5.06], [3.19, 7], [4.8, 7],
      [3.15, 3.27], [3.15, 0], [1.65, 0], [1.65, 3.27]]],
  },
  E: {
    width: 4.35,
    paths: [[[0, 0], [4.35, 0], [4.35, 1.4], [1.55, 1.4], [1.55, 2.88],
      [3.98, 2.88], [3.98, 4.19], [1.55, 4.19], [1.55, 5.6], [4.35, 5.6], [4.35, 7], [0, 7]]],
  },
  S: {
    width: 4.65,
    paths: [[[0, 0.7], [0.7, 0], [3.9, 0], [4.65, 0.75], [4.65, 3.43], [3.9, 4.18],
      [1.6, 4.18], [1.5, 4.28], [1.5, 5.5], [1.6, 5.6], [4.48, 5.6], [4.48, 6.3],
      [3.78, 7], [0.75, 7], [0, 6.25], [0, 3.62], [0.75, 2.87], [3.05, 2.87],
      [3.15, 2.77], [3.15, 1.5], [3.05, 1.4], [0, 1.4]]],
  },
  N: {
    width: 4.87,
    paths: [[[0, 0], [1.47, 0], [1.47, 4.33], [3.42, 0], [4.87, 0], [4.87, 7],
      [3.4, 7], [3.4, 2.66], [1.46, 7], [0, 7]]],
  },
  O: {
    width: 4.8,
    paths: [
      [[0.75, 0], [4.05, 0], [4.8, 0.75], [4.8, 6.25], [4.05, 7], [0.75, 7], [0, 6.25], [0, 0.75]],
      [[1.73, 1.4], [3.07, 1.4], [3.27, 1.6], [3.27, 5.4],
        [3.07, 5.6], [1.73, 5.6], [1.53, 5.4], [1.53, 1.6]],
    ],
  },
};

function placeWord(text) {
  const gap = 0.81;
  const glyphs = Array.from(text, character => letters[character]);
  const width = glyphs.reduce((sum, letter) => sum + letter.width, 0) + gap * (glyphs.length - 1);
  let offset = -width / 2;
  const paths = [];
  for (const letter of glyphs) {
    for (const path of letter.paths) paths.push(path.map(([x, y]) => [offset + x, y]));
    offset += letter.width + gap;
  }
  return { width, paths };
}

function sliceWord(word, low, high) {
  const middle = (low + high) / 2;
  const edges = [];
  for (const path of word.paths) {
    for (let i = 0; i < path.length; i++) {
      const [x0, y0] = path[i];
      const [x1, y1] = path[(i + 1) % path.length];
      if (middle <= Math.min(y0, y1) || middle >= Math.max(y0, y1)) continue;
      const slope = (x1 - x0) / (y1 - y0);
      edges.push({ low: x0 + (low - y0) * slope, high: x0 + (high - y0) * slope });
    }
  }
  edges.sort((a, b) => (a.low + a.high) - (b.low + b.high));
  const spans = [];
  for (let i = 0; i < edges.length; i += 2) {
    spans.push({ low: [edges[i].low, edges[i + 1].low], high: [edges[i].high, edges[i + 1].high] });
  }
  return spans;
}

function rectangle(y, x0, x1, z0, z1) {
  const height = y - letterHeight / 2;
  return [[x0, height, z0], [x1, height, z0], [x1, height, z1], [x0, height, z1]];
}

function createMesh(gl) {
  const front = placeWord('YES');
  const side = placeWord('NO');
  const heights = [...new Set([...front.paths, ...side.paths].flatMap(path => path.map(point => point[1])))];
  heights.sort((a, b) => a - b);
  const layers = heights.map(() => ({ below: [], above: [] }));
  const vertices = [];

  function quad(a, b, c, d) {
    const [ux, uy, uz] = c.map((coordinate, axis) => coordinate - a[axis]);
    const [vx, vy, vz] = d.map((coordinate, axis) => coordinate - b[axis]);
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal);
    if (length < 1e-8) return;
    const unit = normal.map(component => component / length);
    for (const point of [a, b, c, a, c, d]) vertices.push(...point, ...unit);
  }

  // Each solid cross-section is the Cartesian product of the two glyph intervals.
  for (let i = 0; i < heights.length - 1; i++) {
    const low = heights[i];
    const high = heights[i + 1];
    const frontSpans = sliceWord(front, low, high);
    const sideSpans = sliceWord(side, low, high);
    for (const x of frontSpans) {
      for (const z of sideSpans) {
        const bottom = rectangle(low, ...x.low, ...z.low);
        const top = rectangle(high, ...x.high, ...z.high);
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4;
          quad(bottom[edge], top[edge], top[next], bottom[next]);
        }
        layers[i].above.push([...x.low, ...z.low]);
        layers[i + 1].below.push([...x.high, ...z.high]);
      }
    }
  }

  // Cap only the exposed part of a ledge, leaving the connected slabs open inside.
  layers.forEach(({ below, above }, i) => {
    const footprints = [...below, ...above];
    const xs = [...new Set(footprints.flatMap(([x0, x1]) => [x0, x1]))].sort((a, b) => a - b);
    const zs = [...new Set(footprints.flatMap(([, , z0, z1]) => [z0, z1]))].sort((a, b) => a - b);
    for (let xi = 0; xi < xs.length - 1; xi++) {
      for (let zi = 0; zi < zs.length - 1; zi++) {
        const x = (xs[xi] + xs[xi + 1]) / 2;
        const z = (zs[zi] + zs[zi + 1]) / 2;
        const covers = ([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1;
        const solidBelow = below.some(covers);
        const solidAbove = above.some(covers);
        if (solidBelow === solidAbove) continue;
        const points = rectangle(heights[i], xs[xi], xs[xi + 1], zs[zi], zs[zi + 1]);
        quad(...(solidBelow ? points.reverse() : points));
      }
    }
  });

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  return { buffer, count: vertices.length / 6, frontWidth: front.width, sideWidth: side.width };
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
    position: gl.getAttribLocation(program, 'a_position'),
    uniform: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, 'u_' + name)])),
  };
}

function ease(start, end, time) {
  const x = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return x * x * x * (x * (6 * x - 15) + 10);
}

function createRenderer(gl) {
  const field = createProgram(gl, fieldVertex, fieldFragment, ['size', 'view']);
  const sculpture = createProgram(gl, sculptureVertex, sculptureFragment, ['aspect', 'angles', 'scale', 'detail']);
  const normal = gl.getAttribLocation(sculpture.program, 'a_normal');
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const mesh = createMesh(gl);
  const bytes = Float32Array.BYTES_PER_ELEMENT;
  gl.disable(gl.DITHER);

  function bind(pass, buffer, components, stride = 0) {
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(pass.position);
    gl.vertexAttribPointer(pass.position, components, gl.FLOAT, false, stride, 0);
  }

  return (time, width, height) => {
    const forward = ease(1.10, 4.17, time);
    const backward = ease(5.55, 9.25, time);
    const yaw = Math.PI / 2 * (forward - backward);
    const lift = 4 * forward * (1 - forward);
    const dip = 4 * backward * (1 - backward);
    const depth = lift + dip;
    const projectedWidth = mesh.frontWidth * Math.cos(yaw) + mesh.sideWidth * Math.sin(yaw);
    const scale = 1.63 * (1 - 0.12 * depth) / projectedWidth;
    const span = Math.min(width, height);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    bind(field, quad, 2);
    gl.uniform2f(field.uniform.size, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(field.uniform.view, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    bind(sculpture, mesh.buffer, 3, 6 * bytes);
    gl.enableVertexAttribArray(normal);
    gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 6 * bytes, 3 * bytes);
    gl.uniform2f(sculpture.uniform.aspect, span / width, span / height);
    gl.uniform3f(sculpture.uniform.angles, -yaw, 0.41 * lift - 0.34 * dip, 0.11 * lift - 0.10 * dip);
    gl.uniform1f(sculpture.uniform.scale, scale);
    gl.uniform1f(sculpture.uniform.detail, depth);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    gl.disableVertexAttribArray(normal);
  };
}

startStudy({ createRenderer, duration, stillTime: 2.63 });
