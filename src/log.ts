import * as vscode from 'vscode';

export function log(category: string, context?: any) {
  const debug = isDebugEnabled();
  if (debug === false) {
    return;
  }

  if (context === undefined) {
    logInVSCodeOutput(category);
    return;
  }

  logInVSCodeOutput(`${category}: ${JSON.stringify(context, null, 2)}`);
}

function isDebugEnabled(): boolean {
  return vscode.workspace
    .getConfiguration()
    .get('fixRelativeImportsToBaseurl.debug', false);
}

let ochannel: vscode.OutputChannel | undefined;

const logInVSCodeOutput = (msg: string) => {
  if (!ochannel) {
    ochannel = vscode.window.createOutputChannel(
      'Fix relative imports to baseUrl'
    );
  }

  ochannel.appendLine(msg);
};
