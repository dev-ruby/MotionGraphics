'use strict';

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

const surfaceScale = 0.405;
const halfSide = 2.04;
const pitch = 0.69;
const roll = 0.14;
const rippleCount = 5;
const rippleLifetime = 1.9;

const sheetVertex = `
  attribute vec2 a_position;
  uniform vec2 u_aspect;
  uniform vec3 u_hover;
  uniform vec3 u_trail;
  uniform vec4 u_ripples[${rippleCount}];
  varying vec2 v_position;
  varying float v_height;

  void main() {
    vec2 p = a_position;
    float height = 0.14 * sin(1.68 * p.x + 0.88 * p.y) + 0.15 * cos(1.82 * p.y - 0.54 * p.x);
    vec2 fromHover = p - u_hover.xy;
    float distanceToHover = length(fromHover);
    float dimple = exp(-4.2 * dot(fromHover, fromHover));
    float shoulderOffset = (distanceToHover - 0.69) * 3.3;
    float shoulder = exp(-shoulderOffset * shoulderOffset);
    height += u_hover.z * (1.06 * dimple - 0.23 * shoulder);
    vec2 fromTrail = p - u_trail.xy;
    height += u_trail.z * exp(-2.3 * dot(fromTrail, fromTrail));

    for (int i = 0; i < ${rippleCount}; i++) {
      vec4 ripple = u_ripples[i];
      if (ripple.w > 0.0001) {
        float ring = length(p - ripple.xy) - 2.12 * ripple.z;
        height += ripple.w * exp(-13.0 * ring * ring) * cos(11.0 * ring);
      }
    }

    float projectedY = cos(${pitch}) * p.y + sin(${pitch}) * height;
    vec2 screen = vec2(cos(${roll}) * p.x - sin(${roll}) * projectedY,
                       sin(${roll}) * p.x + cos(${roll}) * projectedY);
    float depth = cos(${pitch}) * height - sin(${pitch}) * p.y;
    gl_Position = vec4(screen * u_aspect * ${surfaceScale}, -0.25 * depth, 1.0);
    v_position = p;
    v_height = height;
  }
`;

const sheetFragment = ink + `
  varying vec2 v_position;
  varying float v_height;

  void main() {
    vec2 p = v_position;
    float extent = max(abs(p.x), abs(p.y));
    float border = step(${halfSide} - 0.022, extent);
    float rule = step(${halfSide} - 0.090, extent) - step(${halfSide} - 0.074, extent);
    float position = 9.15 * (p.y + 0.26 * p.x) + 0.11 * sin(2.8 * p.x);
    float band = fract(position);
    float lineWidth = clamp(0.37 + 0.12 * v_height + 0.065 * sin(0.67 * floor(position)), 0.26, 0.61);
    float strokes = 1.0 - step(lineWidth, band);
    float accent = 1.0 - step(1.0, mod(floor(position), 4.0));
    float fine = accent * (step(0.68, band) - step(0.765, band));
    float print = max(strokes, fine) * (1.0 - step(${halfSide} - 0.115, extent));
    gl_FragColor = vec4(pigment(max(print, max(border, rule))), 1.0);
  }
`;

function createRenderer(gl) {
  const field = createProgram(gl, fieldVertex, fieldFragment, [['position', 2]], ['size', 'view']);
  const sheet = createProgram(gl, sheetVertex, sheetFragment,
    [['position', 2]], ['aspect', 'hover', 'trail', 'ripples[0]']);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const steps = 156;
  const stride = steps + 1;
  const vertices = new Float32Array(stride * stride * 2);
  const indices = new Uint16Array(steps * steps * 6);
  for (let y = 0; y <= steps; y++) {
    for (let x = 0; x <= steps; x++) {
      const vertex = y * stride + x;
      vertices[vertex * 2] = halfSide * (2 * x / steps - 1);
      vertices[vertex * 2 + 1] = halfSide * (2 * y / steps - 1);
      if (x < steps && y < steps) {
        const nextRow = vertex + stride;
        indices.set([vertex, vertex + 1, nextRow, nextRow, vertex + 1, nextRow + 1], (y * steps + x) * 6);
      }
    }
  }

  const surface = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, surface);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const topology = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, topology);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.disable(gl.DITHER);

  function bind(pass, buffer) {
    const [[position]] = pass.attributes;
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  }

  return (width, height, hover, trail, ripples) => {
    const span = Math.min(width, height);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    bind(field, quad);
    gl.uniform2f(field.uniforms.size, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(field.uniforms.view, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    bind(sheet, surface);
    gl.uniform2f(sheet.uniforms.aspect, span / width, span / height);
    gl.uniform3fv(sheet.uniforms.hover, hover);
    gl.uniform3fv(sheet.uniforms.trail, trail);
    gl.uniform4fv(sheet.uniforms['ripples[0]'], ripples);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  };
}

const canvas = document.querySelector('#art');
const reset = document.querySelector('#reset');
const message = document.querySelector('#stage-message');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
const hover = new Float32Array(3);
const trail = new Float32Array(3);
const rippleUniform = new Float32Array(rippleCount * 4);
const ripples = [];
let render;
let frame = 0;
let previousFrame;
let width = 0, height = 0;
let targetX = 0, targetY = 0;
let active = false;
let touchPointer;
let stillRipple = false;

function schedule() {
  if (render && !frame) frame = requestAnimationFrame(paint);
}

function paint(now) {
  frame = 0;
  if (!render || !width || !height) return;
  const elapsed = previousFrame === undefined ? 1 / 60 : Math.min(0.05, (now - previousFrame) / 1000);
  previousFrame = now;
  const reduce = reducedMotion.matches;
  const follow = reduce ? 1 : 1 - Math.exp(-18 * elapsed);
  const lag = reduce ? 1 : 1 - Math.exp(-5.5 * elapsed);
  hover[0] += (targetX - hover[0]) * follow;
  hover[1] += (targetY - hover[1]) * follow;
  const strength = active ? 1 : 0;
  hover[2] += (strength - hover[2]) * follow;
  if (!active && hover[2] < 0.002) hover[2] = 0;
  trail[0] += (hover[0] - trail[0]) * lag;
  trail[1] += (hover[1] - trail[1]) * lag;
  const wake = Math.hypot(hover[0] - trail[0], hover[1] - trail[1]);
  trail[2] = reduce ? 0 : hover[2] * Math.min(0.35, wake * 0.43);

  while (ripples.length && now - ripples[0].at >= rippleLifetime * 1000) ripples.shift();
  rippleUniform.fill(0);
  if (stillRipple) rippleUniform.set([targetX, targetY, 0.23, 0.37]);
  for (const [i, ripple] of ripples.entries()) {
    const age = Math.max(0, (now - ripple.at) / 1000);
    const fade = Math.max(0, 1 - age / rippleLifetime);
    const amplitude = 0.71 * Math.min(1, age * 12) * fade * fade;
    rippleUniform.set([ripple.x, ripple.y, age, amplitude], i * 4);
  }
  render(width, height, hover, trail, rippleUniform);

  const settling = Math.abs(hover[2] - strength) > 0.002 ||
    (active && (wake > 0.002 || Math.hypot(targetX - hover[0], targetY - hover[1]) > 0.002));
  if (ripples.length || settling) schedule();
  else previousFrame = undefined;
}

function move(x, y) {
  targetX = x;
  targetY = y;
  if (!active && hover[2] < 0.02) {
    hover.set([x, y, 0]);
    trail.set([x, y, 0]);
  }
  active = true;
  stillRipple = false;
  schedule();
}

function mapPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const pixelsPerUnit = 0.5 * Math.min(bounds.width, bounds.height) * surfaceScale;
  const x = (event.clientX - bounds.left - bounds.width / 2) / pixelsPerUnit;
  const y = (bounds.top + bounds.height / 2 - event.clientY) / pixelsPerUnit;
  // Undo the projection onto the flat sheet to locate the pointer in its plane.
  return [Math.cos(roll) * x + Math.sin(roll) * y,
    (Math.cos(roll) * y - Math.sin(roll) * x) / Math.cos(pitch)];
}

