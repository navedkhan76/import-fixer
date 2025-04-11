import * as fs from 'fs';
// import * as glob from 'glob';
import * as path from 'path';
import * as vscode from 'vscode';
// import {
//   DELIM_MSG,
//   getFixedImports,
//   showInformationMessage,
//   singularOrPlural,
// } from './common';
// import { pathResolve } from './fsUtils';
import { log } from './log';
// import { getAllMissingImports } from './view';
// import { ChildProcess, exec } from 'child_process';
// import { error } from 'console';

export async function commentErraneousImports(
  workspaceRoot: string,
  _baseUrlWithTrailingSlash: string
) {
  const logFilePath = path.join(workspaceRoot, 'build.log');
  let errorObjects: { [x: string]: { [x: string]: vscode.Range } } = {}
  console.log('started')
  await new Promise(async (res, _rej) => {
    fs.readFile(logFilePath, 'utf-8', async (_err, data) => {
      const missingImportErrors = data.match(/(Error:)(.*ts)(:?)(.*)( - error (TS2306|TS2305):.*)/g);
      // console.log('missingImportErrors:', missingImportErrors)
      let count = 1;
      missingImportErrors?.forEach(error => {
        const srcFile = /src.*ts:/.exec(error)?.[0]?.split(':')[0] ?? '';
        const missingImportSymbol = /\'[^"\s].*[^"]\'/.exec(error)?.[0] ?? '';
        const missingImportLine = /[\d]+:[\d]+/.exec(error)?.[0];
        const lineNumber = parseInt(missingImportLine?.split(':')?.[0] ?? '0');
        const columnNumber = parseInt(missingImportLine?.split(':')?.[1] ?? '0');
        const range = new vscode.Range(new vscode.Position(lineNumber - 1, 0), new vscode.Position(lineNumber - 1, columnNumber + (missingImportSymbol?.length ?? 0) - 2))
        if (errorObjects[srcFile]) {
          if (!errorObjects[srcFile][missingImportSymbol]) {
            errorObjects[srcFile][missingImportSymbol] = range;
          }
        } else {
          errorObjects[srcFile] = { [missingImportSymbol]: range };
        }

      })
      console.log('Erraneous files', Object.keys(errorObjects).length);
      const promises = [];
      for (let index = 0; index < Object.keys(errorObjects).length; index++) {
        promises.push(commentImport(errorObjects, index, workspaceRoot));
      }
      await Promise.allSettled(promises);
      res(0);
    })
  });
  console.log("finished")
}
async function commentImport(errorObjects: { [x: string]: { [x: string]: vscode.Range; }; }, index: number, workspaceRoot: string) {
  const fileName = Object.keys(errorObjects)[index];
  console.log('fileName:', fileName);
  const filePath = vscode.Uri.file(path.join(workspaceRoot, fileName));
  const document = await vscode.workspace.openTextDocument(filePath);
  const workspaceEdit = new vscode.WorkspaceEdit();
  for (let erraneousImport in errorObjects[fileName]) {
    workspaceEdit.insert(document.uri, errorObjects[fileName][erraneousImport].start, '//');
  }
  await vscode.workspace.applyEdit(workspaceEdit);
  await document.save();
}

