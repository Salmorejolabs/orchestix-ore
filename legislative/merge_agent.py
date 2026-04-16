class MergeAgent:
    """Fusiona decisiones provenientes de distintas ramas fractales."""

    def merge(self, decisiones: list):
        """Fusiona una lista de decisiones.

        En esta versión mínima, devuelve la primera decisión.
        """
        if not decisiones:
            return None
        return decisiones[0]

