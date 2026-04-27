# Atlas — Plataforma de Decisão de Crédito e Cobrança B2B

> Documentação interna · Engenharia de Plataforma · Risco & Cobrança
> Última revisão: 2026-04-21 — owners: `@plat-risco`, `@plat-cobrança`, `@ai-infra`
> Repositório raiz: `bitbucket.internal/atlas` · Slack: `#atlas-eng` · PagerDuty: `atlas-prod`

---

## 1. Contexto

Atlas é o sistema de decisão usado pelo time de Risco e pelo time de Cobrança para originação, monitoramento e ação sobre a carteira PJ. Atende clientes com faturamento entre R$ 20 mil e R$ 5 milhões/mês (categoria interna `SMB-PJ`), em três produtos: antecipação de recebíveis, conta com crédito rotativo e maquininha com split. A base atual ronda 38 mil CNPJs ativos, com pico de ~310 mil decisões/dia entre originação, reanálise e ações de cobrança.

Antes do Atlas, o pipeline era um conjunto de jobs Airflow disparando regras SQL em cima do data warehouse, somado a uma planilha mantida pelo time de Risco que definia régua de cobrança por faixa de atraso. O custo de oportunidade ficou claro em três pontos:

- **Reanálise era lenta.** Reavaliar um cliente após mudança de comportamento dependia de batch noturno. Inadimplente novo só era detectado no dia seguinte.
- **Régua de cobrança era estática.** Cliente com R$ 80k de fatura recebia o mesmo SMS que cliente com R$ 800. Recuperação travada em torno de 41% nos primeiros 30 dias de atraso.
- **Análise manual em casos cinzas.** Analistas de Risco gastavam ~22 minutos por caso ambíguo lendo extratos, contratos sociais e histórico de comunicação. Filas com 400+ casos eram normais em fim de mês.

Atlas resolve esses três problemas com uma combinação de modelos clássicos de risco (XGBoost, LightGBM), agentes orquestrados via LangGraph, RAG sobre políticas internas, decisões versionadas e um event bus que reage em tempo real a mudanças de estado do cliente.

**O que Atlas NÃO faz** (escopo explícito, definido no RFC-014):

- Não decide originação para tickets acima de R$ 500k. Esses sobem para o comitê manual.
- Não atua em recuperação judicial. A partir de 90 dias o caso vai para o parceiro de cobrança terceirizado (Recovery+) via API.
- Não toma decisão final sobre fraude. O Fraud Agent apenas pontua e bloqueia preventivamente; investigação é do time de Prevenção a Fraudes.

---

## 2. Arquitetura

### 2.1 Visão geral

```
                  ┌──────────────────────────────────────────┐
                  │          API Gateway (Kong)               │
                  └────────────┬─────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼────┐           ┌─────▼─────┐         ┌──────▼──────┐
   │ atlas-  │           │  atlas-   │         │   atlas-    │
   │ origin  │           │  decision │         │  cobrança   │
   │(FastAPI)│           │  (FastAPI)│         │  (FastAPI)  │
   └────┬────┘           └─────┬─────┘         └──────┬──────┘
        │                      │                      │
        │  ┌───────────────────┴───────────────────┐  │
        │  │       Orchestrator (LangGraph)         │  │
        │  │  - state graph por caso                │  │
        │  │  - persistência em Postgres            │  │
        │  └───┬────────────┬─────────────┬─────────┘  │
        │      │            │             │             │
        │  ┌───▼──┐    ┌────▼────┐   ┌────▼────┐       │
        │  │Credit│    │Collection│   │ Fraud   │  ...  │
        │  │Agent │    │ Agent    │   │ Agent   │       │
        │  └───┬──┘    └────┬─────┘   └────┬────┘       │
        │      │            │              │             │
        └──────┴────────────┴──────────────┴─────────────┘
                            │
        ┌───────────────────┼─────────────────────┐
        │                   │                     │
   ┌────▼────┐       ┌──────▼──────┐       ┌──────▼──────┐
   │  Kafka  │       │   Feature    │       │   Vector    │
   │ (events)│       │    Store     │       │     DB      │
   └─────────┘       │  (Feast +    │       │  (Qdrant)   │
                     │  Postgres)   │       └─────────────┘
                     └──────────────┘

  Data lake: S3 (parquet, particionado por dia) + Iceberg
  Warehouse: BigQuery (analítico) + Postgres (operacional)
  ML registry: MLflow self-hosted em EKS
  LLM gateway: serviço interno `llm-router` (ver §8)
```

### 2.2 Decisões arquiteturais

| Decisão | Justificativa | Trade-off aceito |
|---|---|---|
| FastAPI + Pydantic v2 | Time já dominava Python; tipos fortes batem bem com contratos de risco | Throughput menor que Go em endpoints quentes; resolvido com gunicorn+uvicorn workers e cache |
| LangGraph para orquestração | Graph state explícito permite replay e auditoria; checkpoints em Postgres facilitam debugging | Imaturidade de ferramentas (em 2024 quebramos 3x em upgrades menores); travamos versão e fizemos fork interno |
| Kafka self-managed (MSK) | Volume justificava controle fino de retenção e particionamento por CNPJ | Custo operacional do time; um SRE dedicado parcialmente |
| Qdrant em vez de Pinecone | Custo: ~3.2x mais barato em nosso volume; latência p95 comparável | Menos recursos prontos (filtros híbridos exigiram trabalho) |
| Postgres + Feast em vez de Tecton | Volume não justificava Tecton; reuso da infra existente | Online store com latência p99 de ~38ms; aceitável em decisões síncronas |
| Decisão síncrona até 800ms p95 | Originação precisa responder na hora; cobrança é assíncrona | Casos complexos caem em fila assíncrona com SLA de 5s |

### 2.3 Latência observada (produção, semana 16/2026)

```
endpoint                    p50      p95      p99      taxa de erro
POST /decisao/originacao    412ms    781ms    1.4s     0.18%
POST /decisao/reanalise     298ms    612ms    1.1s     0.09%
POST /cobrança/estrategia   180ms    340ms    520ms    0.04%
GET  /empresa/{cnpj}/score  44ms     88ms     180ms    0.01%

LLM calls (via gateway):
  haiku (sonnet downstream)   p50 380ms  p95 720ms
  sonnet (raciocínio)         p50 1.8s   p95 4.1s
  gpt-4o-mini (fallback)      p50 420ms  p95 880ms
```

