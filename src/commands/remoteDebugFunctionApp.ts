/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { SiteConfigResource, StringDictionary, User } from 'azure-arm-website/lib/models';
import { DeviceTokenCredentials } from 'ms-rest-azure';
import * as portfinder from 'portfinder';
import * as vscode from 'vscode';
import { SiteWrapper } from 'vscode-azureappservice';
import { AzureTreeDataProvider, IAzureNode } from 'vscode-azureextensionui';
import { DebugProxy } from '../DebugProxy';
import { DialogResponses } from '../DialogResponses';
import { localize } from '../localize';
import { FunctionAppTreeItem } from '../tree/FunctionAppTreeItem';
import { nodeUtils } from '../utils/nodeUtils';

export async function remoteDebugFunctionApp(outputChannel: vscode.OutputChannel, tree: AzureTreeDataProvider, node?: IAzureNode<FunctionAppTreeItem>): Promise<void> {
    const confirmMsg: string = localize('azFunc.confirmRemoteDebug', 'This is an experimental feature and only support Java Function now. Would you like to continue?');
    const result: vscode.MessageItem | undefined = await vscode.window.showWarningMessage(confirmMsg, DialogResponses.yes, DialogResponses.cancel);
    if (result === DialogResponses.cancel) {
        return;
    }

    if (!node) {
        node = <IAzureNode<FunctionAppTreeItem>>await tree.showNodePicker(FunctionAppTreeItem.contextValue);
    }
    const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
    const siteWrapper: SiteWrapper = node.treeItem.siteWrapper;
    const portNumber: number = await portfinder.getPortPromise();
    const publishProfile: User = await siteWrapper.getWebAppPublishCredential(client);
    const accessToken: string = await acquireToken(node.credentials);
    const debugProxy: DebugProxy = new DebugProxy(outputChannel, siteWrapper, portNumber, publishProfile, accessToken);

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, async (p: vscode.Progress<{}>) => {
        // tslint:disable-next-line:no-any
        return new Promise(async (resolve: () => void, reject: (e: any) => void): Promise<void> => {
            try {
                await updateSiteConfig(siteWrapper, client, p);
                await updateAppSettings(siteWrapper, client, p);

                p.report({ message: 'starting debug proxy...' });
                // tslint:disable-next-line:no-floating-promises
                debugProxy.startProxy();
                debugProxy.on('start', resolve);
            } catch (error) {
                reject(error);
            }
        });
    });

    debugProxy.on('error', (err: Error) => {
        debugProxy.dispose();
        throw err;
    });

    const sessionId: string = Date.now().toString();

    await vscode.debug.startDebugging(undefined, {
        name: sessionId,
        type: 'java',
        request: 'attach',
        hostName: 'localhost',
        port: portNumber
    });

    const terminateDebugListener: vscode.Disposable = vscode.debug.onDidTerminateDebugSession((event: vscode.DebugSession) => {
        if (event.name === sessionId) {
            if (debugProxy !== undefined) {
                debugProxy.dispose();
            }
            terminateDebugListener.dispose();
        }
    });

}

async function updateSiteConfig(siteWrapper: SiteWrapper, client: WebSiteManagementClient, p: vscode.Progress<{}>): Promise<void> {
    p.report({ message: 'Fetching site configuration...' });
    const siteConfig: SiteConfigResource = await siteWrapper.getSiteConfig(client);
    if (siteConfig.use32BitWorkerProcess || !siteConfig.webSocketsEnabled) {
        siteConfig.use32BitWorkerProcess = false;
        siteConfig.webSocketsEnabled = true;
        p.report({ message: 'Updating site configuration to enable remote debugging...' });
        await siteWrapper.updateConfiguration(client, siteConfig);
        p.report({ message: 'Updating site configuration done...' });
    }
}

async function updateAppSettings(siteWrapper: SiteWrapper, client: WebSiteManagementClient, p: vscode.Progress<{}>): Promise<void> {
    const HTTP_PLATFORM_DEBUG_PORT: string = '8898';
    const JAVA_OPTS: string = `-Djava.net.preferIPv4Stack=true -Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=127.0.0.1:${HTTP_PLATFORM_DEBUG_PORT}`;
    p.report({ message: 'Fetching application settings...' });
    const appSettings: StringDictionary = await client.webApps.listApplicationSettings(siteWrapper.resourceGroup, siteWrapper.appName);
    if (appSettings.properties && (appSettings.properties.JAVA_OPTS !== JAVA_OPTS
        || appSettings.properties.HTTP_PLATFORM_DEBUG_PORT !== HTTP_PLATFORM_DEBUG_PORT)) {
        appSettings.properties.JAVA_OPTS = JAVA_OPTS;
        appSettings.properties.HTTP_PLATFORM_DEBUG_PORT = HTTP_PLATFORM_DEBUG_PORT;
        p.report({ message: 'Updating application settings to enable remote debugging...' });
        await client.webApps.updateApplicationSettings(siteWrapper.resourceGroup, siteWrapper.appName, appSettings);
        p.report({ message: 'Updating application settings done...' });
    }
}

async function acquireToken(credentials: DeviceTokenCredentials): Promise<string> {
    // tslint:disable-next-line:no-any typedef
    return new Promise((resolve: (res: string) => void, reject: (err: any) => void) => {
        // tslint:disable-next-line:no-string-literal no-any no-unsafe-any
        credentials['context'].acquireToken(credentials['environment']['activeDirectoryResourceId'], credentials['username'], credentials['clientId'], (err: any, result: any) => {
            if (err) {
                reject(err);
            } else {
                // tslint:disable-next-line:no-unsafe-any
                resolve(result.accessToken);
            }
        });
    });
}
