import * as vscode from 'vscode';

export async function showDetails(snapshotPath: string | undefined): Promise<void> {
  if (!snapshotPath) {
    await vscode.window.showInformationMessage('Codex HUD has no snapshot configured.');
    return;
  }

  await vscode.window.showInformationMessage(`Codex HUD snapshot: ${snapshotPath}`);
}
