# Requirements Document

## Introduction

O DocScan é um PWA (Progressive Web App) instalável para digitalização de documentos com câmera, projetado como alternativa ao CamScanner — sem anúncios, sem paywall e com processamento de imagem 100% no cliente. O aplicativo permite ao usuário capturar páginas via câmera ou galeria, aplicar correção de perspectiva e filtros de imagem, organizar documentos multi-página e exportar em PDF ou JPG. Os documentos são armazenados e sincronizados na nuvem via Supabase, com suporte a captura e visualização offline básica.

O projeto já conta com uma base de código funcional em React + Vite + TypeScript + Supabase, incluindo: fluxo de captura (`CaptureFlow`), utilitários de imagem (`detectQuad`, `warpPerspective`, `applyFilter`, `rotateCanvas`), gerenciamento de documentos (`docs.ts`) e exportação PDF (`export.ts`). Este documento de requisitos cobre o sistema completo — consolidando o que já existe e especificando o que ainda precisa ser construído para atingir o escopo do MVP e das fases seguintes.

---

## Glossary

- **App**: O PWA DocScan como um todo.
- **Usuário**: Pessoa autenticada que utiliza o App.
- **Documento**: Coleção nomeada de uma ou mais Páginas, associada a um Usuário.
- **Página**: Imagem JPEG de uma face digitalizada de um documento físico, pertencente a um Documento.
- **Quad**: Quadrilátero de quatro cantos que delimita a borda do documento na imagem capturada.
- **CaptureFlow**: Componente de interface que gerencia os estágios de captura (câmera → recorte → revisão).
- **Biblioteca**: Tela que lista todos os Documentos do Usuário.
- **Filtro**: Transformação de imagem aplicada a uma Página (cor, cinza, P&B, realce).
- **Exportação**: Geração de arquivo PDF ou JPG a partir das Páginas de um Documento.
- **Sincronização**: Processo de enviar para o Supabase Storage e Postgres dados capturados enquanto offline.
- **Service Worker**: Script de background que habilita uso offline e instalação como PWA.
- **OCR**: Reconhecimento óptico de caracteres para extração de texto de uma Página.

---

## Requirements

### Requisito 1 — Captura via câmera

**User Story:** Como Usuário, quero capturar páginas de documentos físicos usando a câmera do dispositivo, para que eu possa digitalizar documentos de forma rápida sem precisar de um scanner dedicado.

#### Critérios de Aceitação

1. WHEN o Usuário abre o fluxo de captura, THE CaptureFlow SHALL acessar a câmera traseira do dispositivo via `MediaDevices.getUserMedia` com resolução preferencial de 2560×1440 e exibir a prévia de vídeo ao vivo em até 3 segundos.
2. IF o acesso à câmera é negado pelo sistema operacional ou pelo usuário, THEN THE CaptureFlow SHALL exibir uma mensagem de erro indicando a causa da negação e SHALL habilitar o envio de imagem via galeria do dispositivo como alternativa, sem encerrar o fluxo.
3. WHEN o Usuário pressiona o botão de captura, THE CaptureFlow SHALL congelar o frame do vídeo, capturar a imagem com resolução mínima de 1280×720 e avançar para o estágio de recorte em menos de 500 ms.
4. IF o Usuário seleciona um arquivo via galeria com formato não suportado (fora de JPEG, PNG, WEBP) ou com tamanho superior a 20 MB, THEN THE CaptureFlow SHALL exibir uma mensagem de erro descritiva e SHALL manter o Usuário no estágio de câmera sem avançar.
5. WHEN o fluxo de captura é fechado, THE CaptureFlow SHALL encerrar todas as trilhas de stream de câmera ativas em até 1 segundo para liberar o hardware.
6. THE CaptureFlow SHALL completar o fluxo câmera → recorte → revisão → confirmação em no máximo 4 interações do Usuário com a tela.

---

### Requisito 2 — Detecção automática de bordas

**User Story:** Como Usuário, quero que o App detecte automaticamente os cantos do documento na foto, para que eu não precise ajustar manualmente toda vez.

#### Critérios de Aceitação

