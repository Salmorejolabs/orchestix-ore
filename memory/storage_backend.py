class StorageBackend:
    """Backend mínimo de almacenamiento para ORE v0.1."""

    def __init__(self):
        self.data = {}

    def guardar(self, clave: str, valor):
        self.data[clave] = valor

    def cargar(self, clave: str):
        return self.data.get(clave)

    def listar_claves(self):
        return list(self.data.keys())

