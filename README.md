# Hear My PDF

PRD — PDF Voice Reader (leitor de PDFs em voz alta com ElevenLabs)

Autor: [preencher] Data: 12/08/2026 Status: rascunho Versão: 1.0

1. Objetivo

Problema: Muitas pessoas precisam "consumir" PDFs (artigos, relatórios, e-books, apostilas) em situações onde ler na tela não é prático ou acessível — durante deslocamentos, tarefas domésticas, fadiga visual, ou por necessidade de acessibilidade (baixa visão, dislexia). Leitores de tela nativos do sistema operacional costumam ter vozes robóticas e pouca naturalidade.

Por que agora: A API da ElevenLabs oferece vozes sintéticas de altíssima naturalidade a custo acessível, permitindo criar uma experiência de narração muito superior à de soluções nativas (TTS do navegador/SO), com baixo esforço de engenharia.

Resultado esperado: Permitir que um usuário faça upload de um PDF e ouça o conteúdo narrado com voz natural diretamente no navegador, com controles de reprodução (play/pause, velocidade, navegação por página/parágrafo), sem precisar de instalação de app.

Prioridade de implantação:

Upload de PDF + extração de texto + narração via ElevenLabs (fluxo essencial)

Controles de reprodução (play/pause/seek, velocidade)

Seleção de voz

Download do áudio gerado (MP3)

Histórico de documentos processados (conta de usuário)

2. Escopo

Está dentro do escopo:

Upload de arquivo PDF (texto selecionável, não digitalizado/escaneado)

Extração de texto do PDF no client ou backend

Envio do texto para a API da ElevenLabs (Text-to-Speech) e reprodução do áudio resultante

Player de áudio com play/pause, avançar/retroceder, barra de progresso

Seleção de voz dentre as vozes disponíveis na conta ElevenLabs configurada

Ajuste de velocidade de reprodução

Interface web responsiva (desktop e mobile web)

Está fora do escopo (nesta versão):

OCR de PDFs escaneados (imagem sem texto extraível)

Aplicativo mobile nativo (iOS/Android)

Edição/clonagem de vozes customizadas (voice cloning)

Tradução automática do conteúdo para outro idioma

Colaboração multiusuário (compartilhar narração entre contas)

Suporte offline

3. Features

Feature 1: Upload de PDF

Descrição: O usuário arrasta ou seleciona um arquivo PDF do dispositivo para envio à aplicação.

Objetivo: Permitir que o usuário forneça o conteúdo que deseja ouvir.

Caso(s) de teste:

Dado que o usuário está na tela inicial, quando seleciona um PDF válido de até [X]MB, então o sistema aceita o upload e inicia o processamento.

Dado que o usuário tenta enviar um arquivo que não é PDF, quando confirma o upload, então o sistema exibe mensagem de erro clara e impede o envio.

Dado que o usuário envia um PDF acima do limite de tamanho definido, quando confirma o upload, então o sistema bloqueia e informa o limite máximo.

Feature 2: Extração de texto do PDF

Descrição: O sistema lê o PDF enviado e extrai o texto corrido, preservando a ordem de leitura (por página/parágrafo).

Objetivo: Transformar o conteúdo visual do PDF em texto que possa ser enviado à API de narração.

Caso(s) de teste:

Dado um PDF com texto selecionável, quando o processamento é concluído, então o texto extraído corresponde ao conteúdo visível no documento, na ordem correta.

Dado um PDF sem texto extraível (ex: escaneado), quando o processamento é tentado, então o sistema informa ao usuário que o documento não contém texto legível (fora do escopo de OCR nesta versão).

Feature 3: Narração via ElevenLabs (Text-to-Speech)

Descrição: O texto extraído é enviado à API da ElevenLabs, que retorna o áudio narrado correspondente.

Objetivo: Entregar a funcionalidade central do produto: ouvir o PDF com voz natural.

Caso(s) de teste:

Dado um texto extraído com sucesso, quando o usuário solicita a narração, então o áudio é gerado e reproduzido em até [Y] segundos para um documento de referência (ex: 5 páginas).

Dado que a API da ElevenLabs retorna erro (limite de uso, indisponibilidade), quando a narração é solicitada, então o sistema exibe mensagem de erro amigável e não trava a interface.

Dado um documento longo (acima do limite de caracteres por requisição da API), quando a narração é solicitada, então o sistema divide o texto em blocos e concatena o áudio de forma transparente para o usuário.

Feature 4: Player de áudio

Descrição: Controles de reprodução do áudio gerado: play, pause, avançar, retroceder, barra de progresso e indicação da posição no texto/PDF.

Objetivo: Dar ao usuário controle sobre a experiência de escuta.

Caso(s) de teste:

Dado que o áudio está tocando, quando o usuário clica em pausar, então a reprodução para e pode ser retomada do mesmo ponto.