1. WHEN o CaptureFlow avança para o estágio de recorte, THE App SHALL executar `detectQuad` no canvas capturado e exibir o Quad detectado como overlay SVG sobre a imagem, com todos os 4 vértices posicionados dentro dos limites do canvas.
2. WHEN `detectQuad` não encontra bordas convincentes (área do Quad < 25% da área da imagem capturada), THE App SHALL exibir um Quad de fallback onde cada vértice é recuado 6% da borda mais próxima do canvas, sem bloquear o avanço do fluxo.
3. IF `detectQuad` lança exceção ou excede o tempo limite de execução, THEN THE App SHALL aplicar o Quad de fallback descrito no Critério 2 e SHALL registrar o erro internamente, sem bloquear o avanço do fluxo.
4. THE App SHALL concluir a detecção de bordas — medida desde o avanço para o estágio de recorte até a exibição do overlay SVG — em menos de 500 ms.

---

### Requisito 3 — Ajuste manual de perspectiva

**User Story:** Como Usuário, quero ajustar os quatro cantos do recorte manualmente, para que eu possa corrigir casos em que a detecção automática errou.

#### Critérios de Aceitação

1. WHILE o estágio de recorte está ativo, THE CaptureFlow SHALL renderizar quatro alças de arrastar com área de toque mínima de 32×32 px nos cantos do Quad detectado.
2. WHEN o Usuário arrasta uma alça de canto, THE CaptureFlow SHALL atualizar a posição do canto em tempo real com latência inferior a 16 ms por frame, mantendo o vértice dentro dos limites do canvas.
3. WHEN o Usuário confirma o recorte, THE App SHALL validar que o Quad resultante é não-auto-intersectante e com área maior que 0 px antes de aplicar `warpPerspective`.
4. IF o Quad resultante é auto-intersectante ou tem área igual a zero, THEN THE App SHALL exibir uma mensagem de erro indicando seleção inválida e SHALL manter o Usuário no estágio de recorte sem perder a imagem capturada.
5. WHEN o Quad é válido e o Usuário confirma o recorte, THE App SHALL aplicar `warpPerspective` com o Quad ajustado e avançar para o estágio de revisão.
6. IF `warpPerspective` falha com exceção, THEN THE App SHALL exibir uma mensagem de erro e SHALL manter o Usuário no estágio de recorte sem perder a imagem capturada.

---

### Requisito 4 — Filtros de imagem

**User Story:** Como Usuário, quero aplicar filtros de imagem à página digitalizada, para que o resultado fique legível e com boa qualidade visual.

#### Critérios de Aceitação

1. THE CaptureFlow SHALL oferecer quatro filtros: Realce (enhance), Preto e Branco (bw), Cinza (gray) e Cor (color).
2. WHEN o Usuário seleciona um filtro no estágio de revisão, THE App SHALL re-renderizar a prévia da Página com o novo filtro aplicado em menos de 2 segundos, medidos em um dispositivo com benchmark Octane 2.0 equivalente a 20.000 pontos ou superior.
3. WHEN o CaptureFlow avança do estágio de recorte para o estágio de revisão, THE App SHALL aplicar automaticamente o filtro Realce como seleção padrão.
4. WHEN o Usuário altera o filtro, THE App SHALL processar a transformação diretamente sobre o canvas retificado por `warpPerspective`, sem reler a imagem do armazenamento ou do Storage remoto.

---

### Requisito 5 — Confirmação e adição de página

**User Story:** Como Usuário, quero confirmar a página revisada e adicioná-la ao documento, para que eu possa construir documentos multi-página página a página.

#### Critérios de Aceitação

1. WHEN o Usuário confirma a página no estágio de revisão, THE App SHALL converter o canvas processado em JPEG com qualidade 0.85 via `canvasToJpeg`.
2. IF a conversão para JPEG falha, THEN THE App SHALL exibir uma mensagem de erro e SHALL manter o Usuário no estágio de revisão sem descartar o canvas processado.
3. WHEN a conversão para JPEG é bem-sucedida, THE App SHALL invocar o callback `onPage` com os dados da Página e SHALL retornar o CaptureFlow ao estágio de câmera para captura de nova página.
4. WHEN o callback `onPage` é invocado, THE App SHALL fazer upload do blob JPEG para o Supabase Storage no bucket `scans` sob o caminho `{userId}/{documentId}/{uuid}.jpg`.
5. IF o upload para o Supabase Storage falha, THEN THE App SHALL exibir uma mensagem de erro indicando falha no envio da imagem e SHALL manter os dados da Página disponíveis para que o Usuário possa tentar novamente manualmente ou descartar.
6. WHEN a Página é adicionada com sucesso, THE App SHALL atualizar o campo `updated_at` do Documento no banco de dados Postgres.
7. IF a atualização de `updated_at` falha, THEN THE App SHALL registrar o erro internamente sem reverter o arquivo já enviado ao Supabase Storage, mantendo a Página disponível no Documento.