### 2.4 Custo por decisão (média móvel 30d)

```
originacao:    R$ 0,072  (48% LLM, 31% bureaus, 21% infra)
reanalise:     R$ 0,019  (cache hit ratio 71%)
cobrança:      R$ 0,008  (regra dispara LLM em 12% dos casos)
fraude:        R$ 0,031  (modelo + regras; LLM só em revisão)
```

---

## 3. Sistema multiagente

Cinco agentes orquestrados por um sexto (Orchestrator). A escolha de quando cada agente entra é feita pelo grafo de estados, não por roteamento livre — um erro que cometemos no v1 e custou caro (ver §14.2).

### 3.1 Princípio: LLM ≠ raciocínio livre

A regra interna, escrita no Architecture Decision Record `ADR-031`, é:

- **Decisão determinística → regra ou modelo.** Se a entrada é estruturada e o output é um número/categoria, não usamos LLM. Score de risco, classificação de atraso, aprovação/reprovação numérica.
- **Síntese, justificativa, classificação semântica → LLM.** Resumo de comportamento de cliente, geração de mensagem de cobrança, classificação de motivo de atraso a partir de texto livre, leitura de cláusula contratual.
- **Decisão crítica de valor → híbrido com LLM auditando, não decidindo.** O LLM gera uma "segunda opinião" que pode levantar alerta, mas a decisão final é do modelo.

### 3.2 Credit Risk Agent

**Escopo.** Decide aprovação de limite, valor sugerido e taxa para originação e renovação. Roda em todo onboarding e em todo evento que altera a feature view de risco do cliente.

**Componentes.**

- `risk-pj-v7` (XGBoost): probabilidade de default em 90 dias. Treinado em ~2.1M observações PJ, retreinado mensalmente. AUC out-of-time = 0.832 na safra 03/2026.
- `cashflow-fcst-v3` (LightGBM): projeção de fluxo de caixa 30 dias com base em movimentação bancária via Open Finance + histórico transacional.
- Bureau adapter: chama Serasa Concentre + Quod Score PJ + Boa Vista. Falhas tratadas com fallback (§3.2.4).
- LLM (sonnet): só usado para gerar a justificativa em linguagem natural quando o caso vai para revisão humana. Não decide.

**Output esperado.**

```json
{
  "decisao_id": "DEC-2026-04-21-8f3a9b",
  "veredicto": "APROVADO_COM_RESTRICAO",
  "limite_sugerido_brl": 48000.00,
  "taxa_sugerida_aa": 0.0289,
  "score_pd_90d": 0.087,
  "drivers": [
    {"feature": "atraso_medio_60d", "valor": 4.2, "shap": -0.18},
    {"feature": "cashflow_volatilidade", "valor": 0.42, "shap": -0.11},
    {"feature": "score_serasa_pj", "valor": 612, "shap": +0.09}
  ],
  "fontes_consultadas": ["serasa", "quod", "open_finance"],
  "modelo_versao": "risk-pj-v7.4.2",
  "policy_versao": "policy-cred-2026-q2",
  "explicacao_humana": "Empresa com 18 meses de relacionamento, cashflow positivo mas volátil (CV 0.42). Atraso médio em alta nos últimos 60 dias. Limite reduzido de R$ 65k (sugerido pelo modelo) para R$ 48k pela política de cobertura de 1.3x do faturamento médio."
}
```

### 3.2.4 Fallback quando bureau falha

Serasa caiu três vezes em 2025 (incidente INC-2025-04-12 entre os que mais doeram). Hoje: se a chamada bureau falha por timeout > 1.2s ou retorna 5xx, o agente segue com o feature set sem bureau e marca a decisão com flag `bureau_missing=true`. Decisões com bureau ausente são limitadas a até R$ 15k de exposição automaticamente, e analista humano é notificado se for renovação acima desse valor.

### 3.3 Collection Strategy Agent

**Escopo.** Define a próxima ação de cobrança para um cliente em atraso ou em iminência de atraso. Não envia mensagens — devolve uma estratégia que o serviço `atlas-cobrança` executa.

**Lógica de decisão (em ordem):**

1. **Regra dura.** Cliente com bloqueio jurídico, em renegociação ativa ou com flag `nao_perturbe` → ação = `aguardar`.
2. **Modelo de propensão a pagar (`pay-prob-v4`, LightGBM).** Probabilidade de pagamento espontâneo nos próximos 7 dias dado o estado atual.
3. **Modelo de canal-resposta (`channel-uplift-v2`).** Para cada canal disponível (PIX-cobrança, boleto+SMS, WhatsApp, ligação humana, e-mail), estima o uplift de pagamento.
4. **LLM (haiku).** Gera o conteúdo da mensagem usando o RAG de templates aprovados pelo Jurídico e o tom adequado ao perfil do cliente. Tom é uma feature derivada (formal/cordial/firme), não livre.
5. **Validador.** Valida a mensagem contra blacklist (LGPD, expressões abusivas) e contra o template aprovado. Mensagem fora do template é rejeitada.

**Por que essa ordem.** O LLM só entra na ponta. Tudo que pode ser determinístico é determinístico, e o LLM só toca o conteúdo, nunca a estratégia. Isso reduziu alucinações de canal (o v1 chegou a sugerir "ligar para o cliente às 21h" — proibido por norma interna) em 100%.

### 3.4 Fraud Detection Agent

**Escopo.** Pontua transações e eventos de cadastro suspeitos. Bloqueia preventivamente em casos críticos. Não decide investigação.

- `fraud-pj-v5` (Isolation Forest + XGBoost stack): score de fraude.
- Regras determinísticas de blocking (CNPJ recém-aberto + valor alto, mesma máquina logando em 3 contas, etc.).
- LLM **não** entra no fluxo de decisão. Entra apenas no relatório enviado para Prevenção, resumindo os sinais.

### 3.5 Revenue Optimization Agent

**Escopo.** Recomenda reprecificação e ofertas de upgrade/downgrade. Roda semanalmente em batch. Não é tempo real.

- Modelo de elasticidade preço-churn (`elastic-v2`, GAM).
- Regras de margem mínima vinda do FP&A.
- LLM gera o argumentário de venda usado pelo time comercial — auditado por amostragem.

### 3.6 Orchestrator Agent

