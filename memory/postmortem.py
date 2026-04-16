class Postmortem:
    """Genera un informe postmortem del ciclo cognitivo."""

    def __init__(self, snapshot, eventos):
        self.snapshot = snapshot
        self.eventos = eventos

    def generar_informe(self):
        return {
            "ciclo": self.snapshot.cycle_id,
            "rama": self.snapshot.branch_id,
            "eventos": self.eventos
        }

