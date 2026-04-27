# Atlas

> Reference architecture and case study for an AI-powered credit decisioning and intelligent collections platform, designed for the Brazilian B2B fintech context.
>
> Plataforma de decisão de crédito e cobrança inteligente com IA, desenhada para o contexto B2B brasileiro.

<p>
  <img alt="status" src="https://img.shields.io/badge/status-showcase-1d3557">
  <img alt="stack" src="https://img.shields.io/badge/stack-FastAPI%20%2B%20LangGraph%20%2B%20XGBoost-1d3557">
  <img alt="frontend" src="https://img.shields.io/badge/frontend-vanilla%20js-1d3557">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-1d3557">
</p>

---

## TL;DR

Atlas é um **estudo de caso técnico** que demonstra como uma fintech B2B brasileira poderia construir um sistema de decisão de crédito e cobrança usando:

- **Sistema multiagente** orquestrado por LangGraph (Credit Risk, Collection Strategy, Fraud, Revenue Optimization, Orchestrator)
- **Modelos de ML** clássicos para risco e cashflow + **LLMs** para tarefas de síntese e geração
- **Decision engine versionado** com simulação, rollback e auditoria
- **RAG avançado** com mitigação de alucinação (validação caractere-a-caractere, grounding em features)
- **MLOps + LLMOps** completos: versionamento, drift, eval automático, model routing
- **Governança** alinhada à LGPD, com logs auditáveis e explicabilidade (SHAP + justificativa textual)

Inclui:
- 📄 [Documentação técnica de arquitetura](docs/ARCHITECTURE.md) (~50 páginas)
- 🖥️ [Frontend SPA funcional](web/index.html) com 6 telas operacionais
- 🐍 [Backend FastAPI de referência](api/main.py) com Pydantic v2, OpenTelemetry e Prometheus

---

## ⚠️ Disclaimer

**Este é um projeto de portfólio / showcase técnico.** Não é um sistema em operação real, embora a documentação seja escrita no estilo de documentação interna de engenharia para fins didáticos. Os dados, métricas, incidentes, CNPJs e clientes citados são **fictícios**. O objetivo é demonstrar padrões arquiteturais aplicáveis ao contexto de fintechs B2B brasileiras.

This is a **portfolio / technical showcase project**. It is not a system in real operation, though the documentation is written in the style of internal engineering docs for didactic purposes. All data, metrics, incidents, CNPJs and clients mentioned are **fictional**.

---

## Sobre o cenário modelado

O sistema atende a uma fintech B2B brasileira hipotética com:

- ~38 mil CNPJs ativos (faturamento R$ 20 mil – R$ 5 milhões/mês)
- Três produtos: antecipação de recebíveis, conta com crédito rotativo, maquininha com split
- ~310 mil decisões/dia entre originação, reanálise e ações de cobrança
- Integrações com **Serasa**, **Quod**, **Boa Vista**, **Open Finance (Belvo)**, **WhatsApp Business**, **PIX-cobrança**

---

## Estrutura

```
atlas-platform/
├── README.md                  # este arquivo
├── LICENSE                    # MIT
├── docs/
│   └── ARCHITECTURE.md        # documentação técnica completa (18 seções)
├── web/
│   └── index.html             # SPA single-file (6 telas)
└── api/
    ├── main.py                # backend FastAPI de referência
    └── requirements.txt
```

---

## Como rodar

### Frontend

Abra `web/index.html` no navegador. Não precisa de build nem dependências.

```bash
# opcional, se quiser servir via http local:
cd web && python3 -m http.server 8000
# acesse http://localhost:8000
```

### Backend

Requer Python 3.11+.

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
# OpenAPI: http://localhost:8080/docs
```

Endpoints expostos:

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/v1/decisao/originacao` | originação síncrona (SLO p95 800ms) |
| `POST` | `/v1/decisao/reanalise` | reanálise por evento |
| `POST` | `/v1/cobranca/estrategia` | estratégia de cobrança recomendada |
| `GET`  | `/v1/empresa/{cnpj}/score` | score corrente cacheado |
| `GET`  | `/v1/decisao/{id}` | auditoria de decisão |
| `POST` | `/v1/decisao/{id}/feedback` | feedback do analista |
| `GET`  | `/healthz`, `/readyz`, `/metrics` | saúde e Prometheus |

