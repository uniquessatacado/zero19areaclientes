// Área do cliente DTF por metro (13/11, dono): "em todo lugar, todo botão, função, funcionalidade tem que ter um balão de
// tutorial para o cliente saber o que aquilo faz, o que afeta, com botão 'Já entendi'; então some e nunca mais aparece
// aquele tutorial; quando ele aperta em outro lugar que nunca tenha apertado antes, mostra o balão daquele tutorial".
// Uso: elemento com data-tip="chave" (o texto fica no catálogo TIPS). No 1º toque o balão aparece; "Já entendi" guarda a
// chave (no aparelho e na conta do cliente) e continua o que a pessoa ia fazer. Campos (input/select) mostram o balão ao
// receber o foco, sem atrapalhar a digitação.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createTips({ catalog, seen = [], save = () => {}, storageKey = 'dtf-tips' } = {}) {
  const done = new Set(seen);
  try { for (const key of JSON.parse(localStorage.getItem(storageKey) || '[]')) done.add(key); } catch { /* sem armazenamento: só a conta guarda */ }
  let open = null, bypass = null;
  const remember = key => {
    done.add(key);
    try { localStorage.setItem(storageKey, JSON.stringify([...done])); } catch { /* ok */ }
    try { save(key); } catch { /* ok */ }
  };
  const close = () => { open?.node.remove(); open = null; document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); const current = open; close(); if (current) remember(current.key); } };
  function place() {
    if (!open) return;
    const { node, target } = open, rect = target.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    node.classList.remove('is-above', 'is-sheet');
    if (vw < 560) { node.classList.add('is-sheet'); node.style.left = ''; node.style.top = ''; return; }
    const box = node.getBoundingClientRect(), gap = 12;
    let top = rect.bottom + gap, above = false;
    if (top + box.height > vh - 8 && rect.top - gap - box.height > 8) { top = rect.top - gap - box.height; above = true; }
    top = Math.max(8, Math.min(vh - box.height - 8, top));
    const left = Math.max(8, Math.min(vw - box.width - 8, rect.left + rect.width / 2 - box.width / 2));
    node.style.left = left + 'px'; node.style.top = top + 'px';
    node.style.setProperty('--arrow-x', Math.max(16, Math.min(box.width - 16, rect.left + rect.width / 2 - left)) + 'px');
    if (above) node.classList.add('is-above');
  }
  function show(target, key, resume) {
    const tip = catalog[key];
    if (!tip) return false;
    close();
    const node = document.createElement('div');
    node.className = 'dtf-tip'; node.setAttribute('role', 'dialog'); node.setAttribute('aria-live', 'polite'); node.setAttribute('aria-label', tip.title);
    node.innerHTML = '<div class="dtf-tip-head"><span class="dtf-tip-icon" aria-hidden="true">💡</span><b>' + esc(tip.title) + '</b></div><p>' + esc(tip.text) + '</p>'
      + (tip.affects ? '<p class="dtf-tip-affects"><b>O que muda:</b> ' + esc(tip.affects) + '</p>' : '')
      + '<div class="dtf-tip-actions"><button type="button" class="dtf-btn dtf-btn-primary" data-tip-ok>Já entendi</button></div>';
    document.body.appendChild(node);
    open = { node, target, key };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('keydown', onKey, true);
    node.querySelector('[data-tip-ok]').addEventListener('click', () => { close(); remember(key); resume?.(); });
    node.querySelector('[data-tip-ok]').focus({ preventScroll: true });
    return true;
  }
  // 1º toque em botão/link com data-tip: mostra o balão e segura a ação; "Já entendi" continua a ação.
  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-tip]');
    if (!target || target === bypass || target.closest('.dtf-tip')) return;
    const key = target.dataset.tip;
    if (done.has(key) || !catalog[key]) return;
    if (target.matches('input,select,textarea')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    // Continua exatamente o que foi tocado (ex.: o "+" dentro do grupo da quantidade), não só o grupo.
    const actual = event.target.closest?.('button,a,label,input,select,textarea,[role=button],[data-act]');
    const resumeOn = actual && target.contains(actual) ? actual : target;
    show(target, key, () => { if (!resumeOn.isConnected) return; bypass = target; try { resumeOn.click(); } finally { bypass = null; } });
  }, true);
  // Campos: balão no 1º foco, sem segurar nada.
  document.addEventListener('focusin', event => {
    const target = event.target.closest?.('input[data-tip],select[data-tip],textarea[data-tip]');
    if (!target) return;
    const key = target.dataset.tip;
    if (done.has(key) || !catalog[key] || open?.key === key) return;
    show(target, key, () => target.focus());
  });
  return {
    // Balão de uma tela inteira (ex.: boas-vindas), mostrado uma vez quando a tela aparece.
    intro(target, key) { if (target && !done.has(key) && catalog[key] && !open) show(target, key); },
    seen: key => done.has(key),
    reset() { done.clear(); try { localStorage.removeItem(storageKey); } catch { /* ok */ } },
    close,
  };
}
