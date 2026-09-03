# Implementation Plan: DocScan

## Overview

Implementação incremental do DocScan PWA. A base já existente (CaptureFlow, image.ts, docs.ts, export.ts, rotas, Supabase client) é reutilizada integralmente; este plano cobre apenas o que ainda precisa ser construído ou conectado: fila offline (IndexedDB), exportação ZIP de imagens, OCR com Tesseract.js, Service Worker / PWA install prompt, busca full-text e integração de todos os módulos nas telas existentes.

Cada tarefa referencia os critérios de aceitação correspondentes e, onde aplicável, as propriedades de corretude do design.

---

## Tasks

- [ ] 1. Configurar ambiente de testes e utilitários compartilhados
  - Instalar e configurar Vitest + fast-check no projeto (`vitest.config.ts`, setup file)
  - Criar helper `src/lib/test-utils/canvas.ts` com factory `makeCanvas(w, h)` para testes de imagem
  - Criar helper `src/lib/test-utils/idb.ts` com mock de IndexedDB (usando `fake-indexeddb`) para testes de offline.ts
  - Verificar que `vitest --run` passa sem erros
  - _Requirements: base para todos os requisitos_

- [ ] 2. Validar e testar módulos de imagem existentes (image.ts)
  - [ ] 2.1 Escrever testes de exemplo para `detectQuad`, `applyFilter`, `canvasToJpeg`, `loadImageToCanvas`
    - `detectQuad` com canvas em branco → retorna fallback inset
    - `applyFilter("color")` retorna canvas com mesmas dimensões
    - `canvasToJpeg` retorna Blob com `type = "image/jpeg"`
    - `loadImageToCanvas` com blob JPEG válido → canvas com dimensões corretas
    - _Requirements: 2.1, 2.2, 4.1_

  - [ ]* 2.2 Escrever property test P1 — detectQuad vértices dentro dos limites
    - **Property 1: detectQuad retorna vértices dentro dos limites do canvas**
    - Gerador: `fc.nat({ max: 2000 })` para w e h; canvas sintético
    - Tag: `// Feature: doc-scan, Property 1`
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 2.3 Escrever property test P2 — Quad fallback com inset 6%
    - **Property 2: Quad de fallback posiciona vértices com inset de 6%**
    - Gerador: canvas mínimo (< 25% área útil para forçar fallback)
    - Tag: `// Feature: doc-scan, Property 2`
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 2.4 Escrever property test P4 — rotateCanvas 360° preserva dimensões
    - **Property 4: Rotação de 360° preserva dimensões originais do canvas**
    - Gerador: `fc.nat({ max: 2000 })` para w e h
    - Tag: `// Feature: doc-scan, Property 4`
    - **Validates: Requirements 7.3**

- [ ] 3. Implementar e testar funções de validação puras
  - [ ] 3.1 Implementar `isValidQuad(quad: Quad): boolean` em `src/lib/scan/image.ts`
    - Retorna `false` se auto-intersectante ou área ≤ 0
    - Exportar função para uso no CaptureFlow e nos testes
    - _Requirements: 3.3, 3.4_

  - [ ]* 3.2 Escrever property test P3 — validação de Quad não-auto-intersectante
    - **Property 3: Quad válido é não-auto-intersectante e tem área positiva**
    - Gerador: `fc.tuple(fc.record({ x: fc.float(), y: fc.float() }), ...)` para 4 pontos
    - Tag: `// Feature: doc-scan, Property 3`
    - **Validates: Requirements 3.3, 3.4**

  - [ ] 3.3 Implementar `isValidDocName(name: string): boolean` em `src/lib/scan/docs.ts`
    - Retorna `true` se string tem entre 1 e 100 caracteres não-espaço
    - _Requirements: 6.5_

  - [ ]* 3.4 Escrever property test P5 — validação de nome de documento
    - **Property 5: Validação de nome de documento rejeita strings inválidas**
    - Gerador: `fc.string()` com variação de comprimento (0 a 110 chars)
    - Tag: `// Feature: doc-scan, Property 5`
    - **Validates: Requirements 6.5**

  - [ ]* 3.5 Escrever property test P6 — safeFileName produz nome válido
    - **Property 6: safeFileName produz nome de arquivo válido para qualquer string de entrada**
    - Gerador: `fc.string()` com caracteres arbitrários incluindo acentos e especiais
    - Tag: `// Feature: doc-scan, Property 6`
    - **Validates: Requirements 9.1, 9.2**

  - [ ]* 3.6 Escrever property test P7 — reordenação de páginas
    - **Property 7: Reordenação de páginas produz a sequência correta de posições**
    - Gerador: `fc.array(fc.record({ id: fc.uuid(), position: fc.nat() }))` + `fc.integer` para from/to
    - Extrair lógica de reordenação como função pura testável se ainda inline no componente
    - Tag: `// Feature: doc-scan, Property 7`
    - **Validates: Requirements 7.1**

