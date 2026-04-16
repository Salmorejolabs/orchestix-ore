class PolicyEngine:
    """Motor legislativo encargado de aplicar políticas sobre acciones propuestas."""

    def __init__(self, ocap_core):
        self.ocap = ocap_core

    def evaluar_accion(self, action_request, snapshot):
        """Evalúa si una acción cumple con la constitución.

        En esta versión mínima, siempre devuelve True.
        """
        return True

    def generar_politicas_activas(self, snapshot):
        """Devuelve una lista de políticas activas basadas en los artículos.

        En esta versión mínima, simplemente devuelve los IDs de los artículos.
        """
        return [art.id for art in self.ocap.obtener_articulos()]