Não é um agente "pensante". É um grafo de estados em LangGraph que define quem fala com quem, em que ordem, e em que estado o caso para. A escolha por grafo determinístico em vez de roteamento por LLM foi tomada após o incidente INC-2025-09-03 (§14.2). O orquestrador também é responsável por:

- Persistir o estado do caso a cada nó (Postgres, tabela `atlas_case_state`)
- Disparar timeouts (caso preso > 30s entra em fila assíncrona)
- Coletar métricas de tempo por nó

---

## 4. Decision Engine

A camada de decisão é o que torna o sistema auditável. Cada decisão é um documento imutável com:

- `decisao_id` (ULID)
- `policy_versao` (referência à política vigente — política é versionada em git, deploy via PR aprovada por Risco)
- `modelo_versao` para cada modelo consultado
- `prompt_versao` se LLM foi usado
- `inputs` (snapshot completo das features, inclusive valores de bureau)
- `outputs` (decisão + drivers SHAP + explicação)
- `simulado` (boolean — true se foi shadow run)

### 4.1 Simulação antes de execução

Toda mudança em política, modelo ou prompt passa por **shadow mode**: a nova versão roda em paralelo com a antiga em até 100% do tráfego, sem afetar a decisão final. Comparamos:

- distribuição de decisões (PSI < 0.1 antes de promover)
- diferença de taxa de aprovação por faixa de risco
- diferença de limite médio sugerido
- número de inversões críticas (aprovado→reprovado e vice-versa)

Promoção é manual via PR no repositório de políticas, com revisão obrigatória de um analista de Risco e um eng de plataforma.

### 4.2 Rollback

Política e modelo têm rollback em 1 comando. Como cada decisão referencia `policy_versao` e `modelo_versao`, conseguimos reproduzir qualquer decisão antiga e auditar contra a versão atual. Em incidentes, conseguimos rollback de política em ~3 minutos (já testado em DR drill — última em 2026-02).

### 4.3 Scoring combinado

```
score_final = w1 * score_modelo
            + w2 * ajuste_regra
            + w3 * ajuste_llm_segunda_opiniao  (apenas se acionado)
```

Os pesos `w1, w2, w3` são definidos por política e versionados. O ajuste do LLM (segunda opinião) só pode mover o score em até ±0.05 (calibrado empiricamente; valores maiores aumentavam ruído sem ganho de AUC).

---

## 5. Event-driven

O bus de eventos (Kafka, partição por `cnpj_hash`) é o que torna o sistema reativo. Tópicos relevantes:

```
topic                                  retenção   consumidores
atlas.payment.received.v2              30d        risco-reanalise, cobrança-encerra-acao
atlas.payment.late.v2                  90d        cobrança-novo-caso, risco-reanalise
atlas.cadastro.atualizado.v1           30d        risco-reanalise, fraude-rescore
atlas.openfinance.transaction.v3       7d         feature-store-stream, fraude-rescore
atlas.bureau.score_change.v1           90d        risco-reanalise (fila prioritária)
atlas.case.decision.v2                 365d       data-lake-sink, audit-trail (compliance)
atlas.llm.eval.flag.v1                 30d        ai-quality-team
```

### 5.1 Exemplos de fluxo

**Atraso detectado:**

```
1. Sistema de pagamentos publica `atlas.payment.late.v2` quando boleto vence sem pagamento
2. Consumer `cobrança-novo-caso` cria um case_id e chama Orchestrator
3. Orchestrator → Collection Strategy Agent → estratégia
4. atlas-cobrança executa a ação (ex: gera PIX-cobrança, envia template)
5. Resultado da ação publica em `atlas.case.action.v1`
```

**Pagamento recebido:**

```
1. `atlas.payment.received.v2` → consumer `risco-reanalise`
2. Recalcula features incrementais (last_payment_amount, dias_desde_ultimo_atraso)
3. Se mudança em feature crítica > threshold → dispara reanalise
4. Reanalise pode mover cliente de faixa de risco e atualizar limite
```

**Fluxo dual** (caso real, ver INC-2025-11-04 em §14): pagamento recebido + atraso em outra fatura no mesmo dia. O orquestrador agrupa eventos por janela de 60s para evitar reanalisar o mesmo cliente duas vezes em segundos.

---

## 6. Memory Layer

Memória por empresa é persistida em duas camadas:

### 6.1 Memória estruturada (Postgres)

Tabela `empresa_memoria` com:

- features mais recentes (snapshot)
- últimas 100 decisões resumidas
- flags semânticas (`historico_renegociacao`, `cliente_premium`, `sazonalidade_alta`, `tipo_negocio_inferido`)
- counters (n_atrasos_12m, n_renegociacoes_lifetime, etc.)

### 6.2 Memória semântica (Qdrant)

Embeddings de:

- resumos de interações (geradas pelo Collection Agent)
- justificativas de decisão (geradas pelo Risk Agent quando LLM é usado)
- notas internas de analistas

Recuperada por similaridade quando um agente precisa de contexto histórico longo. Exemplo: cliente reentrante após 8 meses inativo — o Risk Agent puxa as 5 interações mais relevantes da memória semântica para entender se houve renegociação anterior.

### 6.3 Limites observados

A memória semântica deu problema quando o mesmo evento gerou múltiplos resumos próximos (deduplicação ruim). Resolvido com hash semântico (LSH) + TTL de 365 dias e re-embedding em massa quando trocamos o modelo de embedding (`bge-m3-pt` → `e5-large-pt-v2` em 2026-01).

---

## 7. RAG

O RAG do Atlas serve quatro fontes:

1. **Política de crédito** (~180 documentos markdown, versionados em git)
2. **Templates de cobrança aprovados pelo Jurídico** (~340 templates, com metadata de tom, canal, janela)
3. **Cláusulas contratuais por produto** (~60 documentos, usados quando o agente precisa citar contrato em mensagem)
4. **Notas de incidentes e decisões anteriores semanticamente próximas**

### 7.1 Chunking

- Política de crédito: chunking por seção markdown + overlap de 80 tokens. Headers preservados como metadata. Chunks sem header foram a maior fonte de erro até a v2 do retriever.
- Templates: cada template é um chunk; nunca quebrados.
- Contratos: chunking por cláusula + overlap. Cláusulas longas (>1500 tokens) viraram chunk único com sumário no início.

### 7.2 Embeddings + retrieval

