# Talky Doc — Product / Engineering Audit

**Data:** 08/09/2026  
**Branch auditada:** `main`  
**Baseline observada:** `e98f8ce`  
**Escopo:** auditoria técnica contra o PRD atual e o código presente no repositório.

> Este documento registra o estado observado no código. Build verde não é tratado como prova de aceitação funcional.

## 1. Resumo executivo

| Feature | Estado atual | Evidência principal | Risco | Critério de aceite | Prioridade | Próxima ação |
|---|---|---|---|---|---|---|
| Upload de PDF | Implementado | `src/routes/index.tsx`, `src/lib/pdf-text.ts` | Médio | PDF válido entra no fluxo; inválido/limite bloqueado | P0 | Teste E2E |
| Extração de texto | Implementado | `src/lib/pdf-text.ts` | Médio | Texto por página, ordem preservada e progresso | P0 | Testar PDFs reais e PDFs sem texto |
| Chunking para TTS | Implementado | `src/lib/pdf-text.ts` | Médio | Documento longo dividido sem perda de conteúdo | P0 | Teste com PDF longo |
| TTS | Implementado, mas **há divergência com o PRD** | `src/lib/tts-client.ts`, `src/routes/api/tts.ts` | **Crítico** | Narração deve usar a integração definida pelo produto e funcionar ponta a ponta | P0 | Decidir e alinhar fornecedor/API |
| Player | Parcialmente implementado / precisa validação funcional | rotas/componentes do leitor | Alto | Play/pause/seek/posição e continuidade | P0 | Teste manual E2E |
| Seleção de voz | Implementado no cliente/API | `tts-client.ts`, `api/tts.ts` | Médio | Voz escolhida afeta a próxima narração | P1 | Testar todas as vozes suportadas |
| Velocidade | Configuração disponível | `tts-client.ts` | Médio | 0.75x–2x altera playback imediatamente | P1 | Confirmar no player |
| Download MP3 | Implementado via Blob/TTS | `tts-client.ts` + fluxo do player | Médio | MP3 válido baixado | P1 | Teste em Chrome/Safari/mobile |
| OCR | Implementado, embora fora do PRD original | `src/lib/scan/ocr.ts`, `docs.ts`, `CaptureFlow.tsx` | Alto | PDF/imagem escaneada gera texto pesquisável | P1 | Atualizar PRD e testar por idioma |
| Exportação PDF | Implementado | `src/lib/scan/export.ts` | Alto | PDF abre, mantém ordem e camada OCR pesquisável | P0 | Validar com Acrobat/Chrome/Edge |
| Reordenação/rotação | Implementado no DocScan | `src/routes/doc/$id.tsx` | Médio | Ordem/rotação persistem corretamente | P1 | Teste com múltiplas páginas |
| Autenticação | Implementada | `src/routes/auth.tsx`, `useAuthGuard` | Alto | Usuário não acessa documentos alheios | P0 | Teste de isolamento/RLS |
| Tratamento SSR/erros | Implementado | `src/server.ts`, `error-*` | Médio | Erro 500 não quebra UX | P1 | Testes de falha |
| MCP/agentes | Não implementado | `roadmap.md` | Baixo para MVP | Integrações de agente documentadas e testadas | P2 | Só iniciar após estabilização do MVP |

## 2. Bloqueadores de release

### B1 — TTS não corresponde ao PRD

O PRD define **ElevenLabs** como fornecedor de Text-to-Speech. O código atual, porém, chama `/api/tts`, que encaminha a requisição para `https://ai.gateway.lovable.dev/v1/audio/speech` usando `openai/gpt-4o-mini-tts` e `LOVABLE_API_KEY`.

Isso é uma decisão arquitetural diferente da especificação do produto. Não deve ser tratado como detalhe de implementação: fornecedor, credenciais, limites, custo, vozes e comportamento de erro mudam.

**Decisão necessária:**
1. manter ElevenLabs e implementar a integração conforme o PRD; ou
2. aprovar formalmente a mudança para o gateway/voz atual e atualizar o PRD.

### B2 — `main` não contém ainda o commit `6a8d0d8`

O commit `6a8d0d8` existe no repositório e é filho direto de `e98f8ce`, contendo as correções de CDN do OCR e `renderingMode: 3` no PDF. Entretanto, a auditoria da branch `main` mostra `e98f8ce` como baseline e o commit `6a8d0d8` está **1 commit à frente**.

