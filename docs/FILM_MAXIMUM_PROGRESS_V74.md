# 019 2.17.74 — Máximo, progresso e prévias no celular

Base: c6d54e5f38d8b45754f81dbca6824e54e60a4434 (2.17.73). Pedido: barra de progresso, respeitar Máximo, conferir metragem, carregar as artes e estabilizar navegação mobile.

## Diagnóstico confirmado
A versão 2.17.73 retornava o candidato de lote para 100 ou mais cópias independentemente do modo. A etapa de medidas escrevia texto dentro do grid de métricas. A prévia atribuía originais grandes a centenas de imagens lazy, sem controle próprio de erro/retentativa. Não foi reproduzido um erro de medidas dos 37,467 m da captura; o filme real não foi sobrescrito para testar.

## Alterações
- Máximo mantém o candidato completo validado e executa a busca adicional por contornos/rotações. Normal mantém o caminho retangular. Nenhuma dimensão é reduzida para economizar filme. O resultado conserva uma alternativa completa em caso de limite; limitações aparecem no painel, sem chamar o modo Máximo de Lote rápido.
- Geometrias conservadoras repetidas reutilizam as máscaras já validadas, reduzindo memória. Regressões antigas de rotação, afastamento, cópia e transparências rodam contra o código final compilado.
- Barras nativas com contagem por etapa de preparação, sinais reais do worker, interrupção e progresso separado das prévias da área visível. Não há porcentagem calculada apenas pelo relógio.
- Máscaras indisponíveis no orçamento de carregamento reservam o retângulo completo e são informadas. Halftones e escritas preservam reserva conservadora. A busca limitada não promete um ótimo global nem uma redução específica dos 37,467 m.
- Prévia resolve os caminhos da sessão autenticada. Só usa thumbnail quando corresponde ao mesmo arquivo salvo; o PNG de pedido não é substituído pela arte atual da biblioteca. Imagens são decodificadas em fila e convertidas em bitmaps pequenos exclusivamente para visualização; exportação continua com os originais.
- Prévia com erro mostra aviso e botão para tentar novamente. Zoom preserva nós de imagem e coordenadas físicas. Enquadramento de largura bloqueia deslocamento horizontal; a rolagem lateral só abre com zoom. Controles detalhados recolhíveis, rodapé sem espaço flexível de 170 px e ampliação com espaço dedicado ao filme.

## Verificação e limites
Componentes novos testados em fixture Chromium local com 807 posições, zoom, ampliar/fechar, selecionar/girar, falha de prévia e barra de progresso. A fixture não é uma sessão autenticada da loja nem Safari real. O build executa os testes antigos e novos no solver compilado antes de permitir publicação.
Não altera pedidos, pagamentos, estoque, status, exportações existentes ou rascunhos reais para testar. Publicação só pode ser anunciada após READY e conferência do domínio. Não é garantia de ausência de falhas de rede, arquivos danificados ou falta de memória no aparelho.
