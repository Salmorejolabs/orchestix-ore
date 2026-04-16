class TimelineLogger:
    """Registra eventos del ciclo para auditoría posterior."""

    def __init__(self):
        self.eventos = []

    def log(self, mensaje: str):
        self.eventos.append(mensaje)

    def obtener_eventos(self):
        return self.eventos