- [ ] 4. Implementar `offline.ts` — fila de sincronização IndexedDB
  - [ ] 4.1 Criar `src/lib/scan/offline.ts` com abertura do banco IndexedDB `docscan-offline` v1
    - Object store `sync_queue` com keyPath `id`, índices em `status`, `documentId`, `capturedAt`
    - Implementar `enqueue`, `dequeue`, `markSynced`, `markFailed`, `discardItem`, `getPendingCount`
    - `enqueue` gera `id` via `crypto.randomUUID()`, define `retryCount = 0`, `status = "pending"`, `capturedAt = Date.now()`
    - `dequeue` retorna apenas itens com `status !== "permanently_failed"`
    - `markFailed`: se `retryCount + 1 < 3` → `status = "retrying"`; se `>= 3` → `status = "permanently_failed"`
    - _Requirements: 13.2, 13.4, 13.5, 13.6_

  - [ ]* 4.2 Escrever property test P8 — enqueue registra campos obrigatórios
    - **Property 8: Fila offline registra todos os campos obrigatórios ao fazer enqueue**
    - Gerador: `fc.record` com campos de entrada de `enqueue`
    - Tag: `// Feature: doc-scan, Property 8`
    - **Validates: Requirements 13.2**

  - [ ]* 4.3 Escrever property test P9 — markSynced remove item da fila
    - **Property 9: markSynced remove o item da fila**
    - Gerador: `fc.uuid()` para id; inserir item e verificar remoção
    - Tag: `// Feature: doc-scan, Property 9`
    - **Validates: Requirements 13.4**

  - [ ]* 4.4 Escrever property test P10 — markFailed incrementa retryCount e aplica threshold
    - **Property 10: markFailed incrementa retryCount e aplica threshold**
    - Gerador: `fc.integer({ min: 0, max: 5 })` para retryCount inicial
    - Tag: `// Feature: doc-scan, Property 10`
    - **Validates: Requirements 13.5, 13.6**

  - [ ]* 4.5 Escrever testes de exemplo para offline.ts
    - `enqueue` persiste item no IndexedDB com campos corretos
    - `dequeue` não retorna itens `permanently_failed`
    - `discardItem` remove item independente do status
    - _Requirements: 13.2, 13.4, 13.5, 13.6_

- [ ] 5. Checkpoint — Testes de lógica pura e fila offline
  - Garantir que todos os testes de imagem, validação e offline passam
  - Garantir que `vitest --run` passa sem erros antes de prosseguir

- [ ] 6. Implementar SyncManager — sincronização automática ao reconectar
  - [ ] 6.1 Criar `src/lib/scan/sync-manager.ts`
    - Ouvir eventos `window.addEventListener("online", ...)` e iniciar sync em até 5s após reconexão
    - `startSync()`: chamar `dequeue()`, para cada item fazer upload via `addPages` de `docs.ts`; em sucesso chamar `markSynced`; em falha chamar `markFailed`
    - Estratégia de retry com delays: 0ms → 30s → 2min
    - Emitir eventos customizados (`sync:success`, `sync:failure`, `sync:permanently-failed`) para a UI
    - _Requirements: 13.3, 13.4, 13.5, 13.6_

  - [ ] 6.2 Criar hook `src/hooks/use-sync-status.ts`
    - Expõe `pendingCount`, `isSyncing`, `hasPermanentlyFailed`
    - Subscreve em `getPendingCount()` e nos eventos do SyncManager
    - _Requirements: 13.7_

