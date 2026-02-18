# Toolset

This server exposes **18 read-only tools** across three domains: Core, Repositories, and Search.

## Overview

| Domain | Tool | Description |
|--------|------|-------------|
| Core | [core_list_projects](#core_list_projects) | List all projects in the organization |
| Core | [core_list_project_teams](#core_list_project_teams) | List teams within a project |
| Core | [core_get_identity_ids](#core_get_identity_ids) | Retrieve identity IDs by search filter |
| Repositories | [repo_list_repos_by_project](#repo_list_repos_by_project) | List all repositories in a project |
| Repositories | [repo_get_repo_by_name_or_id](#repo_get_repo_by_name_or_id) | Get repository details by name or ID |
| Repositories | [repo_list_branches_by_repo](#repo_list_branches_by_repo) | List all branches in a repository |
| Repositories | [repo_list_my_branches_by_repo](#repo_list_my_branches_by_repo) | List branches created by the current user |
| Repositories | [repo_get_branch_by_name](#repo_get_branch_by_name) | Get details of a specific branch |
| Repositories | [repo_search_commits](#repo_search_commits) | Search for commits with comprehensive filters |
| Repositories | [repo_list_pull_requests_by_repo_or_project](#repo_list_pull_requests_by_repo_or_project) | List pull requests with optional filters |
| Repositories | [repo_list_pull_requests_by_assigned_to](#repo_list_pull_requests_by_assigned_to) | List PRs by linked work item assignee |
| Repositories | [repo_get_pull_request_by_id](#repo_get_pull_request_by_id) | Get details of a specific pull request |
| Repositories | [repo_list_pull_request_threads](#repo_list_pull_request_threads) | List comment threads on a pull request |
| Repositories | [repo_list_pull_request_thread_comments](#repo_list_pull_request_thread_comments) | List comments in a specific thread |
| Repositories | [repo_list_pull_requests_by_commits](#repo_list_pull_requests_by_commits) | Find pull requests containing specific commits |
| Search | [search_code](#search_code) | Search for code across repositories |
| Search | [search_wiki](#search_wiki) | Search wiki pages by keywords |
| Search | [search_workitem](#search_workitem) | Search work items by text and filters |

## Core

### core_list_projects

Retrieve a list of projects in your Azure DevOps organization.

- **Required**: None
- **Optional**:
  - `stateFilter` (string) — Filter projects by state: `all`, `wellFormed`, `createPending`, `deleted`. Default: `wellFormed`
  - `top` (number) — Maximum number of projects to return. Default: 100
  - `skip` (number) — Number of projects to skip for pagination. Default: 0
  - `continuationToken` (number) — Continuation token for paginated results
  - `projectNameFilter` (string) — Filter projects by name (partial match)

### core_list_project_teams

Retrieve a list of teams for the specified Azure DevOps project.

- **Required**:
  - `project` (string) — The name or ID of the Azure DevOps project
- **Optional**:
  - `mine` (boolean) — If true, only return teams the authenticated user is a member of
  - `top` (number) — Maximum number of teams to return. Default: 100
  - `skip` (number) — Number of teams to skip for pagination. Default: 0

### core_get_identity_ids

Retrieve Azure DevOps identity IDs for a provided search filter.

- **Required**:
  - `searchFilter` (string) — Search filter (unique name, display name, email) to retrieve identity IDs for
- **Optional**: None

## Repositories

### repo_list_repos_by_project

Retrieve a list of repositories for a given project.

- **Required**:
  - `project` (string) — The name or ID of the Azure DevOps project
- **Optional**:
  - `top` (number) — Maximum number of repositories to return. Default: 100
  - `skip` (number) — Number of repositories to skip. Default: 0
  - `repoNameFilter` (string) — Filter repositories by name (partial match)

### repo_get_repo_by_name_or_id

Get the repository by project and repository name or ID.

- **Required**:
  - `project` (string) — Project name or ID
  - `repositoryNameOrId` (string) — Repository name or ID

### repo_list_branches_by_repo

Retrieve a list of branches for a given repository.

- **Required**:
  - `repositoryId` (string) — The ID of the repository
- **Optional**:
  - `top` (number) — Maximum number of branches to return. Default: 100
  - `filterContains` (string) — Filter branches by name (partial match)

### repo_list_my_branches_by_repo

Retrieve a list of branches created by the current user for a given repository.

- **Required**:
  - `repositoryId` (string) — The ID of the repository
- **Optional**:
  - `top` (number) — Maximum number of branches to return. Default: 100
  - `filterContains` (string) — Filter branches by name (partial match)

### repo_get_branch_by_name

Get a branch by its name.

- **Required**:
  - `repositoryId` (string) — The ID of the repository
  - `branchName` (string) — The name of the branch (e.g., `main` or `feature-branch`)

### repo_search_commits

Search for commits in a repository with comprehensive filtering capabilities.

- **Required**:
  - `project` (string) — Project name or ID
  - `repository` (string) — Repository name or ID
- **Optional**:
  - `searchText` (string) — Search text to filter commits by description/comment
  - `author` (string) — Filter by author email or display name
  - `authorEmail` (string) — Filter by exact author email address
  - `committer` (string) — Filter by committer email or display name
  - `committerEmail` (string) — Filter by exact committer email address
  - `fromDate` (string) — Filter from this date (ISO 8601)
  - `toDate` (string) — Filter to this date (ISO 8601)
  - `fromCommit` (string) — Starting commit ID
  - `toCommit` (string) — Ending commit ID
  - `version` (string) — Branch, tag, or commit name to filter by
  - `versionType` (string) — Meaning of the version parameter: `Branch`, `Tag`, `Commit`
  - `commitIds` (string[]) — Array of specific commit IDs to retrieve
  - `skip` (number) — Number of commits to skip. Default: 0
  - `top` (number) — Maximum number of commits to return. Default: 10
  - `includeLinks` (boolean) — Include commit links. Default: false
  - `includeWorkItems` (boolean) — Include associated work items. Default: false
  - `historySimplificationMode` (string) — How to simplify history: `FirstParent`, `SimplifyMerges`, `FullHistory`, `FullHistorySimplifyMerges`

### repo_list_pull_requests_by_repo_or_project

Retrieve a list of pull requests. Either `repositoryId` or `project` must be provided.

- **Required**: None (but either `repositoryId` or `project` must be provided)
- **Optional**:
  - `repositoryId` (string) — The ID of the repository
  - `project` (string) — The project name or ID
  - `top` (number) — Maximum number of pull requests to return. Default: 100
  - `skip` (number) — Number of pull requests to skip. Default: 0
  - `status` (string) — Filter by status: `Abandoned`, `Active`, `All`, `Completed`, `NotSet`. Default: `Active`
  - `created_by_me` (boolean) — Filter PRs created by the current user. Default: false
  - `created_by_user` (string) — Filter PRs created by a specific user (email or unique name)
  - `i_am_reviewer` (boolean) — Filter PRs where the current user is a reviewer. Default: false
  - `user_is_reviewer` (string) — Filter PRs where a specific user is a reviewer (email or unique name)
  - `sourceRefName` (string) — Filter by source branch (e.g., `refs/heads/feature-branch`)
  - `targetRefName` (string) — Filter by target branch (e.g., `refs/heads/main`)

### repo_list_pull_requests_by_assigned_to

List pull requests that have linked work items assigned to a specific user. Fetches PRs, resolves their linked work items, and filters by the AssignedTo field.

- **Required**:
  - `project` (string) — The project name or ID
  - `assignedToEmail` (string) — Email address to match against the AssignedTo field
- **Optional**:
  - `repositoryId` (string) — Repository ID to narrow the search
  - `status` (string) — Filter by PR status. Default: `Active`
  - `top` (number) — Maximum number of PRs to scan (before filtering). Default: 50

### repo_get_pull_request_by_id

Get a pull request by its ID.

- **Required**:
  - `repositoryId` (string) — The ID of the repository
  - `pullRequestId` (number) — The ID of the pull request
- **Optional**:
  - `includeWorkItemRefs` (boolean) — Include associated work item references. Default: false
  - `includeLabels` (boolean) — Include a summary of labels. Default: false

### repo_list_pull_request_threads

Retrieve comment threads for a pull request.

- **Required**:
  - `repositoryId` (string) — The ID of the repository
  - `pullRequestId` (number) — The ID of the pull request
- **Optional**:
  - `project` (string) — Project ID or name
  - `iteration` (number) — Iteration ID (defaults to latest)
  - `baseIteration` (number) — Base iteration ID
  - `top` (number) — Maximum number of threads to return. Default: 100
  - `skip` (number) — Number of threads to skip. Default: 0
  - `fullResponse` (boolean) — Return full JSON instead of trimmed data. Default: false
  - `status` (string) — Filter by thread status
  - `authorEmail` (string) — Filter by thread author email
  - `authorDisplayName` (string) — Filter by thread author display name (partial match)

### repo_list_pull_request_thread_comments

Retrieve comments in a pull request thread.

- **Required**:
  - `repositoryId` (string) — The ID of the repository
  - `pullRequestId` (number) — The ID of the pull request
  - `threadId` (number) — The ID of the thread
- **Optional**:
  - `project` (string) — Project ID or name
  - `top` (number) — Maximum number of comments to return. Default: 100
  - `skip` (number) — Number of comments to skip. Default: 0
  - `fullResponse` (boolean) — Return full JSON instead of trimmed data. Default: false

### repo_list_pull_requests_by_commits

Find pull requests containing specific commits.

- **Required**:
  - `project` (string) — Project name or ID
  - `repository` (string) — Repository name or ID
  - `commits` (string[]) — Array of commit IDs to query for
- **Optional**:
  - `queryType` (string) — Type of query to perform. Default: `LastMergeCommit`

## Search

### search_code

Search Azure DevOps repositories for code matching a search text.

- **Required**:
  - `searchText` (string) — Keywords to search for in code repositories
- **Optional**:
  - `project` (string[]) — Filter by project names
  - `repository` (string[]) — Filter by repository names
  - `path` (string[]) — Filter by file paths
  - `branch` (string[]) — Filter by branch names
  - `includeFacets` (boolean) — Include facets in results. Default: false
  - `skip` (number) — Number of results to skip. Default: 0
  - `top` (number) — Maximum number of results to return. Default: 5

### search_wiki

Search Azure DevOps Wiki for pages matching a search text.

- **Required**:
  - `searchText` (string) — Keywords to search for in wiki pages
- **Optional**:
  - `project` (string[]) — Filter by project names
  - `wiki` (string[]) — Filter by wiki names
  - `includeFacets` (boolean) — Include facets in results. Default: false
  - `skip` (number) — Number of results to skip. Default: 0
  - `top` (number) — Maximum number of results to return. Default: 10

### search_workitem

Search Azure DevOps work items by text and filters.

- **Required**:
  - `searchText` (string) — Text to search for in work items
- **Optional**:
  - `project` (string[]) — Filter by project names
  - `areaPath` (string[]) — Filter by area paths
  - `workItemType` (string[]) — Filter by work item types (e.g., `Bug`, `User Story`)
  - `state` (string[]) — Filter by work item states (e.g., `Active`, `Closed`)
  - `assignedTo` (string[]) — Filter by assigned users
  - `includeFacets` (boolean) — Include facets in results. Default: false
  - `skip` (number) — Number of results to skip. Default: 0
  - `top` (number) — Maximum number of results to return. Default: 10
