'use strict';

(() => {
  const rail = document.getElementById('rail');
  if (!rail) return;

  let lastOpenIndex = -1;
  let lineFrame = 0;
  let lineObserver;
  let cycleStartedAt;

  function stopLine() {
    cancelAnimationFrame(lineFrame);
    lineObserver?.disconnect();
    lineObserver = undefined;
  }

  function startLine(journey) {
    stopLine();
    const track = journey.querySelector('li[data-open] .flow-step-line');
    const fill = track?.querySelector('.flow-step-fill');
    if (!fill) return;

    let trackHeight = 0;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const measure = () => {
      trackHeight = track.getBoundingClientRect().height;
      if (reducedMotion) fill.style.height = `${trackHeight}px`;
    };
    measure();
    lineObserver = new ResizeObserver(measure);
    lineObserver.observe(track);
    if (reducedMotion) return;

    cycleStartedAt ??= performance.now();
    const tick = now => {
      if (!track.isConnected) {
        stopLine();
        return;
      }
      const phase = (now - cycleStartedAt) % 2600;
      const progress = phase < 1950 ? phase / 1950 : phase < 2250 ? 1 : 0;
      fill.style.height = `${Math.round(trackHeight * progress)}px`;
      lineFrame = requestAnimationFrame(tick);
    };
    tick(performance.now());
  }

  function openStep(journey, index) {
    if (journey.dataset.flowOpen === String(index)) return;
    journey.dataset.flowOpen = String(index);
    lastOpenIndex = index;
    journey.querySelectorAll('ol li').forEach((li, i) => {
      const open = i === index;
      li.toggleAttribute('data-open', open);
      li.querySelector('.flow-step-panel')?.setAttribute('aria-hidden', String(!open));
    });
    startLine(journey);
  }

  function enhanceJourney(journey) {
    if (journey.hasAttribute('data-flow')) return;
    journey.setAttribute('data-flow', '');

    const steps = [...journey.querySelectorAll('ol li')];
    steps.forEach(li => {
      const copy = li.querySelector('.guide-step-copy');
      const title = copy.querySelector('b');
      const detail = copy.querySelector('small');
      const now = li.querySelector('em');
      const label = document.createElement('span');
      const panel = document.createElement('span');
      const panelInner = document.createElement('span');
      const line = document.createElement('span');
      const fill = document.createElement('span');

      line.className = 'flow-step-line';
      line.setAttribute('aria-hidden', 'true');
      fill.className = 'flow-step-fill';
      line.append(fill);
      label.className = 'flow-step-label';
      label.append(title);
      panel.className = 'flow-step-panel';
      panel.setAttribute('aria-hidden', 'true');
      panelInner.className = 'flow-step-panel-inner';
      panelInner.append(detail);
      if (now) panelInner.append(now);
      panel.append(panelInner);
      copy.replaceChildren(label, panel);
      li.prepend(line);
    });

    const targetIndex = Math.max(0, steps.findIndex(li => li.classList.contains('current')));
    const startIndex = lastOpenIndex >= 0 ? lastOpenIndex : targetIndex;
    openStep(journey, startIndex);
    requestAnimationFrame(() => {
      if (!journey.isConnected) return;
      journey.setAttribute('data-flow-ready', '');
      if (startIndex !== targetIndex) {
        requestAnimationFrame(() => {
          if (journey.isConnected && journey.dataset.flowOpen === String(startIndex)) {
            openStep(journey, targetIndex);
          }
        });
      }
    });
  }

  function updateRail() {
    const journey = rail.querySelector('.guide-journey');
    if (journey) enhanceJourney(journey);
    else {
      stopLine();
      lastOpenIndex = -1;
    }
  }

  new MutationObserver(updateRail).observe(rail, { childList: true });
  updateRail();
})();
