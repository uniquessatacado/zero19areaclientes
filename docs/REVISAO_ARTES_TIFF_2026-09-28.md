# Revisão de artes e opções TIFF — 28/09/2026

## Diagnóstico confirmado

- #49322 possuía duas artes `ready_production` no banco, ambas `alpha_trimmed=false` e `maximized=false`. A revisão anterior salvava perfil/posição, não preparava o PNG. Consulta atual: peito 9×3 cm, costas 40×41,993 cm. Nenhuma medida real foi modificada nesta intervenção.
- Cartões de outra posição estavam desabilitados para evitar troca incorreta de vínculo; agora navegam para o arquivo correto, com rascunhos separados.
- A lista externa voltava a oferecer revisão indefinidamente. A revisão agora percorre as posições elegíveis e fecha ao confirmar que todas estão liberadas.

## Alterações

- Preparação reutiliza o processador do upload, recorta bordas transparentes e amplia quando necessário para 300 DPI físicos. Preserva original, fonte de halftone e versões anteriores. Repetição com mesma fonte/medidas reaproveita o PNG; nova edição da fonte invalida esse reaproveitamento. Não promete recuperar detalhes inexistentes.
- Preparação ocorre antes de perfil/posicionamento/liberação. Falha aparece junto ao botão e mantém a revisão aberta. Vínculo por personalization_sale_id continua protegido.
- TIFF RGB: quatro canais RGBA, Photometric=2, ExtraSamples=2, sem conversão ICC nem curva/Spot. CMYK mantém cinco canais/Spot, com opção de curva desativada via LUT identidade. Escolhas explícitas e resultado identificado no nome/resumo.
- A pergunta sobre desejar Spot também em RGB foi enviada. O modo implementado é explicitamente RGB com transparência **sem Spot**; não se afirma que RGB inclui branco separado.
- Preservada a confirmação de produção depois da exportação, sem duplicar callback financeiro ao alternar formatos.

## Evidências

- `scripts/test-print-art-preparation.mjs`: preparação, origem estável, reaproveitamento, erro de persistência.
- `scripts/test-film-tiff-options.mjs`: tags TIFF, bytes RGB/alpha, bypass de worker ICC, LUT identidade e curva existente.
- `scripts/artwork-organizer-browser-qa.mjs`: desktop 1280×800 e mobile 390×844, troca frente/costas sem perder rascunho, vínculos separados, salvamento sem duplicar posicionamento; processador real corta amostra 40×40 para 20×30 e gera 300×450 px com pHYs=11811.
- `scripts/tiff-options-browser-qa.mjs`: desktop/mobile, exportação real dos três modos, CMYK via worker/WASM; RGB não inicia worker. Sem overflow no modal, callback financeiro único em fixture.
- `scripts/artwork-identity-live-rollback.sql`: 11 verificações passaram no banco para titular/equipe, vínculo correto e rejeição de troca frente/costas. ROLLBACK integral; sem estoque/pagamentos.
- Build completo e publicação: registrar resultado após implantação.

## Limites

Não houve venda nem impressão física no RIP. Teste de navegador usa dados sintéticos, não sessão operacional da equipe. Consulta/rollback do banco real complementa, mas não equivale a teste autenticado integral da loja. Nenhuma migração necessária. Auditoria e demais pendências históricas continuam abertas.
