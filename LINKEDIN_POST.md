# Post para LinkedIn — Atlas

Três variações abaixo, do mais técnico ao mais narrativo. Escolha a que combina mais com o seu tom. Substitua o link do GitHub pelo seu repositório real depois do `git push`.

---

## VARIAÇÃO 1 · Técnica e direta (recomendada para audiência de eng/dados)

> 🔧 Acabei de publicar o **Atlas** — uma arquitetura de referência completa para um sistema de decisão de crédito e cobrança B2B brasileiro com IA.
>
> Não é mais uma demo de "chat com PDF". É a documentação técnica de como montar o sistema todo:
>
> ↳ **5 agentes** orquestrados via LangGraph (grafo determinístico, não supervisor-LLM — explico por quê na doc)
> ↳ **Decision engine versionado** com shadow mode, rollback em 3 minutos e auditoria por decisão
> ↳ **Modelos clássicos** (XGBoost para risco, LightGBM para cashflow, Isolation Forest para fraude) + **LLMs** só onde fazem sentido
> ↳ **RAG com mitigação de alucinação**: validação caractere-a-caractere contra templates aprovados pelo Jurídico
> ↳ **Model routing** por tarefa, com fallback Claude → GPT-4o → Llama self-hosted, e orçamento de R$ por caso
> ↳ **MLOps + LLMOps**: MLflow, eval automático, drift por PSI, prompts versionados em semver
> ↳ **Governança LGPD**: SHAP + justificativa textual grounded, audit trail WORM, RBAC por perfil
>
> A regra interna que eu mais gostei de escrever: **decisão determinística → modelo ou regra. Síntese → LLM. Decisão crítica → LLM auditando, não decidindo.**
>
> Inclui também um SPA funcional com 6 telas (originação, cobrança com timeline e comparativo de canais, monitoramento) e um backend FastAPI de referência.
>
> Tudo em open-source, MIT. Repo, doc técnica de ~50 páginas e código:
>
> 🔗 github.com/SEU_USUARIO/atlas-platform
>
> Aceito feedback de quem trabalha (ou já trabalhou) com risco de crédito PJ, cobrança ou MLOps em fintech. Quero saber o que faria diferente.
>
> #fintech #IA #MLOps #LLMOps #RiscoCredito #Brasil

---

## VARIAÇÃO 2 · Narrativa, mais pessoal

> Passei as últimas semanas escrevendo a arquitetura de um sistema que eu adoraria ter visto pronto quando comecei a trabalhar com IA em fintech.
>
> O **Atlas** é uma arquitetura de referência para decisão de crédito e cobrança inteligente B2B brasileiro. Não é um produto, é um estudo de caso técnico — mas escrito como se fosse documentação interna de engenharia, com os trade-offs reais, os incidentes que aconteceriam, os ajustes que o time faria depois de aprender na prática.
>
> Algumas coisas que estão dentro:
>
> → Por que escolher LangGraph com grafo determinístico em vez de um supervisor-LLM (postmortem do incidente fictício INC-2025-09-03 explica em detalhe)
> → Como tratar a divergência entre o modelo de risco e o modelo de cashflow quando eles discordam — quem desempata, e quando o humano entra
> → Como mitigar alucinação em mensagem de cobrança: validação contra template aprovado, distância de Levenshtein, fallback determinístico
> → Como medir o ganho real de IA descontando ciclo macroeconômico (porque "caiu 1.9pp de inadimplência" tem nuance)
> → O bug de timezone que afetou 7% das decisões de fevereiro e como prevenir
>
> Repo aberto com:
> ✦ Documentação técnica completa (18 seções)
> ✦ Frontend SPA com 6 telas operacionais
> ✦ Backend FastAPI de referência
>
> 🔗 github.com/SEU_USUARIO/atlas-platform
>
> Se você trabalha com risco PJ, cobrança ou MLOps no Brasil, comenta o que você faria diferente. Genuinamente curioso.
>
> #fintech #engenhariaDeSoftware #IA #MachineLearning

---

## VARIAÇÃO 3 · Curta, com gancho visual (para quem prefere brevidade)

> Multiagente para crédito B2B brasileiro: como eu desenharia.
>
> Acabei de publicar o **Atlas** — arquitetura de referência completa, código aberto, MIT.
>
> O que tem dentro:
>
> 🤖 5 agentes (Risk · Collection · Fraud · Revenue · Orchestrator) em LangGraph
> 📊 Modelos clássicos onde decisão é numérica, LLM só onde faz sentido
> 🔄 Decision engine versionado com shadow mode + rollback em 3min
> 🛡️ Governança LGPD: SHAP + justificativa grounded, audit WORM, RBAC
> 💰 Model routing: Claude/GPT/Llama com orçamento por caso
> 🇧🇷 Integrações pensadas para o Brasil: Serasa, Quod, Open Finance, PIX, WhatsApp
>
> Inclui SPA funcional com originação, cobrança e monitoramento + backend FastAPI.
>
> 🔗 github.com/SEU_USUARIO/atlas-platform
>
> Quem trabalha com risco PJ — me diz o que faria diferente?
>
> #fintech #IA #MLOps

---

## Dicas para a publicação

1. **Imagem/vídeo é crítico no LinkedIn.** Antes de postar:
   - Tire 2–3 screenshots das telas mais visuais (Dashboard, Análise de Crédito com pipeline, Cobrança com timeline).
   - OU grave um GIF/vídeo curto (15–30s) navegando pelas telas. Posts com mídia visual têm 2–3× mais alcance.
   - Ferramenta gratuita para gravar: ScreenToGif (Windows), Kap (Mac), Peek (Linux).

2. **Horário.** Terça a quinta, 8h–10h ou 17h–19h horário de Brasília costuma performar melhor para conteúdo técnico B2B.

3. **Primeiro comentário.** Logo após postar, comente você mesmo com o link do repo. O LinkedIn historicamente reduz alcance de posts com link no corpo principal.

4. **Marcar pessoas.** Se você conhece alguém da área (eng de risco, cientistas de dados em fintechs como Cora, Conta Simples, Stark Bank, Asaas), uma menção genuína no primeiro comentário pode disparar o algoritmo. Não force — só se fizer sentido.

5. **Hashtags.** Use 3–5 no fim, não mais. As que escolhi nas variações são as que mais entregam alcance em conteúdo técnico de fintech BR.

6. **Resposta a comentários.** Responda nos primeiros 60 minutos. Isso sinaliza ao algoritmo que o post está engajando.