- [ ] 7. Integrar offline sync no fluxo de captura (`/scan` e `docs.ts`)
  - [ ] 7.1 Modificar o callback `onPage` na rota `/scan` para detectar estado offline
    - Se `navigator.onLine === false`: chamar `enqueue` com blob e metadados em vez de `addPages`
    - Se online: fluxo normal de upload via `addPages`
    - _Requirements: 13.1, 13.2_

  - [ ] 7.2 Exibir badge de "pendente de sincronização" na tela `/doc/$id`
    - Usar `use-sync-status` para exibir contagem de pendentes e notificações de falha persistente
    - Botão "Descartar" para itens `permanently_failed` via `discardItem`
    - _Requirements: 13.2, 13.6, 13.7_

- [ ] 8. Implementar exportação ZIP de imagens (`export.ts`)
  - [ ] 8.1 Adicionar `buildImageZip(name: string, pages: ScanPage[]): Promise<Blob>` em `src/lib/scan/export.ts`
    - Usar biblioteca `fflate` (ou `jszip`) para gerar ZIP no cliente
    - Para cada página: baixar blob via signed URL, nomear como `{safeFileName(name)}-pagina-{n}.jpg`
    - ZIP nomeado `{safeFileName(name)}-imagens.zip`
    - Se conversão de uma página falhar: ignorar essa página no ZIP, coletar erros para relato
    - _Requirements: 9.1, 9.3_

  - [ ] 8.2 Adicionar `downloadPageJpeg(page: ScanPage, docName: string, pageIndex: number): Promise<void>` em `src/lib/scan/export.ts`
    - Baixar blob JPEG via signed URL e disparar download como `{safeFileName(docName)}-pagina-{pageIndex}.jpg`
    - _Requirements: 9.2_

  - [ ]* 8.3 Escrever testes de exemplo para exportação de imagens
    - `buildImageZip` gera Blob com `type = "application/zip"` e tamanho > 0
    - `downloadPageJpeg` invoca `downloadBlob` com nome correto
    - `shareOrDownload` com Web Share API indisponível → invoca `downloadBlob`
    - _Requirements: 9.1, 9.2_

- [ ] 9. Conectar exportações na UI (`/doc/$id`)
  - [ ] 9.1 Adicionar botão "Exportar PDF" na tela de detalhes do documento
    - Indicador de loading durante geração; desabilitar exportações simultâneas
    - Em sucesso: chamar `shareOrDownload`; em falha: exibir toast de erro
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 9.2 Escrever property test P13 — buildPdf gera PDF válido
    - **Property 13: buildPdf gera um blob PDF válido para qualquer lista não-vazia de páginas**
    - Gerador: array não-vazio de `ScanPage` com JPEG mock
    - Tag: `// Feature: doc-scan, Property 13`
    - **Validates: Requirements 8.1**

  - [ ] 9.3 Adicionar botão "Exportar Imagens (ZIP)" e opção "Baixar página" por página
    - Desabilitar exportação ZIP enquanto páginas ainda carregam
    - Em falha parcial: exibir toast identificando a página com falha
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 10. Checkpoint — Testes de exportação e integração de UI
  - Garantir que todos os testes de `export.ts` passam
  - Garantir que `vitest --run` passa sem erros antes de prosseguir

