import * as path from 'path';
import * as vscode from 'vscode';
import { pathResolve } from './fsUtils';
import { log } from './log';

export const DELIM_MSG =
  '------------------------------------------------------------------------';

export function showInformationMessage(msg: string) {
  vscode.window.showInformationMessage(msg);
}

const REGEX_IMPORT =
  /(import\s+[^;]+?\s+from\s*["'])([^"'\n]+)(services.module["'])/gs;
export function getFixedImports(
  filePath: string,
  code: string,
  _baseUrlWithTrailingSlash: string
): { countFixes: number; newCode: string, firstMissingImport: string } {
  const dirPath = path.dirname(filePath);

  let countFixes = 0;
  let firstMissingImport: string = "";
  const newCode = code.replace(
    REGEX_IMPORT,
    (match, _importPrefixAndOpenQuote, _relativePath, _closeQuote) => {
      firstMissingImport = match.match(/(import.*{[^a-zA-Z]*)([\w]*)/)?.at(2) || "";
      countFixes++;
      return "";
    }
  );
  return { countFixes, newCode, firstMissingImport };
}

export function singularOrPlural(
  count: number,
  labelSingular: string,
  labelPlural: string
) {
  return count === 1 ? labelSingular : labelPlural;
}