- Modelo de embedding: `e5-large-pt-v2` (PT-BR). Em testes A/B contra `bge-m3` o `e5` performou melhor em queries jurídicas e levemente pior em queries financeiras; aceitamos o trade-off porque jurídico é mais sensível.
- Top-K = 12 inicialmente, re-ranking com `bge-reranker-base` para top-4.
- Filtros híbridos por metadata (produto, tipo de cliente, canal) aplicados antes do vector search quando aplicável.

### 7.3 Mitigação de alucinação

- Em cobrança, mensagem gerada pelo LLM é validada caractere-a-caractere contra o template recuperado. Se desviar > 15% (Levenshtein normalizado) é descartada e cai em template padrão.
- Em justificativa de risco, citações são checadas: cada feature mencionada na justificativa precisa estar no payload de inputs. Se não estiver, a justificativa é rejeitada e regenerada com prompt mais restrito.
- Toda saída LLM passa por classificador de PII (regex + ML) antes de sair.

---

## 8. Model Routing + Cost Intelligence

`llm-router` é um serviço FastAPI que abstrai chamadas a Claude (Anthropic), GPT-4o (OpenAI) e Llama 3.3 70B (self-hosted em vLLM, GPU dedicada para fallback).

### 8.1 Roteamento

Decisão de qual modelo usar é feita por:

- **Tipo de tarefa** (classificação prévia em `simples` / `raciocínio` / `geração-curta` / `geração-longa`)
- **Tamanho de input** (truncamento + escalonamento se passar threshold)
- **Custo acumulado da decisão** (orçamento por caso, ver §8.3)
- **SLO de latência** do endpoint chamador

| Tarefa | Modelo padrão | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Classificação de motivo de atraso | haiku | gpt-4o-mini | regra |
| Geração de mensagem de cobrança | haiku | gpt-4o-mini | template |
| Justificativa de decisão de risco | sonnet | gpt-4o | sem justificativa textual |
| Resumo de interações longas | sonnet | gpt-4o | truncar + haiku |
| Leitura de contrato social | sonnet | gpt-4o | OCR + regra |

### 8.2 Caching

Cache em duas camadas:

1. **Cache exato** (Redis, TTL 24h): hash de prompt + parâmetros + versão do modelo. Hit rate ~31%.
2. **Cache semântico** (Qdrant): embedding do prompt; resultado retornado se similaridade > 0.94 e contexto temporal compatível. Hit rate ~7%. Falsos positivos acontecem (~0.3%) e são mitigados por verificação rápida pelo agente que consome o resultado.

### 8.3 Orçamento por caso

Cada caso de originação tem orçamento default de R$ 0.15 em LLM. Se ultrapassar, o orquestrador para de chamar modelos novos e força fallback. Originações de valor alto (>R$ 100k) têm orçamento elevado para R$ 0.45.

---

## 9. Self-improving loop

### 9.1 Coleta de feedback

Três fontes:

1. **Outcome real.** Cliente pagou? Quando? Se cobrança disparada, qual canal converteu? Esses sinais voltam via Kafka e alimentam datasets de fine-tuning e retrain.
2. **Feedback humano.** Analista de Risco revisando uma decisão pode marcar `concordo / discordo / discordo_com_motivo`. Analistas de Cobrança podem marcar templates como `efetivo / ruim / problemático`.
3. **Eval automático.** LLM-as-judge (Claude Sonnet) avalia amostra de 2% das mensagens geradas em produção contra rubrica de tom, clareza, conformidade jurídica. Falhas viram alertas.

### 9.2 Ajuste de prompts

Prompts são versionados em `prompts/` com semver. Mudança requer:

- diff revisado por owner do agente
- backtest contra dataset de regressão (~1.200 casos rotulados)
- shadow em produção por no mínimo 3 dias antes de promoção

### 9.3 Retrain de modelos

- `risk-pj-v7`: retrain mensal com janela móvel de 18 meses; teste out-of-time obrigatório
- `pay-prob-v4`: retrain quinzenal
- `channel-uplift-v2`: retrain semanal (sazonalidade alta)
- `fraud-pj-v5`: retrain quinzenal + atualização de regras semanal

Promoção de modelo só com:

- AUC out-of-time não pior que -1pp do champion
- KS não pior que -2pp
- PSI < 0.1 contra distribuição em produção
- aprovação de Risco

---

## 10. MLOps + LLMOps

### 10.1 Versionamento

- **Código**: git, conventional commits, trunk-based
- **Modelos**: MLflow (artifact em S3, registry em Postgres). Cada modelo tem stage `dev → staging → production → archived`.
- **Prompts**: arquivos `.md` em `prompts/`, versionados com semver, hash gravado em cada decisão.
- **Datasets**: DVC para datasets de treino; Iceberg para datasets analíticos.
- **Políticas**: git, semver, deploy por PR.

### 10.2 Monitoramento

Stack: OpenTelemetry → Tempo (traces), Prometheus → Grafana (métricas), Loki (logs), Langfuse (observabilidade LLM).

Dashboards principais:

- `atlas-decisao-overview`: throughput, latência, erro por endpoint
- `atlas-modelo-saude`: PSI, drift de feature, KS rolando 7d/30d
- `atlas-llm-cost-quality`: custo por modelo, taxa de fallback, eval automático
- `atlas-cobrança-funil`: ações disparadas → respostas → conversão

### 10.3 Drift

Calculamos drift de feature diariamente (PSI per feature) e drift de output (distribuição de decisões por faixa). Triggers:

- PSI > 0.2 em qualquer feature top-15: alerta para `@plat-risco`
- PSI > 0.3 em distribuição de decisão: para retrain automático até revisão humana
- Drift de prompt (mudança brusca em embedding médio das saídas): alerta para `@ai-quality`

### 10.4 LLM eval

Pipeline noturno roda eval contra:

- 800 casos rotulados de mensagem de cobrança
- 400 casos rotulados de classificação de motivo de atraso
- 200 casos rotulados de resumo de interação

Métricas: exact match, ROUGE, eval LLM-as-judge em rubrica fixa. Quebras de >3pp em qualquer métrica geram ticket automático.

---

## 11. Governança e segurança

### 11.1 LGPD

