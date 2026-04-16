class ActionRequest:
    """Solicitud de acción emitida por un agente o módulo."""

    def __init__(self, action_type: str, payload: dict | None = None):
        self.action_type = action_type
        self.payload = payload or {}

    def describe(self):
        return {
            "type": self.action_type,
            "payload": self.payload
        }