function pulse() {
  if (reducedMotion.matches) {
    stillRipple = true;
  } else {
    if (ripples.length === rippleCount) ripples.shift();
    ripples.push({ x: targetX, y: targetY, at: performance.now() });
  }
  schedule();
}

function release() {
  active = false;
  stillRipple = false;
  schedule();
}

function clearSurface() {
  active = false;
  stillRipple = false;
  targetX = 0;
  targetY = 0;
  hover.fill(0);
  trail.fill(0);
  ripples.length = 0;
  schedule();
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  width = bounds.width;
  height = bounds.height;
  const ratio = Math.min(2, Math.max(1.5, devicePixelRatio));
  const pixelsWide = Math.max(1, Math.round(width * ratio));
  const pixelsHigh = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
  if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
  schedule();
}

function startRenderer() {
  try {
    if (!gl) {
      message.textContent = 'This study requires WebGL.';
      message.hidden = false;
      return;
    }
    render = createRenderer(gl);
    message.hidden = true;
    reset.disabled = false;
    resize();
  } catch (error) {
    message.textContent = 'The study could not start.';
    message.hidden = false;
    console.error(error);
  }
}

canvas.addEventListener('pointermove', event => {
  if (render && (event.pointerType === 'mouse' || event.pointerId === touchPointer)) move(...mapPointer(event));
});
canvas.addEventListener('pointerdown', event => {
  if (!render || !event.isPrimary || event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  if (event.pointerType !== 'mouse') {
    touchPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  }
  move(...mapPointer(event));
  pulse();
});
canvas.addEventListener('pointerleave', event => {
  if (event.pointerType === 'mouse') release();
});
function finishTouch(event) {
  if (event.pointerId === touchPointer) {
    touchPointer = undefined;
    active = false;
    if (event.type === 'pointercancel') stillRipple = false;
    schedule();
  }
}
canvas.addEventListener('pointerup', finishTouch);
canvas.addEventListener('pointercancel', finishTouch);
canvas.addEventListener('lostpointercapture', finishTouch);
canvas.addEventListener('blur', release);
window.addEventListener('blur', release);

const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, -1], ArrowUp: [0, 1] };
canvas.addEventListener('keydown', event => {
  if (!render) return;
  const direction = arrows[event.key];
  if (direction) {
    event.preventDefault();
    const clamp = value => Math.max(-halfSide, Math.min(halfSide, value));
    move(clamp(targetX + 0.26 * direction[0]), clamp(targetY + 0.26 * direction[1]));
  } else if (event.code === 'Space' || event.key === 'Enter') {
    event.preventDefault();
    if (!event.repeat) {
      move(targetX, targetY);
      pulse();
    }
  } else if (event.key === 'Escape') {
    clearSurface();
  }
});

reset.addEventListener('click', clearSurface);
reducedMotion.addEventListener('change', () => {
  ripples.length = 0;
  stillRipple = false;
  schedule();
});
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  render = undefined;
  cancelAnimationFrame(frame);
  frame = 0;
  previousFrame = undefined;
  reset.disabled = true;
  message.textContent = 'Restoring the study…';
  message.hidden = false;
});
canvas.addEventListener('webglcontextrestored', startRenderer);
new ResizeObserver(resize).observe(canvas);
startRenderer();
