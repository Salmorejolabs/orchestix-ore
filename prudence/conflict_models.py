class Conflict:
    """Representa un conflicto entre artículos constitucionales."""

    def __init__(self, articulo_a, articulo_b, snapshot):
        self.articulo_a = articulo_a
        self.articulo_b = articulo_b
        self.snapshot = snapshot

    def describe(self):
        return {
            "articulo_a": self.articulo_a.id,
            "articulo_b": self.articulo_b.id,
            "detalle": "Conflicto detectado entre artículos."
        }

