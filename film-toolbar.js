// 2.17.99 (14/11, dono: "organize meu Montar filme com um layout melhor e botões organizados; está uma bagunça, muito botão ocupando a tela,
// um de um tamanho, outro de outro; categorize, mas sempre visível: Atualizar filme, Pedidos DTF metro, Aguardando produção, Arte de empresa
// (muda o nome para Biblioteca de artes), Subir arte na biblioteca, Exportar filme; Personalização muda o nome para Fontes de time").
// Reorganiza a barra do filme a cada vez que a tela é montada: MOVE os botões que já existem (os cliques continuam os mesmos),
// troca os nomes e põe tudo num padrão (principais no topo, o resto por categoria, todos do mesmo tamanho).
const MAIN = [
  ['calculateFilm', '⟳ Atualizar filme', 'is-primary'],
  ['addOfficialPending', null, 'is-pending'],
  ['openDtfOrders', null, 'is-dtf'],
  ['addFilmAsset', '🗂 Biblioteca de artes', 'is-library'],
  ['quickUploadFilmAsset', '⇧ Subir arte na biblioteca', 'is-upload'],
];
const GROUPS = [
  ['Adicionar ao filme', [['addFilmTeam', '🔤 Fontes de time'], ['openFilmStudio', '🎨 Montar no estúdio'], ['openFilmKits', '🧩 Kits de camisa'], ['findFilmOrder', '🔎 Buscar pedido'], ['viewNextOrders', '📋 Próximos pedidos']]],
  ['Ferramentas', [['openSitePrints', '🖨 Estampas do site · halftone'], ['openVectorizer', '✨ Vetorizar arte'], ['viewFilm', '👁 Ver filme em tela cheia']]],
];

function setLabel(button, label) {
  if (!label) return;
  // Mantém só o texto (o botão "Aguardando produção" e o "Pedidos DTF" têm contadores dentro e não são renomeados).
  button.textContent = label;
}

function organize(section) {
  const page = section.closest('.film-page');
  if (!page || section.dataset.ftOrganized) return;
  section.dataset.ftOrganized = '1';
  const byId = id => page.querySelector('#' + id);
  const bar = document.createElement('div'); bar.className = 'ft-bar';
  // 1) Configuração do filme: nome, filme, modo e espaço numa linha só.
  const setup = document.createElement('div'); setup.className = 'ft-setup';
  [...section.querySelectorAll(':scope > .field')].forEach(field => { field.classList.add('ft-field'); setup.appendChild(field); });
  // 2) Principais: sempre à vista, mesmo tamanho.
  const main = document.createElement('div'); main.className = 'ft-main'; main.setAttribute('aria-label', 'Ações principais');
  for (const [id, label, tone] of MAIN) {
    const button = byId(id); if (!button) continue;
    button.className = 'btn ft-btn ft-big ' + tone; setLabel(button, label); main.appendChild(button);
  }
  // Exportar: o botão de verdade fica embaixo do filme (a tela cheia usa ele); aqui em cima um atalho que acompanha se está liberado.
  const realExport = byId('exportFilm');
  if (realExport) {
    const shortcut = document.createElement('button'); shortcut.type = 'button'; shortcut.className = 'btn ft-btn ft-big is-export'; shortcut.textContent = '⬇ Exportar filme';
    const sync = () => { shortcut.disabled = realExport.disabled; shortcut.title = realExport.disabled ? 'Atualize o filme antes de exportar' : 'Gerar PNG ou TIFF 300 DPI'; };
    shortcut.onclick = () => { if (!realExport.disabled) realExport.click(); };
    new MutationObserver(sync).observe(realExport, { attributes: true, attributeFilter: ['disabled'] }); sync();
    main.appendChild(shortcut);
  }
  // 3) Categorias.
  const groups = document.createElement('div'); groups.className = 'ft-groups';
  for (const [title, items] of GROUPS) {
    const group = document.createElement('section'); group.className = 'ft-group';
    group.innerHTML = `<h3>${title}</h3><div class="ft-group-buttons"></div>`;
    const holder = group.querySelector('.ft-group-buttons');
    for (const [id, label] of items) { const button = byId(id); if (!button) continue; button.className = 'btn ft-btn ft-small'; setLabel(button, label); holder.appendChild(button); }
    if (holder.children.length) groups.appendChild(group);
  }
  // Botões que alguma versão futura adicionar e não estiverem na lista vão para "Ferramentas" (nunca somem).
  const leftovers = [...section.querySelectorAll(':scope > button')];
  if (leftovers.length) {
    let tools = [...groups.children].find(group => group.querySelector('h3')?.textContent === 'Ferramentas');
    if (!tools) { tools = document.createElement('section'); tools.className = 'ft-group'; tools.innerHTML = '<h3>Ferramentas</h3><div class="ft-group-buttons"></div>'; groups.appendChild(tools); }
    leftovers.forEach(button => { button.className = 'btn ft-btn ft-small'; tools.querySelector('.ft-group-buttons').appendChild(button); });
  }
  bar.append(setup, main, groups);
  section.className = 'ft-section';
  section.replaceChildren(bar);
}

let installed = false;
export function installFilmToolbar() {
  if (installed || typeof document === 'undefined') return; installed = true;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('./film-toolbar.css?v=2.17.99', import.meta.url).href; document.head.appendChild(link);
  const run = () => document.querySelectorAll('.film-page .film-primary-controls:not([data-ft-organized])').forEach(organize);
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  run();
}