- [ ] 11. Implementar `ocr.ts` — reconhecimento óptico de caracteres
  - [ ] 11.1 Criar `src/lib/scan/ocr.ts` com worker Tesseract.js v5
    - Carregar worker sob demanda (`createWorker`) com idioma `por` (português)
    - `runOcr(page: ScanPage, signal?: AbortSignal): Promise<string>`
    - Timeout de 60s: lançar `OcrTimeoutError` se excedido
    - Suportar `AbortSignal`: rejeitar imediatamente se já abortado
    - Persistir resultado via `updatePageOcrText(pageId, text)` no Postgres (campo `ocr_text`)
    - _Requirements: 15.1, 15.2, 15.4, 15.5_

  - [ ] 11.2 Criar migration Supabase para adicionar coluna `ocr_text` e índice FTS
    - `ALTER TABLE public.document_pages ADD COLUMN IF NOT EXISTS ocr_text TEXT`
    - `CREATE INDEX IF NOT EXISTS document_pages_ocr_fts ON public.document_pages USING gin(to_tsvector('portuguese', coalesce(ocr_text, '')))`
    - _Requirements: 15.2, 15.3_

  - [ ] 11.3 Implementar `updatePageOcrText(pageId: string, text: string): Promise<void>` em `src/lib/scan/docs.ts`
    - `UPDATE document_pages SET ocr_text = $text WHERE id = $pageId`
    - _Requirements: 15.2, 15.5_

  - [ ]* 11.4 Escrever property test P12 — OCR é idempotente
    - **Property 12: OCR é idempotente — reprocessamento substitui texto anterior**
    - Gerador: `fc.string()` para texto OCR; mock de `updatePageOcrText`
    - Verificar que segunda chamada substitui (não concatena) o resultado anterior
    - Tag: `// Feature: doc-scan, Property 12`
    - **Validates: Requirements 15.2, 15.5**

  - [ ]* 11.5 Escrever testes de exemplo para ocr.ts
    - `runOcr` com `AbortSignal` já abortado → rejeita imediatamente
    - `runOcr` excedendo 60s → lança `OcrTimeoutError`
    - _Requirements: 15.1, 15.4_

- [ ] 12. Integrar OCR e busca full-text na UI
  - [ ] 12.1 Adicionar botão "Extrair texto (OCR)" por página na tela `/doc/$id`
    - Mostrar estado de loading durante processamento; exibir toast de erro em falha
    - _Requirements: 15.1, 15.4_

  - [ ] 12.2 Estender `listDocuments` em `src/lib/scan/docs.ts` para busca por conteúdo OCR
    - Quando `search` tem 1–200 caracteres: incluir `document_pages.ocr_text` no filtro FTS além do `name`
    - _Requirements: 15.3_

  - [ ]* 12.3 Escrever property test P11 — listDocuments filtra corretamente
    - **Property 11: Busca retorna apenas documentos cujo nome contém o termo (case-insensitive)**
    - Gerador: `fc.array(fc.record({ id: fc.uuid(), name: fc.string() }))` + `fc.string()` para search
    - Testar a lógica de filtro client-side extraída de `listDocuments`
    - Tag: `// Feature: doc-scan, Property 11`
    - **Validates: Requirements 10.3**

- [ ] 13. Implementar Service Worker e PWA
  - [ ] 13.1 Criar `src/service-worker.ts` com Workbox (ou VitePWA plugin)
    - Estratégia cache-first para assets estáticos gerados pelo build
    - Capturar evento `install` e `activate` para cache de shell assets
    - Lógica de update: emitir mensagem para o cliente quando nova versão estiver pronta
    - _Requirements: 14.2, 14.6_

  - [ ] 13.2 Configurar VitePWA plugin em `vite.config.ts` (ou equivalente TanStack Start)
    - Referenciar `manifest.webmanifest` existente ou criar se ausente
    - Validar que `manifest.webmanifest` contém `name`, `short_name`, `icons` (192×192, 512×512), `start_url`, `display: "standalone"`, `background_color`
    - _Requirements: 14.1, 14.2_

  - [ ] 13.3 Criar hook `src/hooks/use-pwa-install.ts`
    - Capturar e armazenar evento `beforeinstallprompt`
    - Expor `canInstall: boolean`, `install(): Promise<void>`, `dismiss(): void`
    - _Requirements: 14.3, 14.4, 14.5_

  - [ ] 13.4 Criar hook `src/hooks/use-sw-update.ts`
    - Detectar novo Service Worker em estado `waiting`
    - Expor `updateAvailable: boolean`, `applyUpdate(): void`
    - `applyUpdate` envia mensagem `SKIP_WAITING` e recarrega a página
    - _Requirements: 14.6_

  - [ ]* 13.5 Escrever testes de smoke para PWA
    - `manifest.webmanifest` contém todos os campos obrigatórios
    - Service Worker registrado após carregamento da página (mock de `navigator.serviceWorker`)
    - _Requirements: 14.1, 14.2_

