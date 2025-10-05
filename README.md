# Clone
Clone is a desktop app that creates a highly personalized AI assistant by continuously recording and understanding your digital activities.

## Collaboration
### Branch Management
* No change should be pushed to `main` directly. All changes must be applied via pull request.
  * All code in `main` should be correct at (almost) all times.
* There are 3 main directories (`frontend`, `server`, `vectordb`), each for its respective component.
* There are 3 active branches for development (`frontend`, `server`, `vectordb`), each for its respective component.
  * Each branch is the most up-to-date state for the respective component.
  * Changes to each component should be made to its respective branch, ideally via pull request.
  * Collected changes to each component branch can be merged into `main` after being tested for correctness.
### Commit Message
* `[$task_id] $description`
  * `task_id`: id in [Schedule Sheet](https://docs.google.com/spreadsheets/d/1RDozyzTpZBL-NxpSjT-ezQPIt7C7JA1TW0pTQpUxRD0/edit?gid=41332019#gid=41332019)
  * `description`: short description of changes made in commit
* ex)
  * [P9] fix: dependency errors for deployment
  * [P12] implemented chat view
