'use strict';

function startStudy({ createRenderer, duration, stillTime }) {
  const canvas = document.querySelector('#art');
  const playback = document.querySelector('#playback');
  const seek = document.querySelector('#seek');
  const timecode = document.querySelector('#time');
  const message = document.querySelector('#stage-message');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
  let render;
  let position = reducedMotion.matches ? stillTime : 0;
  let playing = !reducedMotion.matches;
  let scrubbing = false;
  let frame = 0;
  let previousFrame;
  let viewWidth = 0;
  let viewHeight = 0;

  function paint() {
    if (render && viewWidth && viewHeight) render(position, viewWidth, viewHeight);
    seek.value = position;
    timecode.textContent = (Math.floor(position * 10) / 10).toFixed(1).padStart(4, '0');
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    viewWidth = bounds.width;
    viewHeight = bounds.height;
    const pixelRatio = Math.min(2, Math.max(1.5, devicePixelRatio));
    const width = Math.max(1, Math.round(viewWidth * pixelRatio));
    const height = Math.max(1, Math.round(viewHeight * pixelRatio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    paint();
  }

  function tick(now) {
    frame = 0;
    if (previousFrame !== undefined) position = (position + (now - previousFrame) / 1000) % duration;
    previousFrame = now;
    paint();
    frame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    const label = playing ? 'Pause' : 'Play';
    playback.classList.toggle('paused', !playing);
    playback.setAttribute('aria-label', label);
    playback.title = `${label} (Space)`;

    const shouldAnimate = render && playing && !scrubbing && !document.hidden;
    if (shouldAnimate && !frame) {
      previousFrame = undefined;
      frame = requestAnimationFrame(tick);
    } else if (!shouldAnimate && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function setAvailable(available, notice = '') {
    playback.disabled = !available;
    seek.disabled = !available;
    message.textContent = notice;
    message.hidden = available;
    syncPlayback();
  }

  function startRenderer() {
    if (!gl) {
      setAvailable(false, 'This motion study requires WebGL.');
      return;
    }
    try {
      render = createRenderer(gl);
      resize();
      setAvailable(true);
    } catch (error) {
      render = undefined;
      setAvailable(false, 'The motion study could not start.');
      console.error(error);
    }
  }

  function togglePlayback() {
    playing = !playing;
    syncPlayback();
  }

  playback.addEventListener('click', togglePlayback);
  seek.addEventListener('pointerdown', () => {
    scrubbing = true;
    syncPlayback();
  });
  function finishScrubbing() {
    scrubbing = false;
    syncPlayback();
  }
  window.addEventListener('pointerup', finishScrubbing);
  window.addEventListener('pointercancel', finishScrubbing);
  window.addEventListener('blur', finishScrubbing);
  seek.addEventListener('input', () => {
    position = seek.valueAsNumber;
    previousFrame = undefined;
    paint();
  });
  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && !event.repeat && event.target === document.body && render) {
      event.preventDefault();
      togglePlayback();
    }
  });
  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', event => {
    if (event.matches) {
      playing = false;
      syncPlayback();
    }
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    render = undefined;
    setAvailable(false, 'Restoring the motion study…');
  });
  canvas.addEventListener('webglcontextrestored', startRenderer);
  new ResizeObserver(resize).observe(canvas);
  startRenderer();
}