- [ ] 14. Integrar prompts de instalação e atualização de PWA na UI
  - [ ] 14.1 Adicionar banner de instalação na rota `/docs` (Biblioteca)
    - Usar `use-pwa-install`: exibir botão visível sem scroll na primeira sessão; ocultar após ação
    - _Requirements: 14.3, 14.4, 14.5_

  - [ ] 14.2 Adicionar banner de atualização no layout raiz
    - Usar `use-sw-update`: exibir notificação em até 5s após detecção de nova versão
    - Botão "Atualizar" chama `applyUpdate()`
    - _Requirements: 14.6_

- [ ] 15. Checkpoint — Testes de OCR, Service Worker e PWA
  - Garantir que todos os testes de `ocr.ts`, smoke de PWA e property tests P11–P12 passam
  - Garantir que `vitest --run` passa sem erros antes de prosseguir

- [ ] 16. Testes de integração — Supabase e fluxos completos
  - [ ]* 16.1 Escrever testes de integração para autenticação
    - Login com e-mail/senha válido → sessão ativa e redirecionamento para `/docs`
    - Login com credenciais inválidas → mensagem de erro, permanece em `/auth`
    - Sessão expirada → detectada na próxima operação, redireciona para `/auth`
    - _Requirements: 11.3, 11.4, 11.6, 11.7_

  - [ ]* 16.2 Escrever testes de integração para RLS e Storage
    - Usuário A não acessa documentos do usuário B (RLS em `documents` e `document_pages`)
    - Upload de blob → signed URL com TTL 3600s → download bem-sucedido
    - Operação sem JWT válido → erro de autorização + redirecionamento
    - _Requirements: 12.5, 16.3, 16.4_

  - [ ]* 16.3 Escrever testes de integração para sync offline
    - Página enfileirada offline → upload ao reconectar → removida da fila
    - `markFailed` 3× → item `permanently_failed` → não aparece em `dequeue()`
    - _Requirements: 13.3, 13.4, 13.6_

- [ ] 17. Wiring final — garantir coesão entre módulos
  - [ ] 17.1 Registrar `SyncManager` no ponto de entrada da aplicação (`src/main.tsx` ou root layout)
    - Inicializar `SyncManager` uma única vez ao montar o app
    - Expor `use-sync-status` globalmente via contexto React ou singleton
    - _Requirements: 13.3_

  - [ ] 17.2 Garantir que auth guard cobre todas as rotas protegidas (`/docs`, `/scan`, `/doc/$id`, `/`)
    - Verificar `src/hooks/use-auth-guard.ts` e aplicar nas rotas que ainda não usam
    - _Requirements: 11.5_

  - [ ] 17.3 Verificar tratamento de erros de signed URL em `listDocuments`
    - Fallback para `null` thumbnail sem bloquear carregamento dos demais documentos
    - Exibir ícone placeholder no componente de card de documento
    - _Requirements: 10.10_

- [ ] 18. Checkpoint final — Suite completa de testes
  - Garantir que `vitest --run` passa com 0 falhas
  - Verificar cobertura das 13 propriedades de corretude e dos 16 requisitos
  - Garantir que nenhum código temporário ou órfão permanece

---

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia critérios de aceitação específicos para rastreabilidade
- Os checkpoints (tarefas 5, 10, 15, 18) garantem validação incremental antes de avançar
- Property tests usam a tag `// Feature: doc-scan, Property N` para rastreabilidade
- `fast-check` com mínimo de 100 iterações por propriedade conforme design
- O código existente (CaptureFlow, image.ts, docs.ts, export.ts) não deve ser reescrito — apenas estendido
- A migration da coluna `ocr_text` (tarefa 11.2) deve ser aplicada via `supabase migration new` ou MCP antes de executar os testes de integração de OCR

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.3", "4.1", "8.1", "8.2", "11.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.4", "3.5", "3.6", "4.2", "4.3", "4.4", "4.5", "8.3", "11.1", "11.3"] },
    { "id": 3, "tasks": ["6.1", "9.2", "11.4", "11.5"] },
    { "id": 4, "tasks": ["6.2", "9.1", "9.3", "12.1", "12.2", "13.1", "13.2", "13.3", "13.4"] },
    { "id": 5, "tasks": ["7.1", "7.2", "12.3", "13.5"] },
    { "id": 6, "tasks": ["14.1", "14.2", "16.1", "16.2", "16.3"] },
    { "id": 7, "tasks": ["17.1", "17.2", "17.3"] }
  ]
}
```