---

### Requisito 6 — Criação de documento

**User Story:** Como Usuário, quero criar um novo documento ao iniciar o fluxo de captura, para que as páginas capturadas sejam organizadas automaticamente.

#### Critérios de Aceitação

1. WHEN o Usuário inicia uma nova digitalização a partir da Biblioteca, THE App SHALL criar um registro de Documento na tabela `documents` do Postgres com nome padrão "Documento" e `user_id` do Usuário autenticado.
2. WHEN o Documento é criado com sucesso, THE App SHALL navegar para a rota `/doc/{id}` do novo Documento.
3. IF a criação do Documento falha, THEN THE App SHALL exibir uma mensagem de erro, não criar nenhum registro parcial e SHALL manter o Usuário na Biblioteca.
4. WHEN o Usuário edita o nome do Documento na tela de detalhes, THE App SHALL persistir o novo nome via `renameDocument` no Postgres em até 500 ms após o Usuário sair do campo de edição ou pressionar Enter.
5. IF o nome fornecido pelo Usuário contém menos de 1 caractere não-espaço ou mais de 100 caracteres, THEN THE App SHALL exibir uma mensagem de validação e SHALL não persistir o nome inválido.
6. IF a renomeação falha, THEN THE App SHALL restaurar o nome anterior visualmente e SHALL exibir uma mensagem de erro.

---

### Requisito 7 — Gerenciamento de páginas

**User Story:** Como Usuário, quero reordenar, girar e excluir páginas dentro de um documento, para que eu possa organizar o conteúdo digitalizado conforme necessário.

#### Critérios de Aceitação

1. WHEN o Usuário reordena páginas via drag-and-drop na tela de detalhes, THE App SHALL atualizar o campo `position` de todas as Páginas afetadas via `reorderPages` no Postgres, refletindo a nova ordem na interface em até 2 segundos.
2. IF a reordenação falha, THEN THE App SHALL restaurar a ordem anterior das Páginas na interface sem nenhuma alteração persistida e SHALL exibir uma mensagem de erro indicando a falha na operação.
3. WHEN o Usuário gira uma Página 90° no sentido horário, THE App SHALL aplicar `rotateCanvas`, converter em JPEG com qualidade mínima de 85%, atualizar o arquivo no Supabase Storage via `replacePageImage` sem alterar o `storage_path`, e refletir a rotação na interface em até 3 segundos.
4. IF a rotação de Página falha, THEN THE App SHALL exibir uma mensagem de erro indicando a falha na operação e SHALL manter a Página com sua orientação anterior na lista.
5. WHEN o Usuário solicita a exclusão de uma Página, THE App SHALL exibir um diálogo de confirmação antes de executar qualquer operação de remoção.
6. WHEN o Usuário confirma a exclusão de uma Página, THE App SHALL remover o arquivo do Supabase Storage e excluir o registro da tabela `document_pages` dentro de 5 segundos.
7. IF a exclusão de Página falha, THEN THE App SHALL exibir uma mensagem de erro indicando a falha na operação e SHALL manter a Página na lista sem alteração.
8. WHEN todas as páginas de um Documento são excluídas, THE App SHALL exibir a tela de detalhes sem nenhuma página listada e com um controle visível para adicionar nova página.

---

### Requisito 8 — Exportação para PDF

**User Story:** Como Usuário, quero exportar o documento como PDF com todas as páginas, para que eu possa compartilhar ou arquivar o documento digitalizado.

#### Critérios de Aceitação

