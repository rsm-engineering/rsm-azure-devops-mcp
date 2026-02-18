// Copyright (c) RSM Engineering.
// Based on Microsoft Corporation's azure-devops-mcp, licensed under MIT.

interface McpClientInfo {
  name: string;
  version: string;
}

class UserAgentComposer {
  private _userAgent: string;
  private _mcpClientInfoAppended: boolean;

  constructor(packageVersion: string) {
    this._userAgent = `RSM.AzureDevOps.MCP.Readonly/${packageVersion} (container)`;
    this._mcpClientInfoAppended = false;
  }

  get userAgent(): string {
    return this._userAgent;
  }

  public appendMcpClientInfo(info: McpClientInfo | undefined): void {
    if (!this._mcpClientInfoAppended && info && info.name && info.version) {
      this._userAgent += ` ${info.name}/${info.version}`;
      this._mcpClientInfoAppended = true;
    }
  }
}

export { UserAgentComposer, McpClientInfo };
