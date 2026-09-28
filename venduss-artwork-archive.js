const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function createVendussArtworkArchive({supabase, app, shell, bindCommon, accountOwnerId, sessionUserId, libraryWorkspace, nav, toast}) {
  const bucket = supabase.storage.from('venduss-print-artworks');
  let rows = [];
  let signed = new Map();

  async function render() {
    app.innerHTML = shell('<main class="container venduss-archive"><header class="venduss-archive-head"><div><small>VEN DUSS × ZERO19</small><h1>Acervo de estampas Venduss</h1><p>Artes de impressão vinculadas às peças estampadas. Arquivos privados, organizados por marca.</p></div><button class="btn" data-nav="/">Voltar</button></header><div id="vendussArchiveBody" class="venduss-archive-loading">Carregando estampas…</div></main>', {back:true});
    bindCommon();
    const {data, error} = await supabase.rpc('z19p_list_partner_artworks');
    const body = document.getElementById('vendussArchiveBody');
    if (!body) return;
    if (error) { body.innerHTML = `<p role="alert" class="venduss-archive-error">Não foi possível abrir o acervo: ${esc(error.message)}</p>`; return; }
    rows = data || [];
    signed = new Map();
    await Promise.all(rows.map(async row => {
      const {data: link} = await bucket.createSignedUrl(row.prepared_path, 600);
      if (link?.signedUrl) signed.set(row.product_id, link.signedUrl);
    }));
    const brands = [...new Set(rows.map(row => row.brand_name || 'Sem marca'))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    body.innerHTML = rows.length ? `<div class="venduss-archive-tools"><label for="vendussArchiveSearch">Buscar peça ou marca</label><input id="vendussArchiveSearch" type="search" placeholder="Ex.: oversized, Corinthians…"><span>${rows.length} estampa(s)</span></div><div id="vendussArchiveGroups">${brands.map(brand => groupHTML(brand, rows.filter(row => (row.brand_name || 'Sem marca') === brand))).join('')}</div>` : '<div class="venduss-archive-empty">Ainda não há estampas vinculadas. A arte cadastrada no Venduss aparecerá aqui automaticamente.</div>';
    body.querySelector('#vendussArchiveSearch')?.addEventListener('input', event => {
      const query = event.target.value.trim().toLocaleLowerCase('pt-BR');
      const visible = rows.filter(row => `${row.product_name} ${row.brand_name}`.toLocaleLowerCase('pt-BR').includes(query));
      body.querySelector('#vendussArchiveGroups').innerHTML = [...new Set(visible.map(row => row.brand_name || 'Sem marca'))].sort((a,b) => a.localeCompare(b,'pt-BR')).map(brand => groupHTML(brand, visible.filter(row => (row.brand_name || 'Sem marca') === brand))).join('') || '<p class="venduss-archive-empty">Nenhuma estampa encontrada.</p>';
    });
    body.addEventListener('click', event => {
      const button = event.target.closest('[data-venduss-action]');
      if (!button) return;
      const row = rows.find(item => String(item.product_id) === button.dataset.productId);
      if (!row) return;
      if (button.dataset.vendussAction === 'shirt') showShirt(row);
      if (button.dataset.vendussAction === 'download') download(row);
      if (button.dataset.vendussAction === 'film') void addToFilm(row, button);
    });
  }

  function groupHTML(brand, items) {
    return `<section class="venduss-archive-group"><h2>${esc(brand)} <small>${items.length} estampa(s)</small></h2><div class="venduss-archive-grid">${items.map(row => `<article class="venduss-archive-card"><div class="venduss-archive-art"><img src="${esc(signed.get(row.product_id) || '')}" alt="Estampa de ${esc(row.product_name)}" loading="lazy"></div><div class="venduss-archive-info"><small>Produto #${esc(row.product_id)}</small><h3>${esc(row.product_name)}</h3><p>${esc(row.width_cm)} × ${esc(row.height_cm)} cm · ${esc(row.print_position_label || 'Posição ainda não definida')}</p></div><div class="venduss-archive-actions"><button class="btn small" data-venduss-action="shirt" data-product-id="${esc(row.product_id)}">Ver na camisa</button><button class="btn small" data-venduss-action="download" data-product-id="${esc(row.product_id)}">Baixar PNG</button><button class="btn small primary" data-venduss-action="film" data-product-id="${esc(row.product_id)}">Colocar no filme</button></div></article>`).join('')}</div></section>`;
  }

  function showShirt(row) {
    const modal = document.createElement('div');
    modal.className = 'venduss-archive-modal';
    modal.innerHTML = `<div class="venduss-archive-modal-content" role="dialog" aria-modal="true" aria-label="Ver estampa na camisa"><button class="btn small" data-close>Fechar</button><h2>${esc(row.product_name)}</h2><p>Foto principal cadastrada no Venduss mostra a posição visual da estampa na peça.</p><div class="venduss-archive-comparison"><figure><img src="${esc(row.main_image_url || '')}" alt="Foto da camisa com a estampa"><figcaption>Camisa anunciada</figcaption></figure><figure><img src="${esc(signed.get(row.product_id) || '')}" alt="Arte isolada para impressão"><figcaption>Arte para impressão · ${esc(row.print_position_label || 'posição não definida')}</figcaption></figure></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('[data-close]')) modal.remove(); });
  }

  async function download(row) {
    const {data, error} = await bucket.createSignedUrl(row.prepared_path, 120);
    if (error || !data?.signedUrl) { toast('Não foi possível abrir o PNG privado.','err'); return; }
    const anchor = document.createElement('a');
    anchor.href = data.signedUrl;
    anchor.download = `venduss-${row.product_id}-estampa.png`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function addToFilm(row, button) {
    button.disabled = true;
    button.textContent = 'Preparando arte…';
    const uploaded = [];
    let savedAssetId = null;
    try {
      const ownerId = accountOwnerId();
      const workspace = await libraryWorkspace();
      if (!workspace?.id) throw new Error('Biblioteca de artes não disponível.');
      const existing = await supabase.from('z19p_assets').select('id,metadata').eq('workspace_id',workspace.id).contains('metadata',{venduss_product_id:row.product_id}).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.id && existing.data.metadata?.venduss_prepared_path === row.prepared_path) { nav('/filme'); return; }
      const {data: blob, error: downloadError} = await bucket.download(row.prepared_path);
      if (downloadError || !blob) throw downloadError || new Error('PNG indisponível.');
      const id = crypto.randomUUID();
      const base = `${ownerId}/${workspace.id}/root/${id}`;
      const original = `${base}/original.png`, processed = `${base}/processed.png`;
      for (const path of [original,processed]) {
        const {error} = await supabase.storage.from('z19p-assets').upload(path,blob,{contentType:'image/png',upsert:false});
        if (error) throw error;
        uploaded.push(path);
      }
      const userId = sessionUserId();
      const asset = {id,owner_id:ownerId,workspace_id:workspace.id,name:`Venduss · ${row.brand_name} · ${row.product_name} #${row.product_id}`,asset_type:'arte',original_path:original,processed_path:processed,mime_type:'image/png',size_bytes:blob.size,width:row.pixel_width,height:row.pixel_height,dpi:300,alpha_trimmed:true,background_removed:false,maximized:false,created_by:userId,updated_by:userId,metadata:{venduss_product_id:row.product_id,venduss_tenant_id:row.tenant_id,venduss_prepared_path:row.prepared_path,brand_name:row.brand_name,print_position_code:row.print_position_code,print_position_label:row.print_position_label,print_ready_intent:true,requested_width_cm:row.width_cm,requested_height_cm:row.height_cm}};
      const saved = await supabase.from('z19p_assets').insert(asset);
      if (saved.error) throw saved.error;
      savedAssetId = id;
      const profile = await supabase.from('z19p_asset_print_profiles').upsert({asset_id:id,owner_id:ownerId,default_width_cm:row.width_cm,default_height_cm:row.height_cm,aspect_ratio:Number(row.width_cm)/Number(row.height_cm),halftone:false,allow_internal_nesting:true,rotation_policy:'free',ready_for_print:true,created_by:userId,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:'asset_id'});
      if (profile.error) throw profile.error;
      toast('Arte Venduss disponível no filme DTF.','ok');
      nav('/filme');
    } catch (error) {
      if (savedAssetId) await supabase.from('z19p_assets').delete().eq('id',savedAssetId);
      if (uploaded.length) await supabase.storage.from('z19p-assets').remove(uploaded);
      toast(`Não foi possível colocar no filme: ${error?.message || error}`,'err');
    } finally {
      button.disabled = false;
      button.textContent = 'Colocar no filme';
    }
  }

  return {render};
}
