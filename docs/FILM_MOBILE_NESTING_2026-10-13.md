# 019 2.17.73 — filme em lote e mobile

Base: 6194272671579f532fd859f8eaae478381a7e9fa, versão publicada 2.17.72. Solicitações do dono: concluir o encaixe das centenas de aplicações que já entram rapidamente, recuperar medidas/metros/dados e tornar a visualização utilizável no iPhone.

## Diagnóstico e escopo
O motor por contornos tem orçamento de posições e máscaras. A falha desse motor não assegurava um candidato completo utilizável. A validação também materializava máscaras por aplicação mesmo para um arranjo retangular. A prévia tinha escala fixada em até 700 px, sem relação com a largura real do celular; controles ficavam depois do filme longo.

## Correções
- Lotes de 100 ou mais cópias usam empacotamento retangular limitado, com candidato completo antes da otimização adicional. Não é garantia de ótimo global e não procura dentro das áreas transparentes. Nenhuma dimensão física é reduzida.
- Validação por identificação/cópia, grade, tamanho original, rotação autorizada, limite e distância mínima. Quando retângulos se sobrepõem, mantém a validação por máscara existente, sem declarar esse caso seguro.
- Lotes grandes não precisam baixar e analisar todas as máscaras antes de calcular. Progresso por três fases e painel com largura, comprimento, metros, ocupação retangular aproximada, desperdício aproximado, modo e quantidade de cópias.
- Escala de prévia baseada no contêiner real. Rolagem e zoom contidos na área do filme. Botões Ampliar filme, Ajustar largura, Ver tudo, menos e mais; controles antes da prévia; visualização ampliada adaptada à altura disponível.
- No celular, filme e métricas aparecem antes da lista de centenas de artes. Lista com rolagem própria e botão de recolher. Imagens da prévia carregam sob demanda.
- Mantidos lote/JWT da 2.17.72, status do QR, rascunhos, arquivos e regras de exportação. Nenhuma migration ou escrita em pedidos/estoque nesta correção.

## Verificação
Testes locais do novo motor com 101, 386 e 1000 cópias sintéticas, medidas e determinismo. Testes de apresentação em Chromium com larguras 320, 375, 390, 430, 768 e 1280, zoom, expandir/fechar, seleção e limpeza ao navegar. Fixture local usa o contrato de coordenadas da prévia; não substitui uma sessão autenticada no Safari do dono.
O build testa o solver final compilado, as âncoras de integração e repete as regressões existentes de encaixe e rotação. Só registrar publicação após Vercel READY e conferir o domínio. Exportação de um filme real muito grande no iPhone continua dependente de memória/armazenamento e requer conferência no aparelho; nenhum teste deve alterar pedidos reais.
