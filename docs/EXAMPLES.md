# Example Usage

This guide provides example prompts for interacting with your Azure DevOps organization through the MCP server. All operations are **read-only**.

## Projects and Teams

### List projects

```text
List my ADO projects
```

### List teams in a project

```text
List teams in the Contoso project
```

### Find a specific project

```text
List projects and filter by name "Platform"
```

## Repositories

### List repositories

```text
List repos in the Contoso project
```

### Get repository details

```text
Get details of the "webapp" repository in the Contoso project
```

### List branches

```text
List branches in repository <repo-id>
```

### Find branches by name

```text
List branches containing "feature" in repository <repo-id>
```

### List my branches

```text
List my branches in repository <repo-id>
```

## Pull Requests

### List active pull requests

```text
List active pull requests in the Contoso project
```

### List PRs where I'm a reviewer

```text
List active pull requests in the Contoso project where I am a reviewer
```

### List PRs created by a specific user

```text
List pull requests created by user@example.com in the Contoso project
```

### Get pull request details

```text
Get pull request #1234 from repository <repo-id> and include work item references
```

### List PRs by work item assignee

```text
List active pull requests in the Contoso project where the linked work items are assigned to user@example.com
```

### View PR comment threads

```text
Show me the comment threads on pull request #1234 in repository <repo-id>
```

### View comments in a thread

```text
Show me the comments in thread #5 of pull request #1234 in repository <repo-id>
```

### Find PRs containing a commit

```text
Find pull requests containing commit abc123 in the webapp repository of the Contoso project
```

## Commits

### Recent commits on a branch

```text
Show me the last 10 commits on the main branch of the webapp repository in the Contoso project
```

### Search commits by text

```text
Search for commits mentioning "authentication" in the webapp repository of the Contoso project
```

### Commits by author

```text
Search for commits by author user@example.com in the webapp repository of the Contoso project from the last 30 days
```

### Commits in a date range

```text
Show commits in the webapp repository of the Contoso project from 2026-01-01 to 2026-01-31
```

## Search

### Search code

```text
Search code for "connectionString" across all repositories in the Contoso project
```

### Search code in a specific repo and branch

```text
Search code for "TODO" in the webapp repository on the main branch
```

### Search work items

```text
Search work items for "authentication bug" in the Contoso project
```

### Search work items by type and state

```text
Search for active bugs related to "performance" in the Contoso project
```

### Search wiki

```text
Search the wiki for "deployment guide" in the Contoso project
```

## Combining Tools

LLMs can chain multiple tool calls together. Try prompts like:

```text
List all active pull requests in the Contoso project, then for the first one show me its comment threads
```

```text
Find the webapp repository in the Contoso project, list its branches, and show recent commits on the main branch
```

```text
Search for work items about "login" in Contoso, then search the code for files related to authentication
```
