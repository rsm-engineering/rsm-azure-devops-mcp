// Copyright (c) RSM Engineering.
// Based on Microsoft Corporation's azure-devops-mcp, licensed under MIT.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import {
  GitRef,
  PullRequestStatus,
  GitQueryCommitsCriteria,
  GitVersionType,
  GitVersionDescriptor,
  GitPullRequestQuery,
  GitPullRequestQueryInput,
  GitPullRequestQueryType,
  CommentThreadStatus,
  GitPullRequest,
  GitPullRequestCommentThread,
  Comment,
} from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { z } from "zod";
import { getCurrentUserDetails, getUserIdFromEmail } from "./auth.js";
import { GitRepository } from "azure-devops-node-api/interfaces/TfvcInterfaces.js";
import { getEnumKeys } from "../utils.js";
import { logger } from "../logger.js";

const REPO_TOOLS = {
  list_repos_by_project: "repo_list_repos_by_project",
  list_pull_requests_by_repo_or_project: "repo_list_pull_requests_by_repo_or_project",
  list_pull_requests_by_assigned_to: "repo_list_pull_requests_by_assigned_to",
  list_branches_by_repo: "repo_list_branches_by_repo",
  list_my_branches_by_repo: "repo_list_my_branches_by_repo",
  list_pull_request_threads: "repo_list_pull_request_threads",
  list_pull_request_thread_comments: "repo_list_pull_request_thread_comments",
  get_repo_by_name_or_id: "repo_get_repo_by_name_or_id",
  get_branch_by_name: "repo_get_branch_by_name",
  get_pull_request_by_id: "repo_get_pull_request_by_id",
  search_commits: "repo_search_commits",
  list_pull_requests_by_commits: "repo_list_pull_requests_by_commits",
};

function branchesFilterOutIrrelevantProperties(branches: GitRef[], top: number) {
  return branches
    ?.flatMap((branch) => (branch.name ? [branch.name] : []))
    ?.filter((branch) => branch.startsWith("refs/heads/"))
    .map((branch) => branch.replace("refs/heads/", ""))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, top);
}

function trimPullRequestThread(thread: GitPullRequestCommentThread) {
  return {
    id: thread.id,
    publishedDate: thread.publishedDate,
    lastUpdatedDate: thread.lastUpdatedDate,
    status: thread.status,
    comments: trimComments(thread.comments),
    threadContext: thread.threadContext,
  };
}

function trimComments(comments: Comment[] | undefined | null) {
  return comments
    ?.filter((comment) => !comment.isDeleted)
    ?.map((comment) => ({
      id: comment.id,
      author: {
        displayName: comment.author?.displayName,
        uniqueName: comment.author?.uniqueName,
      },
      content: comment.content,
      publishedDate: comment.publishedDate,
      lastUpdatedDate: comment.lastUpdatedDate,
      lastContentUpdatedDate: comment.lastContentUpdatedDate,
    }));
}

function pullRequestStatusStringToInt(status: string): number {
  switch (status) {
    case "Abandoned":
      return PullRequestStatus.Abandoned.valueOf();
    case "Active":
      return PullRequestStatus.Active.valueOf();
    case "All":
      return PullRequestStatus.All.valueOf();
    case "Completed":
      return PullRequestStatus.Completed.valueOf();
    case "NotSet":
      return PullRequestStatus.NotSet.valueOf();
    default:
      throw new Error(`Unknown pull request status: ${status}`);
  }
}

function filterReposByName(repositories: GitRepository[], repoNameFilter: string): GitRepository[] {
  const lowerCaseFilter = repoNameFilter.toLowerCase();
  return repositories?.filter((repo) => repo.name?.toLowerCase().includes(lowerCaseFilter));
}

function trimPullRequest(pr: GitPullRequest, includeDescription = false) {
  return {
    pullRequestId: pr.pullRequestId,
    codeReviewId: pr.codeReviewId,
    repository: pr.repository?.name,
    status: pr.status,
    createdBy: {
      displayName: pr.createdBy?.displayName,
      uniqueName: pr.createdBy?.uniqueName,
    },
    creationDate: pr.creationDate,
    closedDate: pr.closedDate,
    title: pr.title,
    ...(includeDescription ? { description: pr.description ?? "" } : {}),
    isDraft: pr.isDraft,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    project: pr.repository?.project?.name,
  };
}

function configureRepoTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  // ── Read-only tools ──────────────────────────────────────────────────

  server.tool(
    REPO_TOOLS.list_repos_by_project,
    "Retrieve a list of repositories for a given project",
    {
      project: z.string().describe("The name or ID of the Azure DevOps project."),
      top: z.number().default(100).describe("The maximum number of repositories to return."),
      skip: z.number().default(0).describe("The number of repositories to skip. Defaults to 0."),
      repoNameFilter: z.string().optional().describe("Optional filter to search for repositories by name. If provided, only repositories with names containing this string will be returned."),
    },
    async ({ project, top, skip, repoNameFilter }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const repositories = await gitApi.getRepositories(project, false, false, false);

        const filteredRepositories = repoNameFilter ? filterReposByName(repositories, repoNameFilter) : repositories;

        const paginatedRepositories = filteredRepositories?.sort((a, b) => a.name?.localeCompare(b.name ?? "") ?? 0).slice(skip, skip + top);

        const trimmedRepositories = paginatedRepositories?.map((repo) => ({
          id: repo.id,
          name: repo.name,
          isDisabled: repo.isDisabled,
          isFork: repo.isFork,
          isInMaintenance: repo.isInMaintenance,
          webUrl: repo.webUrl,
          size: repo.size,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(trimmedRepositories, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing repositories: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    REPO_TOOLS.list_pull_requests_by_repo_or_project,
    "Retrieve a list of pull requests for a given repository. Either repositoryId or project must be provided.",
    {
      repositoryId: z.string().optional().describe("The ID of the repository where the pull requests are located."),
      project: z.string().optional().describe("The ID of the project where the pull requests are located."),
      top: z.number().default(100).describe("The maximum number of pull requests to return."),
      skip: z.number().default(0).describe("The number of pull requests to skip."),
      created_by_me: z.boolean().default(false).describe("Filter pull requests created by the current user."),
      created_by_user: z.string().optional().describe("Filter pull requests created by a specific user (provide email or unique name). Takes precedence over created_by_me if both are provided."),
      i_am_reviewer: z.boolean().default(false).describe("Filter pull requests where the current user is a reviewer."),
      user_is_reviewer: z
        .string()
        .optional()
        .describe("Filter pull requests where a specific user is a reviewer (provide email or unique name). Takes precedence over i_am_reviewer if both are provided."),
      status: z
        .enum(getEnumKeys(PullRequestStatus) as [string, ...string[]])
        .default("Active")
        .describe("Filter pull requests by status. Defaults to 'Active'."),
      sourceRefName: z.string().optional().describe("Filter pull requests from this source branch (e.g., 'refs/heads/feature-branch')."),
      targetRefName: z.string().optional().describe("Filter pull requests into this target branch (e.g., 'refs/heads/main')."),
    },
    async ({ repositoryId, project, top, skip, created_by_me, created_by_user, i_am_reviewer, user_is_reviewer, status, sourceRefName, targetRefName }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        const searchCriteria: {
          status: number;
          repositoryId?: string;
          creatorId?: string;
          reviewerId?: string;
          sourceRefName?: string;
          targetRefName?: string;
        } = {
          status: pullRequestStatusStringToInt(status),
        };

        if (!repositoryId && !project) {
          return {
            content: [{ type: "text", text: "Either repositoryId or project must be provided." }],
            isError: true,
          };
        }

        if (repositoryId) searchCriteria.repositoryId = repositoryId;
        if (sourceRefName) searchCriteria.sourceRefName = sourceRefName;
        if (targetRefName) searchCriteria.targetRefName = targetRefName;

        if (created_by_user) {
          try {
            const userId = await getUserIdFromEmail(created_by_user, tokenProvider, connectionProvider, userAgentProvider);
            searchCriteria.creatorId = userId;
          } catch (error) {
            return {
              content: [{ type: "text", text: `Error finding user with email ${created_by_user}: ${error instanceof Error ? error.message : String(error)}` }],
              isError: true,
            };
          }
        } else if (created_by_me) {
          const data = await getCurrentUserDetails(tokenProvider, connectionProvider, userAgentProvider);
          searchCriteria.creatorId = data.authenticatedUser.id;
        }

        if (user_is_reviewer) {
          try {
            const reviewerUserId = await getUserIdFromEmail(user_is_reviewer, tokenProvider, connectionProvider, userAgentProvider);
            searchCriteria.reviewerId = reviewerUserId;
          } catch (error) {
            return {
              content: [{ type: "text", text: `Error finding reviewer with email ${user_is_reviewer}: ${error instanceof Error ? error.message : String(error)}` }],
              isError: true,
            };
          }
        } else if (i_am_reviewer) {
          const data = await getCurrentUserDetails(tokenProvider, connectionProvider, userAgentProvider);
          searchCriteria.reviewerId = data.authenticatedUser.id;
        }

        let pullRequests;
        if (repositoryId) {
          pullRequests = await gitApi.getPullRequests(repositoryId, searchCriteria, project, undefined, skip, top);
        } else if (project) {
          pullRequests = await gitApi.getPullRequestsByProject(project, searchCriteria, undefined, skip, top);
        } else {
          return {
            content: [{ type: "text", text: "Either repositoryId or project must be provided." }],
            isError: true,
          };
        }

        const filteredPullRequests = pullRequests?.map((pr) => trimPullRequest(pr));

        return {
          content: [{ type: "text", text: JSON.stringify(filteredPullRequests, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing pull requests: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // ── NEW: Filter PRs by linked work item assignee ─────────────────────

  server.tool(
    REPO_TOOLS.list_pull_requests_by_assigned_to,
    "List pull requests that have linked work items assigned to a specific user email. Fetches PRs, resolves their linked work items, and filters by the AssignedTo field.",
    {
      project: z.string().describe("The project name or ID (required)."),
      repositoryId: z.string().optional().describe("Optional repository ID to narrow the search."),
      assignedToEmail: z.string().describe("The email address to match against the AssignedTo field of linked work items."),
      status: z
        .enum(getEnumKeys(PullRequestStatus) as [string, ...string[]])
        .default("Active")
        .describe("Filter pull requests by status. Defaults to 'Active'."),
      top: z.number().default(50).describe("Maximum number of PRs to scan (before filtering). Defaults to 50."),
    },
    async ({ project, repositoryId, assignedToEmail, status, top }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const witApi = await connection.getWorkItemTrackingApi();

        const searchCriteria: { status: number; repositoryId?: string } = {
          status: pullRequestStatusStringToInt(status),
        };
        if (repositoryId) searchCriteria.repositoryId = repositoryId;

        // 1. Fetch PRs
        let pullRequests: GitPullRequest[];
        if (repositoryId) {
          pullRequests = await gitApi.getPullRequests(repositoryId, searchCriteria, project, undefined, 0, top);
        } else {
          pullRequests = await gitApi.getPullRequestsByProject(project, searchCriteria, undefined, 0, top);
        }

        if (!pullRequests || pullRequests.length === 0) {
          return { content: [{ type: "text", text: "[]" }] };
        }

        // 2. For each PR, get linked work item refs and check assignee
        const matchingPrs: ReturnType<typeof trimPullRequest>[] = [];
        const lowerEmail = assignedToEmail.toLowerCase();

        for (const pr of pullRequests) {
          try {
            const prRepoId = pr.repository?.id ?? repositoryId;
            if (!prRepoId || pr.pullRequestId === undefined) continue;

            const workItemRefs = await gitApi.getPullRequestWorkItemRefs(prRepoId, pr.pullRequestId, project);

            if (!workItemRefs || workItemRefs.length === 0) continue;

            // Batch fetch work items (max 200 per call)
            const workItemIds = workItemRefs
              .map((ref) => {
                const parts = ref.url?.split("/");
                return parts ? parseInt(parts[parts.length - 1], 10) : NaN;
              })
              .filter((id) => !isNaN(id));

            if (workItemIds.length === 0) continue;

            const workItems = await witApi.getWorkItems(workItemIds, ["System.AssignedTo"], undefined, undefined, undefined, project);

            const hasMatchingAssignee = workItems?.some((wi) => {
              const assignedTo = wi.fields?.["System.AssignedTo"];
              if (!assignedTo) return false;
              // AssignedTo can be a string or an object with uniqueName/displayName
              if (typeof assignedTo === "string") {
                return assignedTo.toLowerCase().includes(lowerEmail);
              }
              const uniqueName = (assignedTo as { uniqueName?: string }).uniqueName ?? "";
              return uniqueName.toLowerCase() === lowerEmail;
            });

            if (hasMatchingAssignee) {
              matchingPrs.push(trimPullRequest(pr));
            }
          } catch (error) {
            logger.warn(`Failed to check work items for PR #${pr.pullRequestId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify(matchingPrs, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing pull requests by assigned to: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // ── PR threads & comments ────────────────────────────────────────────

  server.tool(
    REPO_TOOLS.list_pull_request_threads,
    "Retrieve a list of comment threads for a pull request.",
    {
      repositoryId: z.string().describe("The ID of the repository where the pull request is located."),
      pullRequestId: z.number().describe("The ID of the pull request for which to retrieve threads."),
      project: z.string().optional().describe("Project ID or project name (optional)"),
      iteration: z.number().optional().describe("The iteration ID for which to retrieve threads. Optional, defaults to the latest iteration."),
      baseIteration: z.number().optional().describe("The base iteration ID for which to retrieve threads. Optional, defaults to the latest base iteration."),
      top: z.number().default(100).describe("The maximum number of threads to return after filtering."),
      skip: z.number().default(0).describe("The number of threads to skip after filtering."),
      fullResponse: z.boolean().optional().default(false).describe("Return full thread JSON response instead of trimmed data."),
      status: z
        .enum(getEnumKeys(CommentThreadStatus) as [string, ...string[]])
        .optional()
        .describe("Filter threads by status. If not specified, returns threads of all statuses."),
      authorEmail: z.string().optional().describe("Filter threads by the email of the thread author (first comment author)."),
      authorDisplayName: z.string().optional().describe("Filter threads by the display name of the thread author (first comment author). Case-insensitive partial matching."),
    },
    async ({ repositoryId, pullRequestId, project, iteration, baseIteration, top, skip, fullResponse, status, authorEmail, authorDisplayName }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        const threads = await gitApi.getThreads(repositoryId, pullRequestId, project, iteration, baseIteration);

        let filteredThreads = threads;

        if (status !== undefined) {
          const statusValue = CommentThreadStatus[status as keyof typeof CommentThreadStatus];
          filteredThreads = filteredThreads?.filter((thread) => thread.status === statusValue);
        }

        if (authorEmail !== undefined) {
          filteredThreads = filteredThreads?.filter((thread) => {
            const firstComment = thread.comments?.[0];
            return firstComment?.author?.uniqueName?.toLowerCase() === authorEmail.toLowerCase();
          });
        }

        if (authorDisplayName !== undefined) {
          const lowerAuthorName = authorDisplayName.toLowerCase();
          filteredThreads = filteredThreads?.filter((thread) => {
            const firstComment = thread.comments?.[0];
            return firstComment?.author?.displayName?.toLowerCase().includes(lowerAuthorName);
          });
        }

        const paginatedThreads = filteredThreads?.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)).slice(skip, skip + top);

        if (fullResponse) {
          return { content: [{ type: "text", text: JSON.stringify(paginatedThreads, null, 2) }] };
        }

        const trimmedThreads = paginatedThreads?.map((thread) => trimPullRequestThread(thread));
        return { content: [{ type: "text", text: JSON.stringify(trimmedThreads, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing pull request threads: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    REPO_TOOLS.list_pull_request_thread_comments,
    "Retrieve a list of comments in a pull request thread.",
    {
      repositoryId: z.string().describe("The ID of the repository where the pull request is located."),
      pullRequestId: z.number().describe("The ID of the pull request for which to retrieve thread comments."),
      threadId: z.number().describe("The ID of the thread for which to retrieve comments."),
      project: z.string().optional().describe("Project ID or project name (optional)"),
      top: z.number().default(100).describe("The maximum number of comments to return."),
      skip: z.number().default(0).describe("The number of comments to skip."),
      fullResponse: z.boolean().optional().default(false).describe("Return full comment JSON response instead of trimmed data."),
    },
    async ({ repositoryId, pullRequestId, threadId, project, top, skip, fullResponse }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        const comments = await gitApi.getComments(repositoryId, pullRequestId, threadId, project);
        const paginatedComments = comments?.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)).slice(skip, skip + top);

        if (fullResponse) {
          return { content: [{ type: "text", text: JSON.stringify(paginatedComments, null, 2) }] };
        }

        const trimmedComments = trimComments(paginatedComments);
        return { content: [{ type: "text", text: JSON.stringify(trimmedComments, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing pull request thread comments: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // ── Branches ─────────────────────────────────────────────────────────

  server.tool(
    REPO_TOOLS.list_branches_by_repo,
    "Retrieve a list of branches for a given repository.",
    {
      repositoryId: z.string().describe("The ID of the repository where the branches are located."),
      top: z.number().default(100).describe("The maximum number of branches to return. Defaults to 100."),
      filterContains: z.string().optional().describe("Filter to find branches that contain this string in their name."),
    },
    async ({ repositoryId, top, filterContains }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const branches = await gitApi.getRefs(repositoryId, undefined, "heads/", undefined, undefined, undefined, undefined, undefined, filterContains);
        const filteredBranches = branchesFilterOutIrrelevantProperties(branches, top);
        return { content: [{ type: "text", text: JSON.stringify(filteredBranches, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing branches: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    REPO_TOOLS.list_my_branches_by_repo,
    "Retrieve a list of my branches for a given repository Id.",
    {
      repositoryId: z.string().describe("The ID of the repository where the branches are located."),
      top: z.number().default(100).describe("The maximum number of branches to return."),
      filterContains: z.string().optional().describe("Filter to find branches that contain this string in their name."),
    },
    async ({ repositoryId, top, filterContains }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const branches = await gitApi.getRefs(repositoryId, undefined, "heads/", undefined, undefined, true, undefined, undefined, filterContains);
        const filteredBranches = branchesFilterOutIrrelevantProperties(branches, top);
        return { content: [{ type: "text", text: JSON.stringify(filteredBranches, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing my branches: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // ── Single-entity getters ────────────────────────────────────────────

  server.tool(
    REPO_TOOLS.get_repo_by_name_or_id,
    "Get the repository by project and repository name or ID.",
    {
      project: z.string().describe("Project name or ID where the repository is located."),
      repositoryNameOrId: z.string().describe("Repository name or ID."),
    },
    async ({ project, repositoryNameOrId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const repositories = await gitApi.getRepositories(project);
        const repository = repositories?.find((repo) => repo.name === repositoryNameOrId || repo.id === repositoryNameOrId);
        if (!repository) {
          return {
            content: [{ type: "text", text: `Repository ${repositoryNameOrId} not found in project ${project}` }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(repository, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting repository: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    REPO_TOOLS.get_branch_by_name,
    "Get a branch by its name.",
    {
      repositoryId: z.string().describe("The ID of the repository where the branch is located."),
      branchName: z.string().describe("The name of the branch to retrieve, e.g., 'main' or 'feature-branch'."),
    },
    async ({ repositoryId, branchName }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const branches = await gitApi.getRefs(repositoryId, undefined, "heads/", false, false, undefined, false, undefined, branchName);
        const branch = branches.find((b) => b.name === `refs/heads/${branchName}` || b.name === branchName);
        if (!branch) {
          return {
            content: [{ type: "text", text: `Branch ${branchName} not found in repository ${repositoryId}` }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(branch, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting branch: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    REPO_TOOLS.get_pull_request_by_id,
    "Get a pull request by its ID.",
    {
      repositoryId: z.string().describe("The ID of the repository where the pull request is located."),
      pullRequestId: z.number().describe("The ID of the pull request to retrieve."),
      includeWorkItemRefs: z.boolean().optional().default(false).describe("Whether to reference work items associated with the pull request."),
      includeLabels: z.boolean().optional().default(false).describe("Whether to include a summary of labels in the response."),
    },
    async ({ repositoryId, pullRequestId, includeWorkItemRefs, includeLabels }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const pullRequest = await gitApi.getPullRequest(repositoryId, pullRequestId, undefined, undefined, undefined, undefined, undefined, includeWorkItemRefs);

        if (includeLabels) {
          try {
            const projectId = pullRequest.repository?.project?.id;
            const projectName = pullRequest.repository?.project?.name;
            const labels = await gitApi.getPullRequestLabels(repositoryId, pullRequestId, projectName, projectId);
            const labelNames = labels.map((label) => label.name).filter((name) => name !== undefined);
            return {
              content: [{ type: "text", text: JSON.stringify({ ...pullRequest, labelSummary: { labels: labelNames, labelCount: labelNames.length } }, null, 2) }],
            };
          } catch (error) {
            logger.warn(`Error fetching PR labels: ${error instanceof Error ? error.message : "Unknown error"}`);
            return {
              content: [{ type: "text", text: JSON.stringify({ ...pullRequest, labelSummary: {} }, null, 2) }],
            };
          }
        }
        return { content: [{ type: "text", text: JSON.stringify(pullRequest, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting pull request: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // ── Commits ──────────────────────────────────────────────────────────

  const gitVersionTypeStrings = Object.values(GitVersionType).filter((value): value is string => typeof value === "string");

  server.tool(
    REPO_TOOLS.search_commits,
    "Search for commits in a repository with comprehensive filtering capabilities. Supports searching by description/comment text, time range, author, committer, specific commit IDs, and more.",
    {
      project: z.string().describe("Project name or ID"),
      repository: z.string().describe("Repository name or ID"),
      fromCommit: z.string().optional().describe("Starting commit ID"),
      toCommit: z.string().optional().describe("Ending commit ID"),
      version: z.string().optional().describe("The name of the branch, tag or commit to filter commits by"),
      versionType: z
        .enum(gitVersionTypeStrings as [string, ...string[]])
        .optional()
        .default(GitVersionType[GitVersionType.Branch])
        .describe("The meaning of the version parameter, e.g., branch, tag or commit"),
      skip: z.number().optional().default(0).describe("Number of commits to skip"),
      top: z.number().optional().default(10).describe("Maximum number of commits to return"),
      includeLinks: z.boolean().optional().default(false).describe("Include commit links"),
      includeWorkItems: z.boolean().optional().default(false).describe("Include associated work items"),
      searchText: z.string().optional().describe("Search text to filter commits by description/comment. Supports partial matching."),
      author: z.string().optional().describe("Filter commits by author email or display name"),
      authorEmail: z.string().optional().describe("Filter commits by exact author email address"),
      committer: z.string().optional().describe("Filter commits by committer email or display name"),
      committerEmail: z.string().optional().describe("Filter commits by exact committer email address"),
      fromDate: z.string().optional().describe("Filter commits from this date (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')"),
      toDate: z.string().optional().describe("Filter commits to this date (ISO 8601 format, e.g., '2024-12-31T23:59:59Z')"),
      commitIds: z.array(z.string()).optional().describe("Array of specific commit IDs to retrieve. When provided, other filters are ignored except top/skip."),
      historySimplificationMode: z.enum(["FirstParent", "SimplifyMerges", "FullHistory", "FullHistorySimplifyMerges"]).optional().describe("How to simplify the commit history"),
    },
    async ({ project, repository, fromCommit, toCommit, version, versionType, skip, top, includeLinks, includeWorkItems, searchText, author, authorEmail, committer, committerEmail, fromDate, toDate, commitIds, historySimplificationMode }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        if (commitIds && commitIds.length > 0) {
          const commits = [];
          const batchSize = Math.min(top || 10, commitIds.length);
          const startIndex = skip || 0;
          const endIndex = Math.min(startIndex + batchSize, commitIds.length);
          const requestedCommitIds = commitIds.slice(startIndex, endIndex);

          for (const commitId of requestedCommitIds) {
            try {
              const searchCriteria: GitQueryCommitsCriteria = {
                includeLinks, includeWorkItems,
                fromCommitId: commitId, toCommitId: commitId,
              };
              const commitResults = await gitApi.getCommits(repository, searchCriteria, project, 0, 1);
              if (commitResults && commitResults.length > 0) commits.push(commitResults[0]);
            } catch (error) {
              logger.warn(`Failed to retrieve commit ${commitId}: ${error instanceof Error ? error.message : String(error)}`);
              commits.push({ commitId, error: `Failed to retrieve: ${error instanceof Error ? error.message : String(error)}` });
            }
          }
          return { content: [{ type: "text", text: JSON.stringify(commits, null, 2) }] };
        }

        const searchCriteria: GitQueryCommitsCriteria = {
          fromCommitId: fromCommit, toCommitId: toCommit,
          includeLinks, includeWorkItems,
        };

        if (author) searchCriteria.author = author;
        if (fromDate) searchCriteria.fromDate = fromDate;
        if (toDate) searchCriteria.toDate = toDate;

        if (historySimplificationMode) {
          const extendedCriteria = searchCriteria as GitQueryCommitsCriteria & { historySimplificationMode?: string };
          extendedCriteria.historySimplificationMode = historySimplificationMode;
        }

        if (version) {
          const itemVersion: GitVersionDescriptor = {
            version,
            versionType: GitVersionType[versionType as keyof typeof GitVersionType],
          };
          searchCriteria.itemVersion = itemVersion;
        }

        const commits = await gitApi.getCommits(repository, searchCriteria, project, skip, top);
        let filteredCommits = commits;

        if (searchText && filteredCommits) {
          filteredCommits = filteredCommits.filter((c) => c.comment?.toLowerCase().includes(searchText.toLowerCase()));
        }
        if (authorEmail && filteredCommits) {
          filteredCommits = filteredCommits.filter((c) => c.author?.email?.toLowerCase() === authorEmail.toLowerCase());
        }
        if (committer && filteredCommits) {
          filteredCommits = filteredCommits.filter((c) => c.committer?.name?.toLowerCase().includes(committer.toLowerCase()) || c.committer?.email?.toLowerCase().includes(committer.toLowerCase()));
        }
        if (committerEmail && filteredCommits) {
          filteredCommits = filteredCommits.filter((c) => c.committer?.email?.toLowerCase() === committerEmail.toLowerCase());
        }

        return { content: [{ type: "text", text: JSON.stringify(filteredCommits, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error searching commits: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  const pullRequestQueryTypesStrings = Object.values(GitPullRequestQueryType).filter((value): value is string => typeof value === "string");

  server.tool(
    REPO_TOOLS.list_pull_requests_by_commits,
    "Lists pull requests by commit IDs to find which pull requests contain specific commits",
    {
      project: z.string().describe("Project name or ID"),
      repository: z.string().describe("Repository name or ID"),
      commits: z.array(z.string()).describe("Array of commit IDs to query for"),
      queryType: z
        .enum(pullRequestQueryTypesStrings as [string, ...string[]])
        .optional()
        .default(GitPullRequestQueryType[GitPullRequestQueryType.LastMergeCommit])
        .describe("Type of query to perform"),
    },
    async ({ project, repository, commits, queryType }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        const query: GitPullRequestQuery = {
          queries: [
            {
              items: commits,
              type: GitPullRequestQueryType[queryType as keyof typeof GitPullRequestQueryType],
            } as GitPullRequestQueryInput,
          ],
        };

        const queryResult = await gitApi.getPullRequestQuery(query, repository, project);
        return { content: [{ type: "text", text: JSON.stringify(queryResult, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error querying pull requests by commits: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
}

export { REPO_TOOLS, configureRepoTools };
