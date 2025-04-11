import * as vscode from 'vscode';
import { DELIM_MSG, getFixedImports, showInformationMessage, singularOrPlural } from './common';
import { log } from './log';

export async function fixImportsInDocument(baseUrlWithTrailingSlash: string, errs: string[]) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    log('No active text editor was found');
    return;
  }

  const document = editor.document;
  const promises = editor.selections.map((selection) => fixIt(document, selection, baseUrlWithTrailingSlash, errs));
  const response = await Promise.all(promises);
  const { textRange, imports } = response[0];
  editor.edit((editBuilder) => {
    editBuilder.replace(new vscode.Position(0, 0), imports);
  });
}

async function fixIt(
  document: vscode.TextDocument,
  sel: vscode.Selection,
  baseUrlWithTrailingSlash: string,
  errs: string[]
) {
  const textRange: vscode.Range = sel.isEmpty ? getTextRange(document) : sel;
  const selectedText = document.getText(textRange);
  const { countFixes, newCode, firstMissingImport } = getFixedImports(document.fileName, selectedText, baseUrlWithTrailingSlash);
  const imports = await getAllMissingImports(document, errs)
  return { textRange, imports };
}


export const getAllMissingImports = async (document: vscode.TextDocument, errs: string[]) => {

  console.log("checking for diagnostics")
  const missingImportDiagnostics = await getDiagnosticsAfterOpen(document.uri);
  console.log("checked for diagnostics")
  let importStatements: Set<string> = new Set<string>();
  const promises = missingImportDiagnostics.map(missingImportDiagnostic => waitForImportCodeAction(document, missingImportDiagnostic, 300000).catch(err => { console.log(err); errs.push(missingImportDiagnostic.message) }))
  console.log('promises:', promises)
  const imports = await Promise.all(promises);
  console.log('imports:', imports)
  imports.forEach(codeAction => importStatements.add((codeAction?.edit as any).c[0].edit.e))
  return Array.from(importStatements).filter(statement => statement.includes('src') || statement.includes('onecrm-client-lib') || statement.includes('../')).join('');
}

async function getDiagnosticsAfterOpen(fileUri: vscode.Uri, timeout: number = 20000): Promise<vscode.Diagnostic[]> {
  return new Promise((resolve, reject) => {
    let subscription: vscode.Disposable | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    const checkDiagnostics = () => {
      const diagnostics = vscode.languages.getDiagnostics(fileUri);
      const missingImportDiagnostics = diagnostics.filter(diag =>
        diag.severity === vscode.DiagnosticSeverity.Error &&
        diag.message.includes(`Cannot find name`)
      );
      if (missingImportDiagnostics.length > 0) {
        clearTimeout(timeoutId);
        subscription?.dispose();
        resolve(missingImportDiagnostics);
      }
    };

    subscription = vscode.languages.onDidChangeDiagnostics(event => {
      if (event.uris.some(uri => uri.toString() === fileUri.toString())) {
        checkDiagnostics();
      }
    });

    // Initial check in case diagnostics are already present
    setTimeout(() => checkDiagnostics(), 5000);

    timeoutId = setTimeout(() => {
      subscription?.dispose();
      reject(new Error(`Timeout waiting for diagnostics for ${fileUri.fsPath}`));
    }, timeout);
  });
}

async function waitForImportCodeAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  timeout: number
): Promise<vscode.CodeAction | undefined> {
  return new Promise(async (resolve, reject) => {
    let timeoutId: NodeJS.Timeout | undefined;
    let intervalId: NodeJS.Timeout | undefined;

    const checkCodeActions = async () => {
      const range = diagnostic.range;
      console.log(range)
      const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider',
        document.uri,
        range
      );

      if (codeActions) {
        const importAction = codeActions.filter(action =>
          action.title.includes('Add import') || action.title.includes('Update import')
        );

        if (importAction.length) {
          await vscode.workspace.applyEdit(importAction[importAction.length - 1]?.edit as any);
          resolve(importAction[importAction.length - 1]);
          clearTimeout(timeoutId);
          clearInterval(intervalId);
        } else {
          console.log('waiting for', diagnostic.message)

        }
      }
    };


    intervalId = setInterval(async () => await checkCodeActions(), 5000);

    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error(`Timeout waiting for import code action for diagnostic: ${diagnostic.message}`));
    }, timeout);
  });
}

function getTextRange(document: vscode.TextDocument): vscode.Range {
  const firstLine = document.lineAt(0);
  const lastLine = document.lineAt(document.lineCount - 1);
  return new vscode.Range(firstLine.range.start, lastLine.range.end);
}
