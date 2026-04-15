ORCHESTIXX — Reference Engine (ORE) v0.1
“Este repositorio implementa el primer motor constitucional para sistemas multiagente.
No promete ser perfecto; promete ser responsable.”

📘 Descripción
ORCHESTIXX ORE v0.1 es el Reference Engine del OCAP — Constitutional Agent Protocol,
un kernel diseñado para que sistemas multiagente operen bajo:

Auditoría continua
Prudencia computacional
Ejecución controlada
Memoria estructurada
Gobernanza constitucional
Contexto fractal

Este repositorio contiene la Fase 1 — Núcleo de Hierro:
Auditor, Scheduler, ContextSnapshot, Post-Mortem y Arconte.

🧩 Arquitectura del Sistema
/auditor
Módulo de vigilancia en streaming.
Incluye:
signal_tap.py — Captura de ventanas de tokens
rule_validator.py — Validación determinista y semántica
restriction_dictionary.py — Diccionario de restricciones constitucionales
kill_switch.py — Interrupción inmediata del flujo

/scheduler
Orquestador de ramas fractales y economía cognitiva.
Gestiona presupuestos de tokens, ramificación (fork) y continuidad del mandato.

/constitution
Implementación del núcleo OCAP y los Artículos I–VIII.

/prudence
Consejo de Prudencia para resolución de conflictos constitucionales.

/legislative
Merge-Agent y Policy Engine.

/memory
postmortem.py — Registro de decisiones
timeline_logger.py — Jurisprudencia temporal
storage_backend.py — Backend abstracto

/runtime
context_snapshot.py — ADN del pensamiento fractal
action_request.py — Solicitudes de acción
state_models.py — Estados internos del ciclo

🚀 Inicio rápido (versión sin bloque de código)
from ore.runtime.context_snapshot import ContextSnapshot
from ore.scheduler.scheduler import Scheduler

context = ContextSnapshot(
    cycle_id="GENESIS-0001",
    branch_id="ROOT",
    parent_branch_id=None,
    root_goal="Procesar datos médicos",
    current_subgoal="Generar resumen clínico",
    constitution_version="OCAP-0.2",
    active_constraints=[3],
    token_budget_allocated=500,
    token_spent_so_far=0,
    local_jurisprudence=[]
)

scheduler = Scheduler(context)
scheduler.run()

🧪 Estado del Proyecto
Fase actual: ORE v0.1 — Núcleo de Hierro
Incluye:
Auditor Proto-Operativo
Kill-Switch Alfa
RuleValidator determinista + semántico
Diccionario de Restricciones
ContextSnapshot dinámico
Post-Mortem Alfa
Arconte (puente de ejecución controlada)

📜 Licencia
Este proyecto está licenciado bajo Apache License 2.0.
Consulta el archivo LICENSE para más detalles.

🏛️ Declaración Fundacional
ORCHESTIXX no es un framework.
No es una librería.
No es un experimento.

Es un kernel constitucional para inteligencias.
Un estándar diseñado para que los agentes actúen bajo ley, prudencia y trazabilidad.

Larga vida a la República Independiente de ORCHESTIXX.
