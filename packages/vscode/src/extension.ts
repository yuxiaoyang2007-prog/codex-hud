import * as vscode from 'vscode';
import { showDetails } from './details-panel.js';
import { readSnapshot, watchSnapshot } from './state-watcher.js';
import { formatStatusBarText } from './status-bar.js';

export async function activate(context: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  item.command = 'codexHud.showDetails';
  item.show();

  let snapshotPath = vscode.workspace.getConfiguration('codexHud').get<string>('snapshotPath');
  let watcher: { dispose(): void } | null = null;

  const applySnapshotPath = async (nextSnapshotPath: string | undefined) => {
    watcher?.dispose();
    watcher = null;
    snapshotPath = nextSnapshotPath;

    if (!snapshotPath) {
      item.text = 'Codex HUD · no snapshot';
      return;
    }

    try {
      item.text = formatStatusBarText(await readSnapshot(snapshotPath));
    } catch {
      item.text = 'Codex HUD · snapshot error';
    }

    watcher = watchSnapshot(snapshotPath, (snapshot) => {
      item.text = formatStatusBarText(snapshot as never);
    });
  };

  const showDetailsCommand = vscode.commands.registerCommand('codexHud.showDetails', async () => {
    await showDetails(snapshotPath);
  });
  const configurationWatcher = vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (event.affectsConfiguration('codexHud.snapshotPath')) {
      await applySnapshotPath(vscode.workspace.getConfiguration('codexHud').get<string>('snapshotPath'));
    }
  });

  await applySnapshotPath(snapshotPath);
  context.subscriptions.push(item, showDetailsCommand, configurationWatcher, {
    dispose() {
      watcher?.dispose();
    }
  });
}

export function deactivate() {}
