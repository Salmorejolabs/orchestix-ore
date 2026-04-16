# Arquitectura de ORE v0.1

ORE está organizado en módulos que representan órganos funcionales del sistema. Cada órgano tiene responsabilidades claras y se comunica con los demás mediante estructuras de datos bien definidas.

## Órganos principales

### 1. Runtime
Define el estado cognitivo del ciclo:
- ContextSnapshot
- State
- ActionRequest

### 2. Scheduler
Orquesta el ciclo cognitivo:
- asignación de presupuesto
- ejecución de ramas
- control de forks

### 3. Constitución (OCAP)
Contiene los Artículos I–VIII y el núcleo OCAP:
- principios legales
- transparencia
- prudencia
- coherencia
- gobernanza fractal

### 4. Auditor
Supervisa el flujo:
- inspección de snapshots
- validación de reglas
- kill switch

### 5. Prudencia
Consejo de prudencia:
- detección de conflictos
- resolución de tensiones

### 6. Legislativo
Traduce constitución → políticas:
- PolicyEngine
- MergeAgent

### 7. Memoria
Registra y conserva:
- timeline
- postmortem
- almacenamiento

## Diagrama ASCII

                ┌───────────────────────┐
                │       Scheduler        │
                └──────────┬────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
 ┌──────────────┐                     ┌────────────────┐
 │    Runtime    │                     │    Auditor     │
 └──────┬────────┘                     └──────┬─────────┘
        │                                     │
 ┌──────┴────────┐                     ┌──────┴─────────┐
 │ Constitución   │                     │   Prudencia     │
 └──────┬────────┘                     └──────┬─────────┘
        │                                     │
        └──────────────┬──────────────────────┘
                       │
                 ┌─────┴──────┐
                 │   Memoria   │
                 └─────────────┘

