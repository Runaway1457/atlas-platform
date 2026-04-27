# Atlas API

Backend FastAPI de referência para o sistema Atlas. Versão consolidada para fins de documentação — em uma implantação real, este código seria dividido em três serviços (`atlas-origin`, `atlas-decision`, `atlas-cobrança`).

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

OpenAPI: <http://localhost:8080/docs>
Métricas Prometheus: <http://localhost:8080/metrics>
Health: <http://localhost:8080/healthz>, <http://localhost:8080/readyz>

## O que é stub

As classes abaixo são stubs em memória. Para uso real, substituir:

- `FeatureStoreClient` → cliente Feast / lookup em Postgres+Redis
- `BureauClient` → cliente HTTP real para Serasa/Quod/Boa Vista com circuit breaker
- `LLMRouter` → integração com Anthropic SDK + OpenAI SDK + vLLM
- `PolicyEngine` → carregar políticas versionadas de git
- `AuditWriter` → escrever em S3 WORM bucket
- `EventBus` → producer Kafka

## Exemplo de chamada

```bash
curl -X POST http://localhost:8080/v1/decisao/originacao \
  -H "Content-Type: application/json" \
  -d '{
    "cnpj": "12.345.678/0001-90",
    "produto": "antecipacao_recebiveis",
    "valor_solicitado_brl": "80000.00",
    "razao_social": "Comercial Aurora Norte LTDA",
    "data_abertura": "2021-08-14T00:00:00Z",
    "regime_tributario": "simples_nacional",
    "faturamento_declarado_brl_mes": "145000.00",
    "openfinance_consentido": true,
    "socios": [
      {"cpf_hash": "9f3abc12", "participacao": 0.6},
      {"cpf_hash": "2a1def45", "participacao": 0.4}
    ]
  }' | jq
```