- Dados pessoais minimizados; CPF de sócio mascarado em logs (`xxx.123.456-xx`).
- Direito de explicação: para qualquer decisão, retornamos drivers SHAP + justificativa textual. Endpoint `/decisao/{id}/explicacao` exposto ao DPO.
- Direito de revisão humana: cliente pode pedir revisão; o caso vai para fila manual com SLA de 5 dias úteis (regulatório).
- Anonimização em datasets analíticos: CNPJ pseudonimizado por hash com salt rotacionado anualmente.

### 11.2 Auditoria

- Todas as decisões são imutáveis e mantidas por 5 anos (retenção regulatória).
- Logs de acesso a dados sensíveis vão para WORM bucket S3.
- Audit trail é consumido por compliance via dataset dedicado em BigQuery.

### 11.3 Explainability

- Modelos de risco: SHAP values são calculados e gravados junto à decisão.
- Justificativa textual gerada por LLM, com restrição de só mencionar features presentes no input (§7.3).
- Dashboard interno permite a analistas pesquisar qualquer decisão por CNPJ + intervalo de tempo e ver inputs, outputs, modelo, política, prompt.

### 11.4 RBAC

Quatro perfis principais:

- `risco-analista`: leitura de decisões, escrita de feedback, override manual com aprovação
- `risco-gestor`: tudo do analista + override sem aprovação para tickets até R$ 50k
- `cobrança-operador`: leitura de casos, executar ações pré-aprovadas
- `eng-plataforma`: acesso técnico (sem PII)
- `compliance`: acesso a audit trail

Acesso a CPF, dados bancários e contrato social só para `risco-gestor` e `compliance`. Todo acesso é logado.

---

## 12. Integrações

| Sistema | Direção | Protocolo | Notas |
|---|---|---|---|
| ERP financeiro (Omie/Conta Azul via cliente) | inbound (webhook) | REST | Webhook normalizado por adapter; sujeito a delays de até 2h |
| CRM (Pipefy interno + HubSpot) | bidirecional | REST + webhook | Sincronização de status de cliente |
| Serasa Concentre | outbound | REST | Rate limit 30 req/s; circuit breaker a 80% |
| Quod Score PJ | outbound | REST | Rate limit 10 req/s; cache de 24h |
| Boa Vista | outbound | REST | Usado como fallback de Serasa |
| Open Finance (via Belvo) | outbound | REST | Tokens rotacionados; cliente precisa renovar consentimento a cada 12 meses |
| Boleto/PIX (banco emissor) | outbound | REST + webhook | Geração de boleto, PIX QR e PIX-cobrança |
| WhatsApp Business (Meta) | outbound | REST | Templates aprovados pela Meta + nossos validadores |
| Recovery+ (cobrança terceirizada) | outbound | REST | Após 90 dias |

Falhas em integrações têm retry exponencial (max 5 tentativas) + dead-letter queue. Bureau outage tem fallback (§3.2.4). Open Finance outage suspende reanalise baseada em fluxo de caixa por até 12h, depois marca empresa com `openfinance_stale=true`.

---

## 13. Métricas

Comparação Q1/2025 (pré-Atlas) vs Q1/2026 (Atlas em produção há 11 meses):

| Métrica | Q1/2025 | Q1/2026 | Delta |
|---|---|---|---|
| Inadimplência 90+ dias | 6.8% | 4.9% | -1.9pp |
| Recuperação 0–30 dias | 41% | 58% | +17pp |
| Recuperação 30–60 dias | 19% | 27% | +8pp |
| Tempo médio de análise (ticket cinza) | 22min | 6min (assistido) | -73% |
| % casos automatizados (originação) | 64% | 87% | +23pp |
| Custo médio por decisão | R$ 0,21 | R$ 0,072 | -66% |
| NPS do time de Cobrança | 31 | 52 | +21 |
| Override manual em decisão automática | 9.2% | 5.1% | -4.1pp |

Observações:

- A queda de inadimplência **não** é totalmente atribuível ao Atlas. O ciclo macroeconômico melhorou em ~0.6pp segundo nosso modelo de atribuição. O ganho atribuível ao sistema, descontando ciclo, é estimado em -1.3pp.
- O ganho em recuperação 0–30 vem majoritariamente do canal-uplift (modelo de canal certo + timing). A geração de mensagem por LLM contribui menos que o esperado (~+2pp isolados); a maior parte é roteamento.
- Tempo médio de análise é com analista usando o sistema; não é tempo de decisão automática.

---

## 14. Problemas reais

### 14.1 Empresas sem histórico (cold-start PJ)

Cliente novo, CNPJ aberto há <6 meses, sem histórico bancário no nosso ecossistema, e bureau retornando score genérico → modelo `risk-pj-v7` performa mal (AUC cai para ~0.71 nesse segmento). Mitigação:

- Política de exposição reduzida (limite máximo R$ 8k para CNPJs <6m sem Open Finance autorizado)
- Pesos diferentes no scoring combinado (regra pesa mais que modelo)
- Trigger automático de revisão humana se ticket > R$ 5k
- Coleta proativa de Open Finance no onboarding (consent rate aumentou de 47% → 71% após mudar UX)

### 14.2 Incidente INC-2025-09-03 — orquestração por LLM

No v1 do Atlas, o roteamento entre agentes era feito por um "supervisor" LLM. Em ~0.4% dos casos o supervisor gerava sequências inválidas (chamava Cobrança Agent para cliente em originação) ou loops (chamava o mesmo agente 3x seguidas). Em produção isso virou ~140 casos por dia em que o sistema travava ou tomava decisão errada. Migramos para LangGraph com grafo determinístico em 11 dias. Lesson learned no `POSTMORTEM-2025-09-03.md`.

### 14.3 Alucinação de cláusula contratual

Em maio/2025 o Collection Agent gerou mensagem citando uma cláusula de multa que **não existia** no contrato daquele produto. Mensagem chegou a 3 clientes antes de ser detectada por amostragem manual. Mitigação implementada:

- Validador caractere-a-caractere contra template (§7.3)
- Citações de cláusula só permitidas via slot rígido (template tem `{{clausula_id}}`, validador checa se a cláusula existe e bate com o produto)
- Eval automático de "citação inválida" rodando diariamente

Causa raiz: o RAG estava puxando cláusulas de produto correto na maior parte dos casos, mas em ~0.7% misturava chunks de contratos de produtos diferentes por similaridade alta de linguagem boilerplate. Solucionado adicionando filtro hard por produto antes do retrieval.

### 14.4 Inconsistência entre Open Finance e ERP do cliente

