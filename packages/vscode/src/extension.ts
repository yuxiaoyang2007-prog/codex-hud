import * as vscode from 'vscode';
import { showDetails } from './details-panel.js';
import { readSnapshot } from './state-watcher.js';
import { formatStatusBarText } from './status-bar.js';

export async function activate(context: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  item.command = 'codexHud.showDetails';
  item.show();

  const snapshotPath = vscode.workspace.getConfiguration('codexHud').get<string>('snapshotPath');
  const showDetailsCommand = vscode.commands.registerCommand('codexHud.showDetails', async () => {
    await showDetails(snapshotPath);
  });

  if (!snapshotPath) {
    item.text = 'Codex HUD · no snapshot';
    context.subscriptions.push(item, showDetailsCommand);
    return;
  }

  const snapshot = await readSnapshot(snapshotPath);
  item.text = formatStatusBarText(snapshot);
  context.subscriptions.push(item, showDetailsCommand);
}

export function deactivate() {}