1. WHEN o Usuário aciona a exportação em PDF, THE App SHALL gerar um PDF com todas as Páginas do Documento, cada página em folha dedicada com dimensões iguais às dimensões em pixels da imagem correspondente, usando `buildPdf`.
2. THE App SHALL gerar o PDF sem marca d'água, sem paywall e sem anúncios.
3. WHEN o PDF é gerado com sucesso e a Web Share API está disponível no dispositivo, THE App SHALL invocar `shareOrDownload` para oferecer compartilhamento nativo.
4. IF a Web Share API não está disponível no dispositivo, THEN THE App SHALL disparar o download direto do arquivo PDF gerado.
5. WHILE a exportação está em andamento, THE App SHALL exibir um indicador de carregamento no botão de exportação e SHALL desabilitar novas exportações simultâneas.
6. IF a geração do PDF falha, THEN THE App SHALL exibir uma mensagem de erro indicando a causa da falha e SHALL restaurar o botão de exportação ao estado anterior ao acionamento.

---

### Requisito 9 — Exportação para imagens

**User Story:** Como Usuário, quero exportar páginas individuais como JPG, para que eu possa usar imagens avulsas sem precisar de um leitor de PDF.

#### Critérios de Aceitação

1. WHEN o Usuário aciona a exportação de imagens do Documento, THE App SHALL gerar arquivos JPEG com resolução mínima de 150 DPI e qualidade mínima de 80/100 para todas as Páginas do Documento e SHALL disponibilizá-los em um arquivo ZIP único nomeado `{nomeSeguro}-imagens.zip`.
2. WHEN o Usuário aciona o download de uma Página individual no menu de opções, THE App SHALL gerar e disparar o download de um arquivo JPEG com resolução mínima de 150 DPI e qualidade mínima de 80/100 nomeado `{nomeSeguro}-pagina-{n}.jpg`.
3. IF a conversão para JPEG de uma Página falha durante a exportação em lote, THEN THE App SHALL exibir uma mensagem de erro identificando a Página com falha, ignorar somente essa Página no ZIP e concluir o download das demais.
4. WHEN o Documento ainda está carregando suas páginas, THE App SHALL desabilitar a opção de exportação de imagens até que todas as páginas sejam carregadas.

---

### Requisito 10 — Biblioteca de documentos

**User Story:** Como Usuário, quero visualizar todos os meus documentos em uma biblioteca com miniaturas, para que eu possa acessar rapidamente qualquer documento salvo.

#### Critérios de Aceitação

1. THE App SHALL exibir todos os Documentos do Usuário autenticado na Biblioteca, ordenados por `updated_at` decrescente.
2. THE App SHALL exibir para cada Documento: miniatura da primeira Página, nome, data de última atualização e contagem de páginas.
3. WHEN o Usuário digita na caixa de busca da Biblioteca, THE App SHALL filtrar os Documentos cujo nome contém o texto digitado (insensível a maiúsculas/minúsculas) em tempo real, com latência máxima de 300 ms por caractere digitado.
4. WHEN a Biblioteca não contém nenhum Documento, THE App SHALL exibir uma tela vazia com mensagem indicativa e um botão para iniciar nova digitalização.
5. WHEN o Usuário solicita a exclusão de um Documento, THE App SHALL exibir um diálogo de confirmação antes de executar qualquer operação de remoção.
6. WHEN o Usuário confirma a exclusão de um Documento, THE App SHALL excluir todos os arquivos do Supabase Storage associados e excluir o registro da tabela `documents` via `deleteDocument`.
7. IF a exclusão de Documento falha parcialmente (ex: arquivos removidos mas registro não), THEN THE App SHALL exibir uma mensagem de erro e SHALL manter o Documento na lista até que a exclusão seja confirmada integralmente.
8. WHEN o Usuário cancela o diálogo de confirmação de exclusão, THE App SHALL fechar o diálogo sem executar nenhuma operação de remoção.
9. WHEN a Biblioteca é carregada, THE App SHALL gerar URLs assinadas para miniaturas com validade de 3600 segundos.
10. IF a geração de URL assinada para a miniatura de um Documento falhar, THEN THE App SHALL exibir um ícone de imagem genérico no lugar da miniatura, sem impedir o carregamento dos demais Documentos.

---

### Requisito 11 — Autenticação