export async function fixImportsInAllFiles(
  workspaceRoot: string,
  _baseUrlWithTrailingSlash: string
) {
  const logFilePath = path.join(workspaceRoot, 'build.log');
  let errorObjects: { [x: string]: { [x: string]: vscode.Range } } = {}
  console.log('started')
  await new Promise(async (res, _rej) => {
    fs.readFile(logFilePath, 'utf-8', async (_err, data) => {
      const missingImportErrors = data.match(/(Error:)(.*ts)(:?)(.*)(Cannot find name.*)/g);
      let count = 1;
      missingImportErrors?.forEach(error => {
        const srcFile = /src.*\.ts:/.exec(error)?.[0].split(':')[0] ?? '';
        const missingImportSymbol = /\'.*\'\./.exec(error)?.[0].split('.')[0] ?? '';
        const missingImportLine = /[\d]+:[\d]+/.exec(error)?.[0];
        const lineNumber = parseInt(missingImportLine?.split(':')?.[0] ?? '0');
        const columnNumber = parseInt(missingImportLine?.split(':')?.[1] ?? '0');
        const range = new vscode.Range(new vscode.Position(lineNumber - 1, columnNumber - 1), new vscode.Position(lineNumber - 1, columnNumber + (missingImportSymbol?.length ?? 0) - 3))
        if (errorObjects[srcFile]) {
          if (!errorObjects[srcFile][missingImportSymbol]) {
            errorObjects[srcFile][missingImportSymbol] = range;
          }
        } else {
          errorObjects[srcFile] = { [missingImportSymbol]: range };
        }

      })
      console.log('Erraneous files', Object.keys(errorObjects).length)
      for (let index = 0; index < Object.keys(errorObjects).length; index += 1) {
        console.log('index:', index + 1)
        const filePath = Object.keys(errorObjects)[index];
        await fixImportsInDocument(workspaceRoot, filePath, errorObjects);
      }
      res(0);
    })
  });
  console.log("finished")
}

async function fixImportsInDocument(workspaceRoot: string, filePath: string, errorObjects: { [x: string]: { [x: string]: vscode.Range; }; }) {
  console.log('filePath:', filePath)
  try {
    const fileUri = vscode.Uri.file(path.join(workspaceRoot, filePath));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
    let changes: vscode.CodeAction[] = [];
    let promises = [];
    for (let missingImport in errorObjects[filePath]) {
      promises.push((async () => {
        const importAction = await getImportsCode(document, errorObjects[filePath][missingImport], 180000);
        if (importAction?.edit) {
          changes.push(importAction);
        }
      })())
    }
    await Promise.allSettled(promises);
    promises = changes.map(async (change) => {
      if (change.edit) {
        await vscode.workspace.applyEdit(change.edit);
      }
    })
    await Promise.allSettled(promises);
    await document.save();
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  } catch (error) {
    console.log(error);
  }
}

async function getImportsCode(
  document: vscode.TextDocument,
  range: vscode.Range,
  timeout: number
): Promise<vscode.CodeAction | undefined> {
  return new Promise(async (resolve, reject) => {
    let timeoutId: NodeJS.Timeout | undefined;
    let intervalId: NodeJS.Timeout | undefined;

    const checkCodeActions = async () => {
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
          clearTimeout(timeoutId);
          clearInterval(intervalId);
          resolve(importAction[importAction.length - 1]);
        } else {
          console.log('waiting at', document.fileName, 'for', range)
        }
      }
    };


    intervalId = setInterval(async () => await checkCodeActions(), 5000);
    await checkCodeActions();
    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error(`Timeout waiting for import code action for diagnostic: ${document.fileName}`));
    }, timeout);
  });
}



// function getSrcFolders(): string[] {
//   return vscode.workspace
//     .getConfiguration()
//     .get('fixRelativeImportsToBaseurl.sources', ['src/app']);
// }

// async function fixIt(filePath: string, baseUrlWithTrailingSlash: string, errs: string[] = []): Promise<number> {
//   try {
//     const fileUri = vscode.Uri.file(filePath);
//     const document = await vscode.workspace.openTextDocument(fileUri);
//     const fileContent = document.getText();

//     // Check if the file content matches the regex.
//     if (/(import\s+[^;]+?\s+from\s*["'])([^"'\n]+)(\/services.module|(?<!onecrm-model)\/model|\/utils|\/common.module)(["'];?)/.test(fileContent)) {
//       await vscode.window.showTextDocument(document);
//       const imports = await getAllMissingImports(document, errs);
//       if (imports.length) {

//         vscode.window.activeTextEditor?.edit((editBuilder) => {
//           editBuilder.replace(new vscode.Position(0, 0), imports);
//         });
//         console.log('Added imports were', imports)
//       } else {
//         console.log('found it to be correct')
//       }
//       await document.save();
//       await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
//     } else {
//       console.log("Do not contain imports that need to be corrected");
//     }
//   } catch (error) {
//     console.log((error as any).message)
//   }
//   return 0;
// }
