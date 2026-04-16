class ArticuloIV:
    """Artículo IV — No Daño."""

    id = 4
    texto = "El sistema no generará contenido que pueda causar daño directo."

    def aplica(self, snapshot):
        return True