**User Story:** Como Usuário, quero criar uma conta e entrar no App, para que meus documentos sejam salvos de forma segura e acessíveis em qualquer dispositivo.

#### Critérios de Aceitação

1. THE App SHALL oferecer autenticação via e-mail e senha através do Supabase Auth.
2. THE App SHALL oferecer autenticação via provedor social (OAuth) integrado ao Supabase Auth.
3. IF as credenciais fornecidas (e-mail/senha ou OAuth) são inválidas ou a autenticação falha, THEN THE App SHALL exibir uma mensagem de erro específica e SHALL manter o Usuário na tela de autenticação sem redirecionar.
4. IF o Usuário tenta criar uma conta com um e-mail já registrado, THEN THE App SHALL exibir uma mensagem indicando que o e-mail já está em uso e SHALL sugerir o fluxo de login.
5. WHEN o Usuário não está autenticado e acessa uma rota protegida, THE App SHALL redirecionar para a tela de autenticação.
6. WHEN a sessão do Usuário expira, THE App SHALL detectar a expiração na próxima operação autenticada, exibir a mensagem "Sessão expirada. Entre novamente." e SHALL redirecionar para a tela de autenticação.
7. WHEN o Usuário autentica com sucesso, THE App SHALL redirecionar para a Biblioteca.

---

### Requisito 12 — Armazenamento e sincronização em nuvem

**User Story:** Como Usuário, quero que meus documentos sejam sincronizados na nuvem, para que eu não perca dados ao trocar de dispositivo ou ao fechar o App.

#### Critérios de Aceitação

1. THE App SHALL armazenar todos os metadados de Documento e Página nas tabelas `documents` e `document_pages` do Supabase Postgres, incluindo identificador único do Usuário, título do Documento, data de criação e data de última modificação.
2. THE App SHALL armazenar todos os arquivos de imagem de Página no Supabase Storage no bucket `scans`, com tamanho máximo de 10 MB por arquivo e nos formatos JPEG ou PNG.
3. WHEN o Usuário acessa a Biblioteca, THE App SHALL buscar a lista de Documentos do Supabase e exibir os resultados em até 5 segundos a partir da requisição.
4. IF a requisição de busca dos Documentos ao Supabase falhar, THEN THE App SHALL exibir uma mensagem de erro ao Usuário indicando a falha na sincronização, sem exibir dados de sessão anterior.
5. THE App SHALL aplicar Row-Level Security (RLS) nas tabelas `documents` e `document_pages` de modo que cada operação de leitura, escrita e exclusão retorne exclusivamente os registros cujo identificador de Usuário corresponde ao Usuário autenticado na sessão atual.
6. IF o upload de um arquivo de imagem ao Supabase Storage falhar, THEN THE App SHALL exibir uma mensagem de erro ao Usuário indicando a falha no envio e não persistir o registro de metadados correspondente no Supabase Postgres.

---

### Requisito 13 — Suporte offline básico

**User Story:** Como Usuário, quero conseguir capturar páginas mesmo sem conexão com a internet, para que uma queda de rede não interrompa meu fluxo de trabalho.

#### Critérios de Aceitação

1. WHEN o dispositivo perde conexão com a internet, THE App SHALL permitir que o Usuário continue o fluxo de captura (câmera → recorte → revisão) sem exibir erros de conectividade nem bloquear a navegação entre estágios.
2. WHEN o dispositivo está offline e o Usuário confirma uma Página, THE App SHALL armazenar o blob JPEG juntamente com os metadados da Página (ID do Documento, número de ordem e timestamp de captura) na fila de sincronização local (IndexedDB) e SHALL exibir um indicador visual "pendente de sincronização" na Página.
3. WHEN a conexão com a internet é restaurada, THE App SHALL iniciar automaticamente a sincronização das Páginas pendentes em até 5 segundos após a detecção da reconexão.
4. WHEN a sincronização de uma Página pendente é concluída com sucesso, THE App SHALL remover o item da fila local e SHALL exibir uma notificação de sucesso ao Usuário.
5. IF a sincronização de uma Página pendente falha após a reconexão, THEN THE App SHALL incrementar o contador de tentativas do item na fila e SHALL exibir uma notificação de falha com opção de nova tentativa manual.
6. IF a sincronização de uma Página pendente falha 3 ou mais vezes, THEN THE App SHALL manter o item na fila, SHALL exibir uma notificação persistente de falha e SHALL oferecer ao Usuário a opção de descartar o item da fila.
7. WHILE o dispositivo está offline, THE App SHALL exibir de forma visível o número de Páginas pendentes de sincronização.

