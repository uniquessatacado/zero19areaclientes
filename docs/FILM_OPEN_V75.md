# 019 2.17.75 — abertura do filme salvo

Base: 0d797538aff414d12b71b32ff52b0bdbaf2ea797 (2.17.74). Pedido urgente do dono: abrir o filme sem ficar 20 minutos no carregamento.

## Causa e correção
A restauração reconstruía todas as prévias de escrita antes de abrir o editor. Em seguida a abertura ainda aguardava URLs privadas, perfis de arte, fontes, glifos, times e catálogos completos. O carregamento sob demanda da prévia v74 ocorria tarde demais para resolver esse bloqueio.

Agora a abertura aguarda somente o rascunho salvo e os perfis de rolo (em paralelo). Não reconstrói as prévias nem consulta catálogos de artes/fontes antes de mostrar o editor. As posições e medidas salvas são preservadas. Fontes e imagens são preparadas somente quando a fila da área visível solicita cada prévia; catálogos são carregados ao pedir para adicionar artes, com controle contra consultas duplicadas.

Leituras de abertura possuem limite de espera e tratamento de renovação da sessão. Uma falha de recuperação mostra Tentar abrir novamente; não é interpretada como filme vazio. Revisão desconhecida e conflito continuam impedindo sobrescrever a nuvem. A correção não limpa armazenamento, não descarta rascunhos e não grava pedidos/estoque.

## Validação
O build valida o JavaScript final e executa o trecho real compilado de renderFilm até montar o HTML do editor, com 807 itens sintéticos e dependências de imagem/fonte/catálogo bloqueadas. Verifica também a restauração sem renderizar prévias, consultas por item visível, retentativa de catálogo e proteções de gravação. Testes anteriores rodam no pipeline. Isto não é uma medição de tempo real do Safari do usuário nem acesso autenticado ao filme real.

Somente anunciar publicado depois de Vercel READY e confirmar versão e módulos no domínio oficial.
