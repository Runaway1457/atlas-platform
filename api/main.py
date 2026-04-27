"""
atlas-decision · serviço de decisão consolidado (referência para documentação)

Este arquivo é uma versão consolidada do serviço `atlas-decision` para fins de
documentação. A versão em produção é dividida em três serviços e usa imports do
monorepo (`atlas.platform.*`, `atlas.agents.*`). Aqui mantemos as interfaces
públicas e os fluxos principais com stubs onde apropriado.

Stack:
- FastAPI 0.115.x
- Pydantic v2
- OpenTelemetry para tracing
- Prometheus client para métricas
- LangGraph para orquestração (instanciado em atlas.agents.orchestrator)
- httpx para chamadas externas (bureau, llm-router)

Owner: @plat-risco · @plat-cobrança
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Annotated, Any, Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from prometheus_client import Counter, Histogram, generate_latest
from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Imports internos (stubs neste arquivo de referência)
# ---------------------------------------------------------------------------
# from atlas.agents.orchestrator import build_graph
# from atlas.agents.credit_risk import CreditRiskAgent
# from atlas.agents.collection_strategy import CollectionStrategyAgent
# from atlas.agents.fraud import FraudAgent
# from atlas.platform.feature_store import FeatureStoreClient
# from atlas.platform.bureau import BureauClient, BureauOutage
# from atlas.platform.llm_router import LLMRouter, LLMTimeout
# from atlas.platform.policy import PolicyEngine
# from atlas.platform.audit import AuditWriter
# from atlas.platform.kafka import EventBus

logger = logging.getLogger("atlas.decision")
tracer = trace.get_tracer("atlas.decision")

# ---------------------------------------------------------------------------
# Métricas (expostas em /metrics)
# ---------------------------------------------------------------------------
DECISION_LATENCY = Histogram(
    "atlas_decision_latency_seconds",
    "End-to-end latency for decision endpoints",
    ["endpoint", "veredicto", "policy_version"],
    buckets=(0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0),
)
DECISION_COUNT = Counter(
    "atlas_decision_total",
    "Total decisions emitted",
    ["endpoint", "veredicto", "degraded"],
)
EXTERNAL_CALL = Histogram(
    "atlas_external_call_seconds",
    "External call latency",
    ["provider", "operation", "outcome"],
)
LLM_COST = Counter(
    "atlas_llm_cost_brl_cents",
    "Cumulative LLM cost in BRL cents",
    ["model", "task"],
)
MODEL_DISAGREEMENT = Counter(
    "atlas_model_disagreement_total",
    "Cases where models disagree materially",
    ["pair"],
)
DATA_INCONSISTENCY = Counter(
    "atlas_data_inconsistency_total",
    "Detected data inconsistencies",
    ["kind"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class Veredicto(str, Enum):
    APROVADO = "APROVADO"
    APROVADO_COM_RESTRICAO = "APROVADO_COM_RESTRICAO"
    PENDENTE_REVISAO_HUMANA = "PENDENTE_REVISAO_HUMANA"
    REPROVADO = "REPROVADO"


class Produto(str, Enum):
    ANTECIPACAO_RECEBIVEIS = "antecipacao_recebiveis"
    CONTA_COM_CREDITO = "conta_com_credito"
    MAQUININHA = "maquininha"


class RegimeTributario(str, Enum):
    SIMPLES_NACIONAL = "simples_nacional"
    LUCRO_PRESUMIDO = "lucro_presumido"
    LUCRO_REAL = "lucro_real"
    MEI = "mei"


class Socio(BaseModel):
    cpf_hash: str = Field(min_length=8, max_length=128)
    participacao: float = Field(ge=0.0, le=1.0)


class OriginacaoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(default_factory=lambda: f"REQ-{uuid.uuid4().hex[:12]}")
    cnpj: str = Field(min_length=14, max_length=18)
    produto: Produto
    valor_solicitado_brl: Decimal = Field(gt=0)
    razao_social: str
    data_abertura: datetime
    regime_tributario: RegimeTributario
    faturamento_declarado_brl_mes: Decimal = Field(ge=0)
    openfinance_consentido: bool = False
    socios: list[Socio] = Field(min_length=1, max_length=10)

    @field_validator("cnpj")
    @classmethod
    def normalize_cnpj(cls, v: str) -> str:
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) != 14:
            raise ValueError("CNPJ deve conter 14 dígitos")
        return digits


class Driver(BaseModel):
    feature: str
    valor: float | int | str
    peso: float


class DecisaoResponse(BaseModel):
    decisao_id: str
    veredicto: Veredicto
    limite_aprovado_brl: Decimal | None
    valor_solicitado_brl: Decimal | None = None
    valor_aprovado_brl: Decimal | None = None
    taxa_aa: float | None = None
    prazo_max_dias: int | None = None
    score_pd_90d: float | None = None
    modelo_versao: str
    cashflow_versao: str | None = None
    policy_versao: str
    drivers: list[Driver]
    fontes_consultadas: list[str]
    flags: list[str] = Field(default_factory=list)
    explicacao_humana: str
    tempo_decisao_ms: int
    custo_brl: Decimal
    modelos_chamados: list[str]
    shadow_versao: str | None = None
    degraded_modes: list[str] = Field(default_factory=list)


class CobrancaRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case_id: str
    tipo: Literal["atraso_recente", "atraso_persistente", "preventivo"]
    cnpj_hash: str
    fatura_id: str
    valor_brl: Decimal = Field(gt=0)
    dias_atraso: int = Field(ge=0)
    tentativas_anteriores: list[dict[str, Any]] = []
    perfil_cliente: dict[str, Any] = {}


class EstrategiaResponse(BaseModel):
    estrategia_id: str
    case_id: str
    acao: str
    horario_disparo_recomendado: datetime
    canal: Literal["whatsapp", "email", "sms", "ligacao", "boleto_2via", "aguardar"]
    template_id: str
    mensagem_gerada: str | None
    valor_brl: Decimal
    modelos_consultados: list[dict[str, Any]]
    validacao_template: Literal["ok", "fallback_template", "rejected"]
    validacao_pii: Literal["ok", "rejected"]
    validacao_levenshtein: float | None
    tempo_decisao_ms: int
    custo_brl: Decimal


class FeedbackRequest(BaseModel):
    decisao_id: str
    analista_id: str
    veredicto_humano: Literal["concordo", "discordo", "discordo_com_motivo"]
    motivo: str | None = None
    novo_limite_brl: Decimal | None = None


# ---------------------------------------------------------------------------
# Stubs (em produção, vêm dos pacotes internos)
# ---------------------------------------------------------------------------
class FeatureSnapshot(BaseModel):
    cnpj_hash: str
    features: dict[str, Any]
    timestamp: datetime
    completeness: float  # fração de features não nulas
    stale_features: list[str] = []


class BureauOutage(Exception):
    pass


class LLMTimeout(Exception):
    pass


# Os clientes abaixo são stubs. Em produção: clientes reais com pool, retries,
# circuit breaker (atlas.platform.*).
class FeatureStoreClient:
    async def get_snapshot(self, cnpj_hash: str) -> FeatureSnapshot:
        # Aqui faz lookup em Feast online store + Postgres.
        await asyncio.sleep(0.012)
        return FeatureSnapshot(
            cnpj_hash=cnpj_hash,
            features={
                "atraso_medio_60d": 4.2,
                "tempo_relacionamento_meses": 18,
                "n_atrasos_12m": 1,
                "score_serasa_pj": 612,
                "score_quod_pj": 588,
                "media_diaria_30d": 4830.50,
                "cashflow_volatilidade": 0.42,
            },
            timestamp=datetime.now(timezone.utc),
            completeness=0.92,
        )


class BureauClient:
    def __init__(self, providers: list[str], timeout_s: float = 1.2):
        self.providers = providers
        self.timeout_s = timeout_s

    async def fetch(self, cnpj: str) -> dict[str, Any]:
        # Fluxo real: tenta Serasa, fallback para Boa Vista.
        # Circuit breaker em atlas.platform.bureau.
        results: dict[str, Any] = {}
        for provider in self.providers:
            t0 = time.perf_counter()
            outcome = "ok"
            try:
                # async with httpx.AsyncClient(timeout=self.timeout_s) as client: ...
                await asyncio.sleep(0.086 if provider == "serasa" else 0.31)
                results[provider] = {"score": 612 if provider == "serasa" else 588, "ok": True}
            except (httpx.TimeoutException, httpx.HTTPError) as e:
                outcome = "error"
                logger.warning("bureau call failed", extra={"provider": provider, "err": str(e)})
                continue
            finally:
                EXTERNAL_CALL.labels(provider=provider, operation="fetch", outcome=outcome).observe(
                    time.perf_counter() - t0
                )

        if not results:
            raise BureauOutage("all bureau providers failed")
        return results


class LLMRouter:
    """Gateway interno que decide qual modelo chamar e gerencia fallback/cost."""

    async def call(
        self,
        task: str,
        prompt: str,
        max_tokens: int = 512,
        timeout_s: float = 4.0,
    ) -> dict[str, Any]:
        t0 = time.perf_counter()
        try:
            await asyncio.sleep(0.151)  # placeholder
            cost_cents = 38  # 0.038 BRL para sonnet curto
            LLM_COST.labels(model="sonnet", task=task).inc(cost_cents)
            return {
                "text": "Justificativa gerada pelo LLM (placeholder).",
                "model": "claude-sonnet-4-20250514",
                "input_tokens": 1842,
                "output_tokens": 187,
                "cost_brl": Decimal("0.038"),
                "latency_ms": int((time.perf_counter() - t0) * 1000),
                "cache_hit": False,
            }
        except asyncio.TimeoutError as e:
            raise LLMTimeout(str(e)) from e


class PolicyEngine:
    """Carrega política versionada do git e expõe regras."""

    version = "policy-cred-2026-q2-r3"

    def cap_exposure(self, faturamento_mensal: Decimal) -> Decimal:
        # cobertura 1.3x do faturamento médio
        return faturamento_mensal / Decimal("1.3")

    def cashflow_cap(self, sugerido: Decimal) -> Decimal:
        return sugerido * Decimal("0.6")

    def cold_start_cap(self) -> Decimal:
        return Decimal("8000")

    def requires_human(
        self,
        valor: Decimal,
        flags: list[str],
        fraud_score: float,
        llm_second_opinion_alert: bool,
    ) -> tuple[bool, str | None]:
        if valor > Decimal("500000"):
            return True, "ticket acima de R$ 500k vai para comitê"
        if fraud_score > 0.30 and llm_second_opinion_alert:
            return True, "fraude moderada + LLM-segunda-opiniao em alerta"
        if "cold_start_alta_exposicao" in flags:
            return True, "cold-start com exposição acima do automático"
        return False, None


class AuditWriter:
    async def write(self, decision: dict[str, Any]) -> None:
        # Em produção: write WORM em S3 + Postgres.
        pass


class EventBus:
    async def publish(self, topic: str, payload: dict[str, Any]) -> None:
        # Em produção: producer Kafka com particionamento por cnpj_hash.
        pass


# ---------------------------------------------------------------------------
# Agentes (stubs com a forma esperada da saída)
# ---------------------------------------------------------------------------
class CreditRiskAgent:
    version = "risk-pj-v7.4.2"

    async def score(self, snapshot: FeatureSnapshot, bureau: dict[str, Any]) -> dict[str, Any]:
        # Em produção: chama serving (BentoML) com o modelo XGBoost.
        return {
            "pd_90d": 0.087,
            "limite_sugerido_brl": Decimal("65000"),
            "drivers": [
                {"feature": "atraso_medio_60d", "valor": 4.2, "peso": -0.18},
                {"feature": "tempo_relacionamento_meses", "valor": 18, "peso": 0.11},
                {"feature": "score_serasa_pj", "valor": 612, "peso": 0.09},
            ],
            "model_version": self.version,
        }


class CashflowForecastAgent:
    version = "cashflow-fcst-v3.2.1"

    async def forecast(self, snapshot: FeatureSnapshot) -> dict[str, Any]:
        return {
            "cashflow_min_30d": Decimal("-4200"),
            "dias_em_deficit_30d": 22,
            "model_version": self.version,
            "alerta": True,
        }


class FraudAgent:
    version = "fraud-pj-v5.1.0"

    async def score(self, snapshot: FeatureSnapshot) -> dict[str, Any]:
        return {"score": 0.08, "block": False, "model_version": self.version}


class CollectionStrategyAgent:
    version_pay_prob = "pay-prob-v4.3.0"
    version_channel = "channel-uplift-v2.5.1"

    async def strategize(self, req: CobrancaRequest) -> dict[str, Any]:
        return {
            "acao": "envio_pix_cobranca_whatsapp",
            "canal": "whatsapp",
            "template_id": "TPL-COBR-CORDIAL-PIX-V12",
            "models": {
                "pay_prob": {"version": self.version_pay_prob, "prob_pagto_7d": 0.62},
                "channel_uplift": {
                    "version": self.version_channel,
                    "uplift": {"whatsapp": 0.31, "email": 0.08, "ligacao": 0.22, "sms": 0.14},
                },
            },
        }


# ---------------------------------------------------------------------------
# Lifespan e DI
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.feature_store = FeatureStoreClient()
    app.state.bureau = BureauClient(providers=["serasa", "quod"])
    app.state.llm = LLMRouter()
    app.state.policy = PolicyEngine()
    app.state.audit = AuditWriter()
    app.state.events = EventBus()
    app.state.credit_agent = CreditRiskAgent()
    app.state.cashflow_agent = CashflowForecastAgent()
    app.state.fraud_agent = FraudAgent()
    app.state.collection_agent = CollectionStrategyAgent()
    logger.info("atlas-decision started", extra={"policy_version": PolicyEngine.version})
    yield
    logger.info("atlas-decision stopped")


app = FastAPI(
    title="atlas-decision",
    version="2.14.3",
    description="Atlas — serviço de decisão de crédito e cobrança",
    lifespan=lifespan,
)
FastAPIInstrumentor.instrument_app(app)


# ---------------------------------------------------------------------------
# Middleware: trace_id propagation + structured logging
# ---------------------------------------------------------------------------
@app.middleware("http")
async def add_trace(request: Request, call_next):
    trace_id = request.headers.get("x-trace-id") or uuid.uuid4().hex
    request.state.trace_id = trace_id
    started = time.perf_counter()
    try:
        response = await call_next(request)
    finally:
        elapsed = (time.perf_counter() - started) * 1000
        logger.info(
            "request",
            extra={
                "trace_id": trace_id,
                "method": request.method,
                "path": request.url.path,
                "elapsed_ms": round(elapsed, 1),
            },
        )
    response.headers["x-trace-id"] = trace_id
    return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def new_decision_id() -> str:
    return f"DEC-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}-{uuid.uuid4().hex[:8]}"


def cnpj_hash(cnpj: str) -> str:
    # Em produção: hash com salt rotacionado.
    import hashlib

    return hashlib.sha256(cnpj.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.post(
    "/v1/decisao/originacao",
    response_model=DecisaoResponse,
    tags=["decisao"],
)
async def decisao_originacao(
    body: OriginacaoRequest,
    request: Request,
    x_idempotency_key: Annotated[str | None, Header()] = None,
) -> DecisaoResponse:
    """
    Originação de crédito. Síncrono (SLO p95 800ms).

    Fluxo:
      1. snapshot de features
      2. bureau (com fallback)
      3. modelo de risco + cashflow + fraud em paralelo
      4. detecção de divergências (declared vs Open Finance, modelos entre si)
      5. aplicação de política (caps, requires_human)
      6. justificativa LLM (não-bloqueante)
      7. persistência + evento
    """
    t0 = time.perf_counter()
    trace_id = request.state.trace_id
    decisao_id = new_decision_id()
    cnpj_h = cnpj_hash(body.cnpj)
    degraded: list[str] = []

    fs: FeatureStoreClient = app.state.feature_store
    bureau: BureauClient = app.state.bureau
    policy: PolicyEngine = app.state.policy
    credit_agent: CreditRiskAgent = app.state.credit_agent
    cashflow_agent: CashflowForecastAgent = app.state.cashflow_agent
    fraud_agent: FraudAgent = app.state.fraud_agent
    llm: LLMRouter = app.state.llm

    with tracer.start_as_current_span("decisao.originacao") as span:
        span.set_attribute("decisao_id", decisao_id)
        span.set_attribute("produto", body.produto.value)

        # 1. snapshot
        snapshot = await fs.get_snapshot(cnpj_h)

        if snapshot.completeness < 0.7:
            degraded.append("feature_snapshot_incomplete")
            logger.warning(
                "low_feature_completeness",
                extra={"trace_id": trace_id, "completeness": snapshot.completeness},
            )

        # 2. bureau (com fallback)
        bureau_data: dict[str, Any] = {}
        try:
            bureau_data = await bureau.fetch(body.cnpj)
        except BureauOutage:
            degraded.append("bureau_outage")
            logger.error("bureau_outage_fallback_engaged", extra={"trace_id": trace_id})

        # 3. modelos em paralelo
        risk_task = asyncio.create_task(credit_agent.score(snapshot, bureau_data))
        cashflow_task = asyncio.create_task(cashflow_agent.forecast(snapshot))
        fraud_task = asyncio.create_task(fraud_agent.score(snapshot))
        risk_out, cashflow_out, fraud_out = await asyncio.gather(
            risk_task, cashflow_task, fraud_task
        )

        # 4. consistency checks
        flags: list[str] = []

        # 4.1. faturamento declarado vs Open Finance inferido
        declared = body.faturamento_declarado_brl_mes
        of_inferred = Decimal(str(snapshot.features.get("media_diaria_30d", 0))) * Decimal("21")
        if declared and of_inferred:
            diff_pct = abs(declared - of_inferred) / declared
            if diff_pct > Decimal("0.25"):
                flags.append("divergencia_faturamento")
                DATA_INCONSISTENCY.labels(kind="faturamento_vs_openfinance").inc()
                logger.info(
                    "data_inconsistency",
                    extra={
                        "trace_id": trace_id,
                        "kind": "faturamento_vs_openfinance",
                        "declared": float(declared),
                        "inferred": float(of_inferred),
                        "diff_pct": float(diff_pct),
                    },
                )

        # 4.2. desacordo entre modelos (risk diz aprova, cashflow diz alerta)
        risk_signal_approve = risk_out["pd_90d"] < 0.10
        cashflow_alert = cashflow_out.get("alerta", False)
        model_disagreement = risk_signal_approve and cashflow_alert
        if model_disagreement:
            flags.append("cashflow_alerta")
            MODEL_DISAGREEMENT.labels(pair="risk_vs_cashflow").inc()
            logger.warning(
                "model_disagreement",
                extra={
                    "trace_id": trace_id,
                    "risk_signal": "approve",
                    "cashflow_signal": "block",
                    "policy_action": "cap_exposure_60pct",
                },
            )

        # 5. política
        sugerido = Decimal(str(risk_out["limite_sugerido_brl"]))
        cap_cobertura = policy.cap_exposure(declared)
        limite = min(sugerido, cap_cobertura)
        if model_disagreement:
            limite = min(limite, policy.cashflow_cap(sugerido))

        # cold-start
        meses_cnpj = (datetime.now(timezone.utc) - body.data_abertura.replace(tzinfo=timezone.utc)).days / 30
        if meses_cnpj < 6 and not body.openfinance_consentido:
            limite = min(limite, policy.cold_start_cap())
            flags.append("cold_start")

        # 6. requires_human?
        needs_human, reason = policy.requires_human(
            valor=limite,
            flags=flags,
            fraud_score=fraud_out["score"],
            llm_second_opinion_alert=False,
        )

        veredicto = (
            Veredicto.PENDENTE_REVISAO_HUMANA
            if needs_human
            else Veredicto.APROVADO_COM_RESTRICAO
            if flags
            else Veredicto.APROVADO
        )

        # 7. justificativa LLM (não-bloqueante; se falhar, decisão segue sem texto)
        explicacao = ""
        models_called = [risk_out["model_version"], cashflow_out["model_version"], fraud_out["model_version"]]
        cost = Decimal("0.043")  # bureau + infra base
        try:
            llm_out = await asyncio.wait_for(
                llm.call(
                    task="justificativa",
                    prompt=f"...justificativa para decisão {decisao_id}...",
                ),
                timeout=4.5,
            )
            explicacao = llm_out["text"]
            cost += llm_out["cost_brl"]
            models_called.append(f"llm({llm_out['model']})")
        except (LLMTimeout, asyncio.TimeoutError):
            degraded.append("llm_justificativa_timeout")
            explicacao = (
                "Decisão emitida sem justificativa textual (LLM indisponível). "
                f"Drivers principais: {', '.join(d['feature'] for d in risk_out['drivers'][:3])}."
            )

        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        DECISION_LATENCY.labels(
            endpoint="originacao", veredicto=veredicto.value, policy_version=policy.version
        ).observe(elapsed_ms / 1000.0)
        DECISION_COUNT.labels(
            endpoint="originacao", veredicto=veredicto.value, degraded=str(bool(degraded)).lower()
        ).inc()

        response = DecisaoResponse(
            decisao_id=decisao_id,
            veredicto=veredicto,
            limite_aprovado_brl=limite,
            valor_solicitado_brl=body.valor_solicitado_brl,
            valor_aprovado_brl=min(body.valor_solicitado_brl, limite),
            taxa_aa=0.0312,
            prazo_max_dias=45,
            score_pd_90d=risk_out["pd_90d"],
            modelo_versao=risk_out["model_version"],
            cashflow_versao=cashflow_out["model_version"],
            policy_versao=policy.version,
            drivers=[Driver(**d) for d in risk_out["drivers"]],
            fontes_consultadas=list(bureau_data.keys()) + ["openfinance", "feature_store"],
            flags=flags,
            explicacao_humana=explicacao,
            tempo_decisao_ms=elapsed_ms,
            custo_brl=cost,
            modelos_chamados=models_called,
            shadow_versao=None,
            degraded_modes=degraded,
        )

        # 8. persiste e emite evento
        await app.state.audit.write(response.model_dump(mode="json"))
        await app.state.events.publish(
            "atlas.case.decision.v2",
            {
                "decisao_id": decisao_id,
                "cnpj_hash": cnpj_h,
                "veredicto": veredicto.value,
                "policy_version": policy.version,
            },
        )

        return response


@app.post(
    "/v1/decisao/reanalise",
    response_model=DecisaoResponse,
    tags=["decisao"],
)
async def decisao_reanalise(
    body: OriginacaoRequest,
    request: Request,
) -> DecisaoResponse:
    """Reanalise por evento. Mesma lógica da originação, mas roda em assíncrono
    (consumer Kafka), e o cliente HTTP raramente bate aqui — é mais usado para
    forçar reanalise via UI."""
    return await decisao_originacao(body, request)


@app.post(
    "/v1/cobranca/estrategia",
    response_model=EstrategiaResponse,
    tags=["cobranca"],
)
async def cobranca_estrategia(
    body: CobrancaRequest,
    request: Request,
) -> EstrategiaResponse:
    t0 = time.perf_counter()
    trace_id = request.state.trace_id
    estrategia_id = f"STR-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}-{uuid.uuid4().hex[:6]}"
    agent: CollectionStrategyAgent = app.state.collection_agent
    llm: LLMRouter = app.state.llm

    with tracer.start_as_current_span("cobranca.estrategia") as span:
        span.set_attribute("estrategia_id", estrategia_id)
        span.set_attribute("dias_atraso", body.dias_atraso)

        # 1. agente decide canal/template (modelos + regras)
        out = await agent.strategize(body)

        # 2. LLM gera mensagem; validador checa contra template
        mensagem = ""
        validacao_levenshtein = None
        validacao_template = "ok"
        custo = Decimal("0.0")
        try:
            llm_out = await asyncio.wait_for(
                llm.call(task="mensagem_cobranca", prompt=f"...template {out['template_id']}..."),
                timeout=2.5,
            )
            mensagem = llm_out["text"]
            custo += llm_out["cost_brl"]
            # Em produção, valida Levenshtein contra template recuperado:
            validacao_levenshtein = 0.04
            if validacao_levenshtein > 0.15:
                validacao_template = "fallback_template"
                mensagem = "Olá, identificamos uma fatura em aberto. Pague pelo PIX-cobrança a seguir."
                logger.warning(
                    "llm_message_rejected_levenshtein",
                    extra={"trace_id": trace_id, "case_id": body.case_id, "lev": validacao_levenshtein},
                )
        except (LLMTimeout, asyncio.TimeoutError):
            mensagem = "Olá, identificamos uma fatura em aberto. Pague pelo PIX-cobrança a seguir."
            validacao_template = "fallback_template"
            logger.warning("llm_timeout_cobranca_fallback_template", extra={"trace_id": trace_id})

        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        return EstrategiaResponse(
            estrategia_id=estrategia_id,
            case_id=body.case_id,
            acao=out["acao"],
            horario_disparo_recomendado=datetime.now(timezone.utc),
            canal=out["canal"],
            template_id=out["template_id"],
            mensagem_gerada=mensagem,
            valor_brl=body.valor_brl,
            modelos_consultados=[
                {"modelo": "pay-prob-v4", "saida": out["models"]["pay_prob"]},
                {"modelo": "channel-uplift-v2", "saida": out["models"]["channel_uplift"]},
            ],
            validacao_template=validacao_template,
            validacao_pii="ok",
            validacao_levenshtein=validacao_levenshtein,
            tempo_decisao_ms=elapsed_ms,
            custo_brl=custo + Decimal("0.003"),
        )


@app.get("/v1/empresa/{cnpj}/score", tags=["empresa"])
async def empresa_score(cnpj: str) -> dict[str, Any]:
    """Score corrente cacheado. Para auditoria, usar /v1/decisao/{id}."""
    return {
        "cnpj_hash": cnpj_hash(cnpj),
        "score_pd_90d": 0.087,
        "faixa_risco": "B",
        "limite_corrente_brl": "48000.00",
        "ultima_decisao_id": "DEC-2026-04-21-8f3a9b2c",
        "atualizado_em": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/v1/decisao/{decisao_id}", tags=["decisao"])
async def get_decisao(decisao_id: str) -> dict[str, Any]:
    """Recupera decisão imutável do storage. Usado por compliance e DPO."""
    # Em produção: lê do bucket WORM via index Postgres.
    return {"decisao_id": decisao_id, "status": "found"}


@app.post("/v1/decisao/{decisao_id}/feedback", tags=["decisao"])
async def feedback(decisao_id: str, body: FeedbackRequest) -> dict[str, Any]:
    if decisao_id != body.decisao_id:
        raise HTTPException(status_code=400, detail="decisao_id mismatch")
    # Persiste feedback; alimenta dataset de retrain.
    await app.state.events.publish(
        "atlas.decision.feedback.v1",
        body.model_dump(mode="json"),
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Saúde
# ---------------------------------------------------------------------------
@app.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz", tags=["health"])
async def readyz() -> dict[str, Any]:
    # Em produção: checa Postgres, Kafka, Redis, llm-router, feature store.
    return {
        "status": "ready",
        "deps": {
            "postgres": "ok",
            "kafka": "ok",
            "redis": "ok",
            "llm_router": "ok",
            "feature_store": "ok",
        },
    }


@app.get("/metrics", tags=["health"])
async def metrics() -> JSONResponse:
    return JSONResponse(
        content=generate_latest().decode("utf-8"),
        media_type="text/plain; version=0.0.4",
    )


# ---------------------------------------------------------------------------
# Tratamento de erros
# ---------------------------------------------------------------------------
@app.exception_handler(BureauOutage)
async def bureau_outage_handler(request: Request, exc: BureauOutage) -> JSONResponse:
    # Em produção isso é capturado dentro do endpoint e cai em fallback.
    # Este handler existe como rede de segurança.
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"error": "bureau_unavailable", "detail": str(exc)},
    )


@app.exception_handler(LLMTimeout)
async def llm_timeout_handler(request: Request, exc: LLMTimeout) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
        content={"error": "llm_timeout", "detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Entry point local (em produção: gunicorn + uvicorn workers via Helm chart)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend_main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        log_config=None,
    )