---

### Requisito 14 — PWA instalável

**User Story:** Como Usuário, quero instalar o App na tela inicial do meu dispositivo, para que eu possa acessá-lo rapidamente sem abrir o navegador.

#### Critérios de Aceitação

1. THE App SHALL incluir um `manifest.webmanifest` com `name`, `short_name`, `icons` (192×192 e 512×512 px), `start_url`, `display: standalone` e `background_color`, referenciado via `<link rel="manifest">` no `<head>` do HTML.
2. THE App SHALL registrar um Service Worker que faça cache de todos os assets estáticos gerados pelo build, de modo que a aplicação renderize sem realizar requisições de rede após a instalação.
3. WHEN um navegador compatível detecta os critérios de instalabilidade, THE App SHALL capturar e armazenar o evento `beforeinstallprompt` para exibição posterior.
4. WHERE o dispositivo suporta instalação de PWA e o prompt está disponível, THE App SHALL exibir um botão de instalação visível sem necessidade de rolar a página na primeira sessão do Usuário.
5. WHEN o Usuário aciona o botão de instalação, THE App SHALL invocar o prompt de instalação do navegador e SHALL ocultar o botão de instalação independentemente da escolha do Usuário.
6. WHEN o Service Worker é atualizado, THE App SHALL exibir uma notificação ao Usuário em até 5 segundos após a detecção da nova versão, e WHEN o Usuário confirma a atualização, THE App SHALL ativar o novo Service Worker e recarregar a página.

---

### Requisito 15 — OCR e busca por texto

**User Story:** Como Usuário, quero que o App reconheça o texto das páginas digitalizadas, para que eu possa pesquisar conteúdo dentro dos meus documentos.

#### Critérios de Aceitação

1. WHEN o Usuário solicita OCR em uma Página, THE App SHALL processar o reconhecimento de texto localmente no dispositivo, sem transmitir pixels para servidores externos, com tempo limite de 60 segundos por Página.
2. WHEN o OCR é concluído com sucesso, THE App SHALL armazenar o texto extraído no registro da Página no Postgres, substituindo qualquer texto extraído anteriormente para a mesma Página.
3. WHEN o Usuário realiza uma busca com um termo de 1 a 200 caracteres na Biblioteca, THE App SHALL retornar os Documentos do Usuário autenticado cujo nome ou cujas Páginas contenham o termo (correspondência por substring, insensível a maiúsculas/minúsculas).
4. IF o OCR falha ou excede o tempo limite em uma Página, THEN THE App SHALL registrar o erro internamente, manter a Página disponível sem texto extraído e exibir uma notificação de erro ao Usuário.
5. WHEN o Usuário solicita OCR em uma Página que já possui texto extraído, THE App SHALL reprocessar e substituir o texto anterior pelo novo resultado.

---

### Requisito 16 — Segurança e privacidade de dados

**User Story:** Como Usuário, quero ter certeza de que minhas imagens nunca são enviadas para terceiros, para que minha privacidade e a confidencialidade dos documentos sejam preservadas.

#### Critérios de Aceitação

1. THE App SHALL executar toda transformação de imagem (detecção de borda, correção de perspectiva, filtros, OCR) exclusivamente no navegador do cliente, sem transmitir pixels para nenhum servidor que não seja o Supabase Storage do projeto do Usuário.
2. THE App SHALL transmitir arquivos de imagem exclusivamente para o Supabase Storage do projeto do Usuário, via HTTPS com TLS 1.2 ou superior.
3. THE App SHALL utilizar tokens JWT emitidos pelo Supabase Auth para autorizar cada operação de leitura e escrita no Storage e no Postgres.
4. IF uma operação de upload ou leitura é tentada sem token JWT válido, THEN THE App SHALL receber um erro de autorização do Supabase, exibir uma mensagem de erro ao Usuário e SHALL redirecionar para a tela de autenticação.
