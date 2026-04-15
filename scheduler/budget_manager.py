class BudgetManager:
    """Gestiona el presupuesto de tokens asignado a cada ciclo."""

    def __init__(self, allocated: int):
        self.allocated = allocated
        self.spent = 0

    def consume(self, amount: int):
        self.spent += amount
        return self.remaining()

    def remaining(self):
        return self.allocated - self.spent

