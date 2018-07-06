/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import { localize } from '../localize';

export namespace cpUtils {
    export async function executeCommand(outputChannel: vscode.OutputChannel | undefined, workingDirectory: string | undefined, command: string, ...args: string[]): Promise<string> {
        return await executeCommandWithCallback(
            (formattedArgs: string, code: number, outputs: string, resolve: () => void, reject: (e: Error) => void) => {
                if (code !== 0) {
                    // We want to make sure the full error message is displayed to the user, not just the error code.
                    // If outputChannel is defined, then we simply call 'outputChannel.show()' and throw a generic error telling the user to check the output window
                    // If outputChannel is _not_ defined, then we include the command's output in the error itself and rely on AzureActionHandler to display it properly
                    if (outputChannel) {
                        outputChannel.show();
                        reject(new Error(localize('azFunc.commandErrorWithOutput', 'Failed to run "{0}" command. Check output window for more details.', command)));
                    } else {
                        reject(new Error(localize('azFunc.commandError', 'Command "{0} {1}" failed with exit code "{2}":{3}{4}', command, formattedArgs, code, os.EOL, outputs)));
                    }
                } else {
                    if (outputChannel) {
                        outputChannel.appendLine(localize('finishedRunningCommand', 'Finished running command: "{0} {1}".', command, formattedArgs));
                    }
                    resolve();
                }
            },
            outputChannel, workingDirectory, command, ...args);
    }

    export async function executeCommandWithCallback(
        // tslint:disable-next-line:no-any
        onCloseCallback: (formattedArgs: string, code: number, outputs: string, resolve: () => void, reject: (e: Error) => void) => any,
        outputChannel: vscode.OutputChannel | undefined,
        workingDirectory: string | undefined,
        command: string,
        ...args: string[]
    ): Promise<string> {
        let cmdOutput: string = '';
        let cmdOutputIncludingStderr: string = '';
        workingDirectory = workingDirectory || os.tmpdir();
        const formattedArgs: string = args.join(' ');
        await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
            const options: cp.SpawnOptions = {
                cwd: workingDirectory,
                shell: true
            };
            const childProc: cp.ChildProcess = cp.spawn(command, args, options);

            if (outputChannel) {
                outputChannel.appendLine(localize('runningCommand', 'Running command: "{0} {1}"...', command, formattedArgs));
            }

            childProc.stdout.on('data', (data: string | Buffer) => {
                data = data.toString();
                cmdOutput = cmdOutput.concat(data);
                cmdOutputIncludingStderr = cmdOutputIncludingStderr.concat(data);
                if (outputChannel) {
                    outputChannel.append(data);
                }
            });

            childProc.stderr.on('data', (data: string | Buffer) => {
                data = data.toString();
                cmdOutputIncludingStderr = cmdOutputIncludingStderr.concat(data);
                if (outputChannel) {
                    outputChannel.append(data);
                }
            });

            childProc.on('error', reject);
            childProc.on('close', (code: number) => {
                onCloseCallback(formattedArgs, code, cmdOutputIncludingStderr, resolve, reject);
            });
        });

        return cmdOutput;
    }
}
