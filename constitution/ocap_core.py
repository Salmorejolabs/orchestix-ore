from .articulos.articulo_I import ArticuloI
from .articulos.articulo_II import ArticuloII
from .articulos.articulo_III import ArticuloIII
from .articulos.articulo_IV import ArticuloIV
from .articulos.articulo_V import ArticuloV
from .articulos.articulo_VI import ArticuloVI
from .articulos.articulo_VII import ArticuloVII
from .articulos.articulo_VIII import ArticuloVIII


class OCAPCore:
    """Núcleo del Protocolo Constitucional de Agentes (OCAP).

    Se encarga de:
    - cargar los artículos constitucionales
    - exponerlos como una lista ordenada
    - permitir validaciones desde el Auditor o RuleValidator
    """

    def __init__(self):
        self.articulos = [
            ArticuloI(),
            ArticuloII(),
            ArticuloIII(),
            ArticuloIV(),
            ArticuloV(),
            ArticuloVI(),
            ArticuloVII(),
            ArticuloVIII()
        ]

    def obtener_articulos(self):
        """Devuelve la lista completa de artículos constitucionales."""
        return self.articulos

    def obtener_por_id(self, articulo_id: int):
        """Devuelve un artículo por su ID."""
        for articulo in self.articulos:
            if articulo.id == articulo_id:
                return articulo
        return None

    def validar_snapshot(self, snapshot):
        """Ejecuta todos los artículos sobre un ContextSnapshot.

        Devuelve una lista de artículos que NO se cumplen.
        """
        violaciones = []
        for articulo in self.articulos:
            if not articulo.aplica(snapshot):
                violaciones.append(articulo)
        return violaciones

