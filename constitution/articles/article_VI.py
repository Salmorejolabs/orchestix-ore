class ArticuloVI:
    """Artículo VI — Integridad del Ciclo."""

    id = 6
    texto = "Cada ciclo debe completarse sin violar restricciones activas."

    def aplica(self, snapshot):
        return True

