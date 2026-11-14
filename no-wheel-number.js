// REGRA (14/11, dono): campo de número NUNCA muda o valor rolando o mouse/trackpad. Vale para o 019 inteiro.
if (typeof document !== 'undefined' && !window.__z19NoWheel) {
  window.__z19NoWheel = true;
  document.addEventListener('wheel', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'number' && document.activeElement === target) target.blur();
  }, { passive: true, capture: true });
}
