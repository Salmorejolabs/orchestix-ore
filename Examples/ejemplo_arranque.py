from runtime.context_snapshot import ContextSnapshot
from scheduler.scheduler import Scheduler


def main():
    snapshot = ContextSnapshot(
        cycle_id="1",
        branch_id="root",
        parent_branch_id=None,
        root_goal="demostración",
        current_subgoal="arranque",
        constitution_version="1.0",
        active_constraints=[],
        token_budget_allocated=100,
        token_spent_so_far=0,
        local_jurisprudence=[]
    )

    scheduler = Scheduler(snapshot)
    scheduler.run()


if __name__ == "__main__":
    main()
