/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as vscode from 'vscode';
import * as xml2js from 'xml2js';
import { localize } from '../localize';
import { cpUtils } from './cpUtils';

export namespace mavenUtils {
    const mvnCommand: string = 'mvn';
    export async function validateMavenInstalled(workingDirectory: string): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, workingDirectory, mvnCommand, '--version');
        } catch (error) {
            throw new Error(localize('azFunc.mvnNotFound', 'Failed to find "maven" on path.'));
        }
    }

    export async function getFunctionAppNameInPom(pomLocation: string): Promise<string | undefined> {
        const pomString: string = await fse.readFile(pomLocation, 'utf-8');
        return await new Promise((resolve: (ret: string | undefined) => void): void => {
            // tslint:disable-next-line:no-any
            xml2js.parseString(pomString, { explicitArray: false }, (err: any, result: any): void => {
                if (result && !err) {
                    // tslint:disable-next-line:no-string-literal no-unsafe-any
                    if (result['project'] && result['project']['properties']) {
                        // tslint:disable-next-line:no-string-literal no-unsafe-any
                        resolve(result['project']['properties']['functionAppName']);
                        return;
                    }
                }
                resolve(undefined);
            });
        });
    }

    export async function executeMvnCommand(outputChannel: vscode.OutputChannel | undefined, workingDirectory: string | undefined, ...args: string[]): Promise<void> {
        let stderrOutput: string = '';
        workingDirectory = workingDirectory || os.tmpdir();
        const formattedArgs: string = args.join(' ');
        await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
            const options: cp.SpawnOptions = {
                cwd: workingDirectory,
                shell: true
            };
            const childProc: cp.ChildProcess = cp.spawn(mvnCommand, args, options);

            if (outputChannel) {
                outputChannel.appendLine(localize('runningCommand', 'Running command: "{0} {1}"...', mvnCommand, formattedArgs));
            }

            childProc.stdout.on('data', (data: string | Buffer) => {
                data = data.toString();
                if (outputChannel) {
                    outputChannel.append(data);
                }
            });

            childProc.stderr.on('data', (data: string | Buffer) => {
                data = data.toString();
                stderrOutput = stderrOutput.concat(data);
                if (outputChannel) {
                    outputChannel.append(data);
                }
            });

            childProc.on('error', reject);
            childProc.on('close', (code: number) => {
                if (code !== 0) {
                    reject(new Error(localize('azFunc.commandError', 'Command "{0} {1}" failed with exit code "{2}":{3}{4}', mvnCommand, formattedArgs, code, os.EOL, stderrOutput)));
                } else {
                    if (outputChannel) {
                        outputChannel.appendLine(localize('finishedRunningCommand', 'Finished running command: "{0} {1}".', mvnCommand, formattedArgs));
                    }
                    resolve();
                }
            });
        });
    }
}
