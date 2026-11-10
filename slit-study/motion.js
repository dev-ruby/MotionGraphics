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

const solidVertex = `
  attribute vec3 a_position;
  attribute vec3 a_normal;
  varying vec3 v_position;
  varying vec3 v_normal;
  uniform vec2 u_aspect;
  uniform float u_phase;
  uniform float u_scale;
  uniform float u_shift;

  vec2 rotate(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  void main() {
    vec3 point = a_position;
    point.xz = rotate(point.xz, -0.68 + u_phase);
    point.yz = rotate(point.yz, 0.54 + 0.23 * sin(u_phase + 0.2));
    point.xy = rotate(point.xy, -0.065 + 0.16 * sin(2.0 * u_phase));

    float w = 1.0 - point.z * 0.061;
    vec2 plate = point.xy * u_scale + vec2(0.0, u_shift * w);
    gl_Position = vec4(plate * u_aspect, -point.z * 0.17, w);
    v_position = a_position;
    v_normal = a_normal;
  }
`;

const solidFragment = ink + `
  varying vec3 v_position;
  varying vec3 v_normal;

  void main() {
    vec3 axis = abs(v_normal);
    vec2 plane = axis.x > 0.5 ? v_position.zy : (axis.y > 0.5 ? v_position.xz : v_position.xy);
    float extent = max(abs(plane.x), abs(plane.y));
    float hatch = step(0.67, fract(7.0 * (plane.x + 0.78 * plane.y)));
    float insideHatch = step(0.28, fract(9.0 * (plane.x - 0.72 * plane.y)));
    float outerEdge = step(1.503, extent);
    float apertureEdge = 1.0 - step(1.025, extent);
    float mark = max(insideHatch, outerEdge);

    // Each face has its own print treatment, and the tunnel reverses the hatch.
    if (dot(v_position, v_normal) > 1.25) {
      if (axis.x > 0.5) {
        mark = 1.0 - (step(1.06, extent) - step(1.09, extent));
      } else {
        mark = max(max(outerEdge, apertureEdge), axis.z * hatch);
      }
    }
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
    position: gl.getAttribLocation(program, 'a_position'),
    uniform: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, `u_${name}`)])),
  };
}

function createMesh(gl) {
  const planes = [-1.54, -0.99, 0.99, 1.54];
  const corners = [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]];
  const vertices = [];

  // Only corner and edge cells remain after the three square tunnels are cut.
  function isSolid(cell) {
    return cell.every(value => value >= 0 && value < 3) && cell.filter(value => value === 1).length <= 1;
  }

  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 3; z++) {
        const cell = [x, y, z];
        if (!isSolid(cell)) continue;
        for (let axis = 0; axis < 3; axis++) {
          const uAxis = (axis + 1) % 3;
          const vAxis = (axis + 2) % 3;
          for (const direction of [-1, 1]) {
            const neighbor = cell.slice();
            neighbor[axis] += direction;
            if (isSolid(neighbor)) continue;

            const normal = [0, 0, 0];
            normal[axis] = direction;
            for (const [u, v] of corners) {
              const point = [];
              point[axis] = planes[cell[axis] + (direction + 1) / 2];
              point[uAxis] = planes[cell[uAxis] + u];
              point[vAxis] = planes[cell[vAxis] + v];
              vertices.push(...point, ...normal);
            }
          }
        }
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
  const field = createProgram(gl, fieldVertex, fieldFragment, ['size', 'view']);
  const solid = createProgram(gl, solidVertex, solidFragment, ['aspect', 'phase', 'scale', 'shift']);
  const normal = gl.getAttribLocation(solid.program, 'a_normal');
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const mesh = createMesh(gl);
  gl.disable(gl.DITHER);

  function bind(pass, buffer, components, stride = 0) {
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(pass.position);
    gl.vertexAttribPointer(pass.position, components, gl.FLOAT, false, stride, 0);
  }

  function drawSolid(phase, shift) {
    gl.uniform1f(solid.uniform.phase, phase);
    gl.uniform1f(solid.uniform.shift, shift);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  return (time, width, height) => {
    const phase = (time % duration) / duration * tau;
    const separation = ease(0.95, 3.15, time) * (1 - ease(5.60, 8.55, time));
    const presence = ease(0.10, 1.10, time) * (1 - ease(8.90, 9.88, time));
    const span = Math.min(width, height);
    const pixelWidth = gl.drawingBufferWidth;
    const pixelHeight = gl.drawingBufferHeight;

    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    bind(field, quad, 2);
    gl.uniform2f(field.uniform.size, pixelWidth, pixelHeight);
    gl.uniform2f(field.uniform.view, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (presence === 0) return;

    gl.enable(gl.DEPTH_TEST);
    const floatBytes = Float32Array.BYTES_PER_ELEMENT;
    bind(solid, mesh.buffer, 3, 6 * floatBytes);
    gl.enableVertexAttribArray(normal);
    gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 6 * floatBytes, 3 * floatBytes);
    gl.uniform2f(solid.uniform.aspect, span / width, span / height);
    gl.uniform1f(solid.uniform.scale, 0.30 * presence);

    if (separation === 0) {
      drawSolid(phase, 0);
    } else {
      // Neighboring strips share a pixel boundary, with each drawing its own moment.
      const slices = 24;
      const sweepWidth = pixelWidth * span / width;
      const left = (pixelWidth - sweepWidth) / 2;
      const columnWidth = sweepWidth / slices;

      gl.enable(gl.SCISSOR_TEST);
      for (let i = 0; i < slices; i++) {
        const start = Math.round(left + i * columnWidth);
        const end = Math.round(left + (i + 1) * columnWidth);
        const across = 2 * (i + 0.5) / slices - 1;
        const wave = 1.8 * phase - 4.4 * across;
        const delay = separation * (1.19 * across + 0.52 * Math.sin(wave));
        const shift = separation * (0.12 * Math.sin(wave - 0.7) + 0.041 * Math.sin(2 * wave));
        gl.scissor(start, 0, end - start, pixelHeight);
        drawSolid(phase + delay * tau / duration, shift);
      }
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.disableVertexAttribArray(normal);
  };
}

startStudy({ createRenderer, duration, stillTime: 4.05 });
