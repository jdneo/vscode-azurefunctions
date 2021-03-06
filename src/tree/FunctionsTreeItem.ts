/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OutputChannel } from 'vscode';
import { getKuduClient, SiteClient } from 'vscode-azureappservice';
import { IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import KuduClient from 'vscode-azurekudu';
import { FunctionEnvelope } from 'vscode-azurekudu/lib/models';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionTreeItem } from './FunctionTreeItem';

export class FunctionsTreeItem implements IAzureParentTreeItem {
    public static contextValue: string = 'azFuncFunctions';
    public readonly contextValue: string = FunctionsTreeItem.contextValue;
    public readonly label: string = localize('azFunc.Functions', 'Functions');
    public readonly childTypeLabel: string = localize('azFunc.Function', 'Function');

    private readonly _client: SiteClient;
    private readonly _outputChannel: OutputChannel;

    public constructor(client: SiteClient, outputChannel: OutputChannel) {
        this._client = client;
        this._outputChannel = outputChannel;
    }

    public get id(): string {
        return 'functions';
    }

    public get iconPath(): nodeUtils.IThemedIconPath {
        return nodeUtils.getThemedIconPath('BulletList');
    }

    public hasMoreChildren(): boolean {
        return false;
    }

    public async loadMoreChildren(): Promise<IAzureTreeItem[]> {
        const client: KuduClient = await getKuduClient(this._client);
        const funcs: FunctionEnvelope[] = await client.functionModel.list();
        return await Promise.all(funcs.map(async (fe: FunctionEnvelope) => {
            const treeItem: FunctionTreeItem = new FunctionTreeItem(this._client, fe, this._outputChannel);
            if (treeItem.config.isHttpTrigger) {
                // We want to cache the trigger url so that it is instantaneously copied when the user performs the copy action
                // (Otherwise there might be a second or two delay which could lead to confusion)
                await treeItem.initializeTriggerUrl();
            }
            return treeItem;
        }));
    }
}