Recorrente: faturamento reportado pelo cliente no onboarding bate com ERP, mas Open Finance mostra movimentação 30–50% menor. Causas comuns: cliente opera com múltiplas contas e só conectou uma; cliente recebe parte em dinheiro/PIX em CNPJ diferente; ERP está desatualizado. Política atual: divergência > 25% entre faturamento declarado e Open Finance gera flag `divergencia_faturamento`, decisão fica com peso maior em Open Finance, e analista é notificado.

### 14.5 Decisões conflitantes entre modelos

Nem sempre `risk-pj-v7` e `cashflow-fcst-v3` concordam. Caso comum: score de risco favorável (PD baixo), mas projeção de fluxo de caixa indica aperto nos próximos 30 dias. Política:

- Se PD < 0.05 e projeção fluxo < 0 por > 15 dias → cap de exposição em 60% do que o modelo de risco sugeriria, e `cashflow-fcst-v3` justifica o cap.
- Se PD > 0.15 mas Open Finance mostra forte sazonalidade favorável (ex: empresa de turismo entrando em alta temporada) → analista é convocado.

Em ~3.4% dos casos os dois modelos divergem materialmente. Em metade desses casos o LLM "segunda opinião" é acionado para sintetizar a divergência em linguagem natural para o analista, mas **ele não desempata** — quem desempata é o analista ou a regra de exposição.

Exemplo de divergência registrada (caso real, anonimizado):

```
caso_id: CASE-2026-03-14-0091a3
empresa_setor: comércio varejista de vestuário
risco_pj_v7: PD_90d = 0.041   → veredicto modelo: APROVAR R$ 65k
cashflow_fcst_v3: déficit projetado 22 dias dos próximos 30 → SINAL VERMELHO
fraud_pj_v5: score 0.08 → OK
serasa_pj: 642 → OK
quod_pj: 588 → ATENCAO

decisão final: APROVADO_COM_RESTRICAO @ R$ 28k
gatilho: regra de cap de cashflow (60% do sugerido pelo risk model)
analista revisor: @ana.r — concordou em 14min após revisar Open Finance
```

### 14.6 Latência de bureau em horário de pico

Serasa tem latência maior entre 09h–11h e 14h–17h. P99 sobe de 380ms para 1.4s. Isso quebrou nosso SLO de originação síncrona em alguns picos. Mitigação:

- Pre-fetch noturno de score para clientes em pipeline de pré-aprovação
- Cache agressivo (TTL 8h) para reanalise (novo PR aprovou TTL maior após estudo de estabilidade)
- Originação fora dos horários de pico tem SLO mais apertado; em pico, p95 relaxado para 1.1s com aviso no health check

### 14.7 Drift de prompt sem deploy

Mudança em modelo backend da Anthropic (haiku 3.5 → 4.0 em determinada janela) alterou comportamento sutil em ~2% das mensagens geradas. Detectado pelo eval automático antes de chegar a produção em massa. Aprendizado: fixamos versão exata do modelo (não usamos alias `latest`) e temos canário de 5% para mudanças de modelo, mesmo que sejam "sem deploy" do nosso lado.

---

## 15. Exemplos reais

### 15.1 Originação — caso aprovado com ressalva

**Input:**

```json
{
  "request_id": "REQ-2026-04-21-7a2b9c",
  "tipo": "originacao",
  "cnpj": "12.345.678/0001-90",
  "produto": "antecipacao_recebiveis",
  "valor_solicitado_brl": 80000.00,
  "razao_social": "Comercial Aurora Norte LTDA",
  "data_abertura": "2021-08-14",
  "regime_tributario": "simples_nacional",
  "faturamento_declarado_brl_mes": 145000,
  "openfinance_consentido": true,
  "socios": [
    {"cpf_hash": "9f3...", "participacao": 0.6},
    {"cpf_hash": "2a1...", "participacao": 0.4}
  ]
}
```

**Output:**

```json
{
  "decisao_id": "DEC-2026-04-21-8f3a9b2c",
  "veredicto": "APROVADO_COM_RESTRICAO",
  "limite_aprovado_brl": 48000.00,
  "valor_solicitado_brl": 80000.00,
  "valor_aprovado_brl": 48000.00,
  "taxa_aa": 0.0312,
  "prazo_max_dias": 45,
  "score_pd_90d": 0.087,
  "modelo_versao": "risk-pj-v7.4.2",
  "cashflow_versao": "cashflow-fcst-v3.2.1",
  "policy_versao": "policy-cred-2026-q2-r3",
  "drivers": [
    {"feature": "cashflow_projecao_30d_min", "valor": -4200, "peso": -0.21},
    {"feature": "atraso_medio_60d", "valor": 4.2, "peso": -0.18},
    {"feature": "divergencia_faturamento_vs_openfinance", "valor": 0.31, "peso": -0.14},
    {"feature": "tempo_relacionamento_meses", "valor": 18, "peso": +0.11},
    {"feature": "score_serasa_pj", "valor": 612, "peso": +0.09}
  ],
  "fontes_consultadas": ["serasa", "quod", "openfinance", "feature_store"],
  "flags": ["divergencia_faturamento", "cashflow_alerta"],
  "explicacao_humana": "Empresa com 18 meses de relacionamento, score Serasa adequado (612). Open Finance indica faturamento ~31% abaixo do declarado, e projeção de fluxo de caixa mostra déficit de R$ 4,2k nos próximos 30 dias. Limite reduzido de R$ 65k (sugerido pelo modelo de risco) para R$ 48k pela regra de cap de cashflow. Recomenda-se revisão humana se cliente solicitar aumento.",
  "tempo_decisao_ms": 612,
  "custo_brl": 0.081,
  "modelos_chamados": ["risk-pj-v7", "cashflow-fcst-v3", "fraud-pj-v5", "llm-justificativa(sonnet)"],
  "shadow_versao": "risk-pj-v8-rc1 (sugeriu R$ 52k, divergência aceita)"
}
```

### 15.2 Cobrança — estratégia em atraso de 7 dias

**Input:**

```json
{
  "case_id": "CASE-2026-04-21-339a0e",
  "tipo": "atraso_recente",
  "cnpj_hash": "8e9...",
  "fatura_id": "INV-2026-03-7188",
  "valor_brl": 2380.00,
  "dias_atraso": 7,
  "tentativas_anteriores": [
    {"canal": "email", "data": "2026-04-15", "resposta": null},
    {"canal": "boleto_2via", "data": "2026-04-17", "resposta": null}
  ],
  "perfil_cliente": {
    "ticket_medio_mensal": 4200,
    "n_atrasos_12m": 1,
    "tom_preferido_inferido": "cordial",
    "horario_engajamento_historico": "manha"
  }
}
```

