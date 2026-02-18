# How to Make Your Experience Better

Follow the steps in the [Getting Started guide](./GETTINGSTARTED.md) to deploy the server and connect your MCP client.

## Tips for Better Results

### Provide project context early

Most tools require a project name or ID. Start your session by listing projects so the LLM has context:

```text
List my ADO projects
```

Once you have the project name, subsequent prompts will be more efficient.

### Use specific prompts

Be specific about what you want. Instead of "show me PRs", try:

```text
List active pull requests in the Contoso project where I am a reviewer
```

### Customize Copilot instructions

If you use VS Code with GitHub Copilot, add custom instructions to your `.github/copilot-instructions.md`:

```markdown
## Using MCP Server for Azure DevOps

When searching code in Azure DevOps, always specify the project name. When listing pull requests, default to active status. Show results in a rendered markdown table where possible.
```

### Use different models

Different LLM models may respond better to certain prompts. If one model struggles with your request, try switching models in your MCP client.

### Limit tool domains

If you're only working with repositories and don't need search, ask your admin to register you with limited domains:

```json
{
  "domains": "core,repositories"
}
```

This reduces the number of tools exposed to the LLM, which can improve tool selection accuracy.

## PAT Scope Recommendations

For the best experience, ensure your Azure DevOps PAT has these read scopes:

| Scope | Tools Enabled |
|-------|---------------|
| **Project and Team (Read)** | `core_list_projects`, `core_list_project_teams` |
| **Code (Read)** | All `repo_*` tools, `search_code` |
| **Work Items (Read)** | `search_workitem` |
| **Wiki (Read)** | `search_wiki` |
| **Identity (Read)** | `core_get_identity_ids` |