Portanto, antes de considerar as correções auditadas como presentes em produção, é necessário sincronizar `main` com `6a8d0d8` e verificar o build novamente.

### B3 — Exportação PDF requer teste funcional

A implementação cria o PDF a partir das imagens e adiciona uma camada de texto OCR invisível quando `ocrText` existe. O código usa `renderingMode: 3`, mas a aceitação não pode ser inferida apenas pelo código.

**Teste obrigatório:** abrir o PDF exportado em pelo menos Chrome/Edge e Adobe Acrobat Reader, pesquisar uma palavra OCR e verificar seleção/cópia.

## 3. Critérios P0 para o MVP

O MVP só deve ser considerado release-ready quando estes testes passarem:

- [ ] Upload de PDF válido.
- [ ] Rejeição clara de arquivo inválido.
- [ ] Limite de tamanho respeitado.
- [ ] Extração correta por página.
- [ ] PDF sem texto gera estado de erro compreensível ou entra no fluxo OCR aprovado.
- [ ] Documento longo é dividido em chunks sem perda de conteúdo.
- [ ] TTS funciona ponta a ponta com o fornecedor oficialmente aprovado.
- [ ] Erro 429/5xx do TTS não trava a interface.
- [ ] Play/pause mantém posição.
- [ ] Seek funciona.
- [ ] Mudança de velocidade funciona.
- [ ] Download MP3 produz arquivo reproduzível.
- [ ] Exportação PDF produz arquivo válido.
- [ ] Ordem das páginas é preservada no PDF.
- [ ] OCR, quando disponível, torna o PDF pesquisável.
- [ ] Caracteres portugueses não são destruídos indevidamente.
- [ ] Autenticação impede acesso cruzado a documentos.
- [ ] Fluxo funciona em desktop e mobile web.

## 4. Observações técnicas

### Extração

`pdf-text.ts` limita PDFs a 20 MB, extrai página a página e possui `chunkForTTS()` com chunks padrão de 1.800 caracteres. Também calcula uma estimativa de duração baseada em caracteres/palavras.

### TTS

O cliente implementa concorrência de 3 chunks e retry para 429/500/502/503. O endpoint server-side valida texto, limita cada bloco a 4.000 caracteres e não expõe a chave no browser.

### OCR

O OCR roda no browser com Tesseract.js, reutiliza um worker e carrega `por` + `eng` via jsDelivr. O OCR foi introduzido depois do PRD 1.0, portanto a especificação do produto está desatualizada.

### Exportação

`buildPdf()` incorpora as imagens na ordem atual e tenta adicionar texto OCR invisível. O nome do arquivo é sanitizado antes do download.

## 5. Governança de mudanças

Fluxo recomendado para qualquer mudança gerada pelo Lovable:

`Lovable → pull/diff → auditoria técnica → build/lint → teste funcional → commit → main`

Nenhuma alteração deve ser aceita apenas porque o build passa.

Para mudanças que afetam P0, exigir evidência de teste antes de declarar a feature concluída.

## 6. Roadmap imediato

**P0 — Estabilização**
1. Sincronizar `main` com `6a8d0d8`.
2. Resolver formalmente a divergência ElevenLabs vs gateway atual.
3. Executar testes E2E do fluxo Upload → Extração → TTS → Player → Download.
4. Validar exportação PDF/OCR em leitores reais.
5. Testar autenticação e isolamento de documentos.

**P1 — Produto**
1. Atualizar PRD para refletir OCR, autenticação e arquitetura real.
2. Completar testes mobile/accessibility.
3. Melhorar estados de progresso e recuperação de erros.

**P2 — Agentes/MCP**
1. Definir casos de uso concretos.
2. Definir permissões e limites de segurança.
3. Implementar somente depois de o pipeline principal estar estável.

## 7. Estado da auditoria

**Conclusão:** o projeto tem uma base funcional significativa, mas **não deve ser declarado release-ready ainda**. O principal bloqueador de produto é a divergência entre o PRD (ElevenLabs) e a implementação atual de TTS. O principal bloqueador operacional é garantir que `main` contenha as correções de `6a8d0d8` e validar o comportamento funcional do pipeline completo.
