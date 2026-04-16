class State:
    """Estado base del ciclo."""

    def __init__(self, name: str):
        self.name = name

    def __repr__(self):
        return f"<State {self.name}>"