Dado que o usuário arrasta a barra de progresso, quando solta em um novo ponto, então a reprodução salta para o ponto correspondente do áudio.

Feature 5: Seleção de voz

Descrição: O usuário pode escolher, dentre as vozes disponíveis na conta ElevenLabs configurada, qual será usada na narração.

Objetivo: Permitir personalização da experiência de escuta.

Caso(s) de teste:

Dado que o usuário abre o seletor de vozes, quando escolhe uma voz diferente da padrão, então as próximas narrações usam a voz selecionada.

Feature 6: Ajuste de velocidade

Descrição: Controle para acelerar ou desacelerar a reprodução do áudio (ex: 0.75x, 1x, 1.25x, 1.5x, 2x).

Objetivo: Adaptar o ritmo de escuta à preferência do usuário.

Caso(s) de teste:

Dado que o áudio está em reprodução, quando o usuário seleciona 1.5x, então a velocidade de reprodução muda imediatamente sem alterar o tom da voz de forma perceptível.

Feature 7: Download do áudio (MP3)

Descrição: Permite baixar o áudio gerado como arquivo MP3.

Objetivo: Permitir escuta offline posteriormente.

Caso(s) de teste:

Dado que a narração foi concluída, quando o usuário clica em "baixar áudio", então um arquivo MP3 válido é salvo no dispositivo do usuário.

4. Fluxo de UX & Notas de Design

Fluxo do usuário:

Usuário acessa o site.

Faz upload de um PDF (drag-and-drop ou seleção de arquivo).

Sistema extrai o texto e exibe uma prévia (ex: título do documento, número de páginas, tempo estimado de narração).

Usuário escolhe voz e velocidade (opcional — valores padrão pré-selecionados).

Usuário inicia a narração; player é exibido com controles.

Usuário pode acompanhar visualmente o trecho do texto sendo narrado (destaque sincronizado, desejável mas não crítico no MVP).

Usuário pode baixar o áudio ao final.

Integrações: Nenhuma integração externa além da API da ElevenLabs nesta versão. Autenticação de usuário (se aplicável) e armazenamento de histórico ficam como evolução futura.

Notas gerais de design: Interface simples e objetiva, com foco em acessibilidade (contraste adequado, navegação por teclado, compatibilidade com leitores de tela para as partes de interface que não sejam o próprio player). Feedback visual claro durante o processamento (loading states), já que a geração de áudio não é instantânea.

5. Requerimentos Sistêmicos

Plataformas suportadas: Web responsivo — navegadores modernos desktop e mobile (Chrome, Safari, Firefox, Edge, últimas 2 versões principais).

Requisitos técnicos mínimos: Conexão à internet estável (necessária para chamadas à API da ElevenLabs); não há requisito de instalação local.

Stack (contexto, não prescritivo): Frontend e/ou backend em TypeScript, conforme indicado pelo usuário — a escolha específica de framework cabe à engenharia.

6. Premissas, Restrições e Dependências

Premissas:

O usuário possui os PDFs com texto extraível (não escaneado) para a maioria dos casos de uso.

O usuário tem conexão à internet durante todo o uso da aplicação.

A conta ElevenLabs utilizada possui cota/créditos suficientes para o volume esperado de uso.

Restrições:

Uso da API da ElevenLabs está sujeito aos limites de caracteres por requisição e cotas de uso do plano contratado.

Tamanho máximo de PDF aceito será definido por engenharia com base em custo/performance (ex: limite de páginas ou MB).

Não há suporte a OCR nesta versão — apenas texto nativo do PDF.

Dependências:

Chave de API da ElevenLabs válida e configurada de forma segura (nunca exposta no client).

Biblioteca de extração de texto de PDF (ex: pdf.js ou equivalente) compatível com TypeScript.

7. Critérios de Release

Área Critério Classificação Funcionalidade Upload de PDF, extração de texto e narração via ElevenLabs funcionando de ponta a ponta Crítico Funcionalidade Player com play/pause e barra de progresso Crítico Funcionalidade Seleção de voz e ajuste de velocidade Importante Funcionalidade Download do áudio em MP3 Desejável Usabilidade Feedback visual claro durante upload/extração/geração de áudio (loading states) Crítico Usabilidade Interface responsiva em mobile web Importante Confiabilidade Tratamento de erros da API ElevenLabs (limite de cota, indisponibilidade) sem travar a interface Crítico Confiabilidade Tratamento de PDFs inválidos ou sem texto extraível Importante Desempenho Tempo de início da narração compatível com a expectativa do usuário (ex: feedback em poucos segundos, mesmo que o áudio completo leve mais tempo) Importante Portabilidade & Manutenção Chave de API gerenciada via variável de ambiente/backend, nunca exposta no client Crítico

8. Histórico de Revisão

Data Versão Autor Alterações 12/08/2026 1.0 — Versão inicial do PRD

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://talky-doc.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/715050ff-182b-41b4-a0f5-e0972d02f244).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