> O backend usa stubs em memória para feature store, bureau e LLM router. Para uma implementação real, substituir as classes `FeatureStoreClient`, `BureauClient`, `LLMRouter` por integrações reais (Feast, httpx, Anthropic SDK).

---

## Telas do frontend

1. **Dashboard** — KPIs (inadimplência, recuperação, risco médio, decisões), gráfico de volume por hora, distribuição por veredicto, stream de eventos ao vivo, alertas de drift
2. **Empresas** — tabela com 100 CNPJs, busca, filtro por risco e status
3. **Análise de Crédito** — formulário com auto-fetch da Receita Federal (mock), pipeline animado mostrando cada etapa (bureau, modelos, política, LLM), bureaus consultados com scores, drivers SHAP, projeção de cashflow, justificativa textual com grounding, ações por veredicto
4. **Cobrança** — 412 casos priorizados, detalhe com 4 abas (resumo, histórico/timeline, comparativo de canais com uplift, mensagem gerada com preview por canal)
5. **Agentes IA** — tiles de status, log denso com filtro por tipo (conflitos, erros, LLM), roteamento entre agentes, divergências entre modelos
6. **Monitoramento** — latência p50/p95/p99, custo por modelo LLM, drift de feature, health de integrações

---

## Stack & decisões técnicas

| Camada | Escolha | Por quê |
|---|---|---|
| Backend | FastAPI + Pydantic v2 | tipos fortes para contratos de risco; throughput aceitável |
| Orquestração | LangGraph (grafo determinístico) | replay e auditoria; abandonado supervisor-LLM em v1 (ver postmortem) |
| Modelos | XGBoost (risco), LightGBM (cashflow, propensão), Isolation Forest (fraude) | maturidade, explicabilidade, custo |
| LLMs | Claude (Sonnet/Haiku) primário, GPT-4o fallback, Llama 3.3 self-hosted last-resort | custo × qualidade × resiliência |
| Vector DB | Qdrant | custo (~3.2× mais barato que Pinecone no volume modelado) |
| Feature Store | Feast + Postgres | reuso de infra; volume não justificava Tecton |
| Streaming | Kafka (MSK) | particionamento por CNPJ, retenção fina |
| Observabilidade | OpenTelemetry, Prometheus, Loki, Langfuse | stack consolidada |
| ML registry | MLflow self-hosted | versionamento de modelo + artifact em S3 |

Decisões e trade-offs detalhados em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §2 e ADRs anexos.

---

## Destaques do que está documentado

- **§3 — Sistema multiagente**: regra interna de quando usar LLM × ML × regra determinística
- **§4 — Decision engine**: decisões versionadas, shadow mode antes de promoção, rollback em ~3 minutos
- **§7 — RAG**: chunking por seção, re-ranking, validação caractere-a-caractere para mitigar alucinação
- **§8 — Model routing**: tabela de fallback por tarefa, cache exato + semântico, orçamento por caso
- **§13 — Métricas**: comparação Q1/2025 (pré-Atlas) vs Q1/2026, com nuance honesta (descontando ciclo macro)
- **§14 — Problemas reais**: incidentes ilustrativos incluindo o postmortem do supervisor-LLM, alucinação de cláusula contratual, divergências entre `risk-pj-v7` e `cashflow-fcst-v3`, bug de timezone em produção
- **§18 — Logs e inconsistências**: formato JSON estruturado, casos comuns de inconsistência (faturamento declarado × Open Finance, razão social diferente entre Receita e bureau, webhook duplicado)

---

## Autor

**Gabriel Borges**
Construindo sistemas de IA para o contexto B2B brasileiro.

- LinkedIn: [linkedin.com/in/gabrielborgesai](https://linkedin.com/in/gabriel-borges25/)
- GitHub: [@gabrielborgesai](https://github.com/Runaway1457)

---

## Licença

MIT — veja [LICENSE](LICENSE).

Sinta-se livre para usar trechos da arquitetura, do frontend ou do backend como referência em seus próprios projetos. Atribuição é apreciada mas não exigida.
