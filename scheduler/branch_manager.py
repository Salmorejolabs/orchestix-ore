class ForkManager:
    """Gestiona la creación de ramas fractales (forks) del pensamiento."""

    def create_fork(self, parent_branch: str, new_branch: str):
        return {
            "parent": parent_branch,
            "child": new_branch,
            "status": "created"
        }

