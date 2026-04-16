# Guía de Extensión de ORE v0.1

ORE está diseñado para crecer de forma modular y constitucional.

## Añadir un nuevo artículo

1. Crear articulo_IX.py
2. Definir clase con id, texto y aplica()
3. Importarlo en ocap_core.py
4. Añadirlo a la lista de artículos

## Añadir un nuevo módulo

1. Crear carpeta
2. Añadir __init__.py
3. Añadir clases mínimas
4. Integrarlo en Scheduler o Auditor

## Integrar un agente real

1. Crear wrapper que genere ContextSnapshot
2. Pasarlo por ORE
3. Aplicar políticas
4. Registrar memoria
5. Ejecutar acción

## Añadir forks fractales

1. Implementar ForkManager
2. Crear nuevas ramas con nuevos snapshots
3. Fusionar con MergeAgent