**Output:**

```json
{
  "estrategia_id": "STR-2026-04-21-44c1",
  "case_id": "CASE-2026-04-21-339a0e",
  "acao": "envio_pix_cobranca_whatsapp",
  "horario_disparo_recomendado": "2026-04-22T09:30:00-03:00",
  "canal": "whatsapp",
  "template_id": "TPL-COBR-CORDIAL-PIX-V12",
  "mensagem_gerada": "Olá, Comercial Aurora! Identificamos a fatura INV-2026-03-7188 em aberto há 7 dias. Para facilitar, geramos um PIX-cobrança que você pode pagar direto pelo app do seu banco. Qualquer coisa, é só responder por aqui que a gente ajuda.",
  "valor_brl": 2380.00,
  "modelos_consultados": [
    {"modelo": "pay-prob-v4", "saida": {"prob_pagto_7d": 0.62}},
    {"modelo": "channel-uplift-v2", "saida": {
      "whatsapp": 0.31,
      "email": 0.08,
      "ligacao": 0.22,
      "sms": 0.14
    }}
  ],
  "validacao_template": "ok",
  "validacao_pii": "ok",
  "validacao_levenshtein": 0.04,
  "tempo_decisao_ms": 287,
  "custo_brl": 0.011
}
```

### 15.3 Reanalise disparada por evento

**Trigger:** `atlas.openfinance.transaction.v3` com transação atípica (>3x o ticket médio).

**Output:**

```json
{
  "evento_id": "EVT-2026-04-21-92ab",
  "trigger": "openfinance_transacao_atipica",
  "case_id": "CASE-2026-04-21-99ef10",
  "decisao_anterior_id": "DEC-2026-03-12-aa11ee",
  "decisao_nova_id": "DEC-2026-04-21-9eef02",
  "mudou_faixa_risco": false,
  "mudou_limite": true,
  "limite_anterior_brl": 35000,
  "limite_novo_brl": 42000,
  "razao": "Aumento sustentado de receita nos últimos 45 dias (+22%); cashflow_fcst_v3 prevê superávit estável; nenhum sinal adverso em fraude ou bureau.",
  "tempo_total_evento_ate_decisao_ms": 4310
}
```

---

## 16. Frontend

Ver `frontend.html`. SPA single-file com seis telas (Dashboard, Empresas, Análise de Crédito, Cobrança, Agentes, Monitoramento). Dados mockados realistas. Layout corporativo denso, tema escuro inspirado em terminais de operação (Bloomberg/internal trading desks).

Stack: HTML + CSS (custom properties) + JavaScript vanilla. Sem framework — alinhado à decisão arquitetural de manter telas operacionais leves e independentes (RFC-021).

---

## 17. Backend (referência)

Ver `backend_main.py`. FastAPI + Pydantic v2. Endpoints expostos:

- `POST /v1/decisao/originacao` — originação de crédito
- `POST /v1/decisao/reanalise` — reanalise por evento
- `POST /v1/cobranca/estrategia` — sugestão de estratégia de cobrança
- `GET  /v1/empresa/{cnpj}/score` — leitura de score corrente (cache)
- `GET  /v1/decisao/{decisao_id}` — auditoria de decisão
- `POST /v1/decisao/{decisao_id}/feedback` — feedback do analista
- `GET  /healthz`, `GET /readyz`, `GET /metrics` — saúde

Backend completo é distribuído em três serviços (`atlas-origin`, `atlas-decision`, `atlas-cobrança`); o arquivo de referência mostra o serviço de decisão consolidado para fins de documentação.

---

## 18. Diferenciais e situações observadas em produção

### 18.1 Fallback sem IA

Em pelo menos quatro cenários conseguimos operar sem nenhum modelo:

1. **LLM gateway fora.** Mensagens de cobrança usam template puro com slots determinísticos. Justificativa de risco fica vazia (campo opcional). Decisão segue.
2. **Modelo de risco fora.** Decisão cai em política de regras puras (faixa de bureau + faixa de faturamento + regra de exposição). Limite aprovado é tipicamente 30–50% menor.
3. **Bureau fora.** §3.2.4.
4. **Open Finance fora.** Reanalise baseada em movimentação é suspensa; reanalise por outros gatilhos (atraso, pagamento) continua.

Modo degradado é controlado por feature flags (`atlas.degraded.llm`, `atlas.degraded.risk_model`, etc.) acionadas automaticamente por health checks ou manualmente por on-call.

### 18.2 Logs de produção (amostras reais, anonimizadas)

Formato: JSON estruturado, vai para Loki + S3.

```
2026-04-21T11:22:08.412Z  INFO  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="originacao iniciada" cnpj_hash=8e9... produto=antecipacao_recebiveis valor=80000

2026-04-21T11:22:08.498Z  INFO  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="bureau call" provider=serasa latency_ms=86 cache=miss status=200

2026-04-21T11:22:08.510Z  WARN  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="bureau call" provider=quod latency_ms=312 cache=miss status=200
  note="latency above p95 threshold (250ms), no action taken"

2026-04-21T11:22:08.821Z  INFO  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="model inference" model=risk-pj-v7.4.2 pd_90d=0.087 latency_ms=22

2026-04-21T11:22:08.844Z  INFO  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="model inference" model=cashflow-fcst-v3.2.1 cashflow_min_30d=-4200 latency_ms=18
  alert="cashflow_min_30d < threshold(-1000)"

2026-04-21T11:22:08.851Z  WARN  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="model_disagreement" detected=true risk_signal=approve cashflow_signal=block
  policy_action=cap_exposure_60pct

2026-04-21T11:22:08.860Z  INFO  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="data_consistency_check" check=faturamento_vs_openfinance result=DIVERGE
  declared=145000 openfinance_inferred=99800 diff_pct=0.31 flag_set=divergencia_faturamento

2026-04-21T11:22:09.014Z  INFO  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="llm call" task=justificativa model=sonnet input_tokens=1842 output_tokens=187
  latency_ms=151 cost_brl=0.038 cache=miss

2026-04-21T11:22:09.022Z  INFO  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="llm validation" check=feature_grounding mentioned_features=4 validated=4 status=ok

2026-04-21T11:22:09.024Z  INFO  service=atlas-decision trace=4f9a... case=CASE-2026-04-21-339a0e
  msg="decision_emitted" id=DEC-2026-04-21-8f3a9b2c veredicto=APROVADO_COM_RESTRICAO
  limite=48000 total_latency_ms=612 cost_brl=0.081
```

