class ContextSnapshot:
    """Representa el estado cognitivo de un ciclo del sistema."""

    def __init__(
        self,
        cycle_id: str,
        branch_id: str,
        parent_branch_id: str | None,
        root_goal: str,
        current_subgoal: str,
        constitution_version: str,
        active_constraints: list[int],
        token_budget_allocated: int,
        token_spent_so_far: int,
        local_jurisprudence: list
    ):
        self.cycle_id = cycle_id
        self.branch_id = branch_id
        self.parent_branch_id = parent_branch_id
        self.root_goal = root_goal
        self.current_subgoal = current_subgoal
        self.constitution_version = constitution_version
        self.active_constraints = active_constraints
        self.token_budget_allocated = token_budget_allocated
        self.token_spent_so_far = token_spent_so_far
        self.local_jurisprudence = local_jurisprudence

    def summary(self):
        return {
            "cycle": self.cycle_id,
            "branch": self.branch_id,
            "goal": self.root_goal,
            "subgoal": self.current_subgoal
        }

