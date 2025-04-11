'use strict';

import * as vscode from 'vscode';
import { FixRelativeImportsToBaseurlProvider } from './fixRelativeImportsToBaseurl';

// find-unused-exports:ignore-next-line-exports
export const activate = (context: vscode.ExtensionContext) => {
  console.log("ascsdfvsdf")
  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  const fixRelativeImportsToBaseurlProvider = new FixRelativeImportsToBaseurlProvider(
    vscode.workspace.workspaceFolders
  );

  let disposable: vscode.Disposable;
  disposable = vscode.commands.registerCommand(
    'fixRelativeImportsToBaseurl.one',
    async () => { await fixRelativeImportsToBaseurlProvider.fixOne() }
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand(
    'fixRelativeImportsToBaseurl.all',
    () => fixRelativeImportsToBaseurlProvider.fixAll()
  );
  disposable = vscode.commands.registerCommand(
    'fixRelativeImportsToBaseurl.comment',
    () => fixRelativeImportsToBaseurlProvider.commentAllErraneousImports()
  );
  context.subscriptions.push(disposable);
};