Snippet de log de erro (incidente menor recorrente, controlado):

```
2026-04-21T11:24:51.103Z  ERROR service=llm-router trace=88aa...
  msg="upstream_timeout" provider=anthropic model=claude-sonnet route=justificativa
  timeout_ms=4000 attempt=1
2026-04-21T11:24:51.108Z  WARN  service=llm-router trace=88aa...
  msg="fallback_triggered" from=anthropic-sonnet to=openai-gpt-4o reason=timeout
2026-04-21T11:24:53.218Z  INFO  service=llm-router trace=88aa...
  msg="fallback_success" provider=openai latency_ms=2110 cost_delta_brl=+0.018
```

### 18.3 Inconsistência de dados (comum, não excepcional)

Casos recorrentes que o sistema lida hoje sem intervenção:

- **CNPJ com razão social diferente entre Receita e bureau** (~2% dos casos). Razão social do bureau vem de cadastro autodeclarado. Sistema usa Receita como fonte de verdade (consulta via integração) e gera flag se diferir.
- **Faturamento Open Finance ≠ ERP cliente ≠ declarado** (recorrente). Política em §14.4.
- **Sócio com CPF aparecendo em dois CNPJs com perfis muito diferentes** (raro, mas alto impacto). Trigger para fraude se valor > R$ 30k.
- **Webhook de pagamento duplicado.** Idempotência por `event_id` resolve em 99.7% dos casos. Em <0.3% (mismatch de id em retry de banco) caímos em deduplicação por janela temporal.
- **Score de bureau muda em <24h.** Acontece. Se mudança >50pts, dispara reanalise.

### 18.4 Decisões conflitantes — caso recente

Caso real (anonimizado), 2026-04-09:

```
case: CASE-2026-04-09-117def
empresa: prestador de serviços B2B, 24 meses de relacionamento
modelos:
  risk-pj-v7.4.2  → APROVAR R$ 90k (PD 0.038)
  cashflow-fcst   → APROVAR R$ 90k (superávit projetado +R$ 12k/30d)
  fraud-pj-v5     → ALERTA score 0.34 (threshold de bloqueio: 0.45)
  channel-resp    → n/a (não é cobrança)
  llm-segundaop   → ALERTA: "Empresa apresenta padrão de transações com 4 contrapartes
                   recém-cadastradas em 30 dias e movimentação concentrada em 6 dias do mês.
                   Recomenda-se verificação manual."

decisão final: PENDENTE_REVISAO_HUMANA
gatilho: política manda revisão humana se LLM segunda opinião + Fraud Agent ambos sinalizarem,
         independente do score de risco
analista @marcio.f revisou em 27min
veredicto humano: APROVAR R$ 60k (cap de exposição manual; cliente histórico bom mas padrão atípico
                  recente justifica cautela; revisão em 60d)
```

### 18.5 Erro real do sistema (bug em produção, jan/2026)

Bug em `cashflow-fcst-v3.2.0`: feature `media_diaria_30d` calculada com janela de 28 dias por erro de fuso (date_trunc em UTC vs America/Sao_Paulo). Em meses de fevereiro o cálculo ficava ainda menor. Detectado por:

- analista percebeu queda inexplicável de limites em fev/2026
- investigação mostrou que ~7% das decisões do mês foram afetadas (limites em média 8% menores)
- rollback para v3.1.x em produção em 4h
- correção e republicação em v3.2.1 em 2 dias
- decisões afetadas foram replayadas em batch e clientes elegíveis tiveram limite revisto sem ação do cliente

Lesson learned: testes de regressão de feature engineering precisam cobrir bordas de timezone. Adicionado a `feature-tests/` em CI bloqueante.

---

## Anexos

### A. Estrutura do repositório

```
atlas/
├── services/
│   ├── atlas-origin/          # FastAPI — onboarding e originação
│   ├── atlas-decision/        # FastAPI — núcleo do decision engine
│   ├── atlas-cobrança/        # FastAPI — execução de estratégias
│   └── llm-router/            # FastAPI — gateway de LLM
├── agents/
│   ├── credit_risk/
│   ├── collection_strategy/
│   ├── fraud/
│   ├── revenue_opt/
│   └── orchestrator/          # LangGraph state machine
├── models/
│   ├── risk-pj/               # XGBoost
│   ├── cashflow-fcst/         # LightGBM
│   ├── pay-prob/              # LightGBM
│   ├── channel-uplift/        # uplift modeling
│   └── fraud-pj/              # IF + XGB stack
├── prompts/                   # versionados, semver
├── policies/                  # versionadas, semver
├── rag/
│   ├── ingest/                # pipelines de ingestão
│   ├── retriever/
│   └── eval/
├── platform/
│   ├── feature-store/         # Feast configs
│   ├── streaming/             # Kafka topics, schemas (Avro)
│   └── observability/         # OTel, Prometheus, Grafana dashboards
├── infra/                     # Terraform
├── docs/
│   ├── adr/                   # Architecture Decision Records
│   ├── runbooks/
│   └── postmortems/
└── tests/
```

### B. Runbooks principais

- `RB-001-bureau-outage.md`
- `RB-002-llm-router-degraded.md`
- `RB-003-rollback-policy.md`
- `RB-004-rollback-model.md`
- `RB-005-replay-decisao.md`
- `RB-006-pico-de-decisao-sincrona.md`
- `RB-007-drift-alerta.md`

### C. ADRs relevantes

- ADR-014 — escopo do que Atlas decide e o que vai para humano
- ADR-021 — frontend vanilla vs framework
- ADR-031 — quando usar LLM, modelo, regra
- ADR-038 — orquestração determinística (LangGraph) vs supervisor LLM
- ADR-044 — cache semântico em decisões críticas
- ADR-052 — fallback sem IA por feature flag

---

*Fim da documentação técnica. Para detalhes operacionais consulte o `runbooks/` no repositório. Dúvidas: `#atlas-eng` no Slack.*
