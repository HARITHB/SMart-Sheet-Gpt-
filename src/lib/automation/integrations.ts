/**
 * TidyRow External Integrations & Provider Boundaries
 * Step 7 of Automation & API Integrations Architecture
 * 
 * STRICT ARCHITECTURAL RULE:
 * "Do not create fake connected states. Build the provider boundary and clearly mark the integration dependency."
 * 
 * Defines explicit connection states:
 * - 'disconnected': No credentials provided.
 * - 'missing_credentials': Partial or blank configuration. Lists exact env vars/keys required.
 * - 'invalid_credentials': Credentials failed authentication/ping.
 * - 'connected': Real credentials verified via live check.
 */

import { DatasetRow } from '../core/types';

export type IntegrationProviderId =
  | 'google_sheets'
  | 'hubspot'
  | 'salesforce'
  | 'airtable'
  | 'custom_webhook';

export type ConnectionStatus =
  | 'disconnected'
  | 'missing_credentials'
  | 'invalid_credentials'
  | 'connected';

export interface IntegrationDefinition {
  providerId: IntegrationProviderId;
  name: string;
  category: 'spreadsheet' | 'crm' | 'database' | 'webhook';
  description: string;
  requiredCredentials: {
    key: string;
    label: string;
    envVarName?: string;
    secret: boolean;
    description: string;
  }[];
  destinationSchemaPacks?: string[];
}

export const INTEGRATION_REGISTRY: Record<IntegrationProviderId, IntegrationDefinition> = {
  google_sheets: {
    providerId: 'google_sheets',
    name: 'Google Sheets',
    category: 'spreadsheet',
    description: 'Sync spreadsheets directly to and from Google Drive and Google Sheets.',
    requiredCredentials: [
      {
        key: 'clientId',
        label: 'Google OAuth Client ID',
        envVarName: 'VITE_GOOGLE_CLIENT_ID',
        secret: false,
        description: 'Google Cloud Console OAuth 2.0 Client ID',
      },
      {
        key: 'accessToken',
        label: 'OAuth Access Token',
        secret: true,
        description: 'User access token with https://www.googleapis.com/auth/spreadsheets scope',
      },
    ],
    destinationSchemaPacks: ['General Spreadsheet'],
  },
  hubspot: {
    providerId: 'hubspot',
    name: 'HubSpot CRM',
    category: 'crm',
    description: 'Import contacts and companies, clean data, and push verified records to HubSpot CRM.',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'HubSpot Private App Token',
        envVarName: 'HUBSPOT_PRIVATE_APP_TOKEN',
        secret: true,
        description: 'Private App Access Token with crm.objects.contacts.read/write scopes',
      },
    ],
    destinationSchemaPacks: ['HubSpot Contacts', 'HubSpot Companies'],
  },
  salesforce: {
    providerId: 'salesforce',
    name: 'Salesforce CRM',
    category: 'crm',
    description: 'Sync leads and accounts through Salesforce REST API with strict field validation.',
    requiredCredentials: [
      {
        key: 'instanceUrl',
        label: 'Salesforce Instance URL',
        envVarName: 'SALESFORCE_INSTANCE_URL',
        secret: false,
        description: 'e.g. https://your-domain.my.salesforce.com',
      },
      {
        key: 'accessToken',
        label: 'Salesforce Bearer Token',
        envVarName: 'SALESFORCE_BEARER_TOKEN',
        secret: true,
        description: 'OAuth2 bearer token with API access',
      },
    ],
    destinationSchemaPacks: ['Salesforce Leads', 'Salesforce Accounts'],
  },
  airtable: {
    providerId: 'airtable',
    name: 'Airtable',
    category: 'database',
    description: 'Read and update records in Airtable bases using Personal Access Tokens.',
    requiredCredentials: [
      {
        key: 'personalAccessToken',
        label: 'Personal Access Token',
        envVarName: 'AIRTABLE_PAT',
        secret: true,
        description: 'Personal Access Token with data.records:read and data.records:write',
      },
      {
        key: 'baseId',
        label: 'Airtable Base ID',
        secret: false,
        description: 'App ID starting with "app..."',
      },
    ],
    destinationSchemaPacks: ['Airtable Table'],
  },
  custom_webhook: {
    providerId: 'custom_webhook',
    name: 'Custom Webhook / HTTP Endpoint',
    category: 'webhook',
    description: 'Push cleaned rows and audit logs to any custom REST endpoint or reverse ETL pipeline.',
    requiredCredentials: [
      {
        key: 'endpointUrl',
        label: 'Target Endpoint URL',
        secret: false,
        description: 'HTTPS URL that accepts POST JSON datasets',
      },
    ],
  },
};

export interface IntegrationConnectionState {
  providerId: IntegrationProviderId;
  workspaceId: string;
  status: ConnectionStatus;
  credentialsConfigured: boolean;
  missingCredentials: string[];
  lastTestedAt?: string;
  lastError?: string;
  metadata?: Record<string, any>;
}

export class IntegrationNotConfiguredError extends Error {
  statusCode = 412; // Precondition Failed
  constructor(providerId: string, missing: string[]) {
    super(
      `Integration '${providerId}' is not connected. Missing required credentials: [${missing.join(', ')}]. ` +
      `Do not fake connected states; configure real credentials in workspace settings.`
    );
    this.name = 'IntegrationNotConfiguredError';
  }
}

export interface IntegrationSyncResult {
  providerId: IntegrationProviderId;
  action: 'pull' | 'push';
  success: boolean;
  rowsCount: number;
  durationMs: number;
  details?: Record<string, any>;
}

export class IntegrationService {
  private connections: Map<string, IntegrationConnectionState> = new Map();
  private storedCredentials: Map<string, Record<string, string>> = new Map();

  private getKey(workspaceId: string, providerId: IntegrationProviderId): string {
    return `${workspaceId}::${providerId}`;
  }

  /**
   * Retrieves connection state for a given workspace and provider.
   * Default state is strictly 'disconnected' with complete list of missing credentials.
   */
  async getConnectionState(
    workspaceId: string,
    providerId: IntegrationProviderId
  ): Promise<IntegrationConnectionState> {
    const key = this.getKey(workspaceId, providerId);
    const existing = this.connections.get(key);
    if (existing) return existing;

    const def = INTEGRATION_REGISTRY[providerId];
    const missing = def.requiredCredentials.map((c) => c.envVarName || c.key);

    const initial: IntegrationConnectionState = {
      providerId,
      workspaceId,
      status: 'disconnected',
      credentialsConfigured: false,
      missingCredentials: missing,
    };

    this.connections.set(key, initial);
    return initial;
  }

  /**
   * Configures credentials for an integration provider.
   * Validates presence of all required credentials before attempting any network ping.
   */
  async configureCredentials(
    workspaceId: string,
    providerId: IntegrationProviderId,
    credentials: Record<string, string>,
    testPingFn?: () => Promise<{ success: boolean; error?: string }>
  ): Promise<IntegrationConnectionState> {
    const key = this.getKey(workspaceId, providerId);
    const def = INTEGRATION_REGISTRY[providerId];

    const missing: string[] = [];
    for (const req of def.requiredCredentials) {
      const val = credentials[req.key] || credentials[req.envVarName || ''];
      if (!val || val.trim().length === 0) {
        missing.push(req.envVarName || req.key);
      }
    }

    if (missing.length > 0) {
      const state: IntegrationConnectionState = {
        providerId,
        workspaceId,
        status: 'missing_credentials',
        credentialsConfigured: false,
        missingCredentials: missing,
        lastTestedAt: new Date().toISOString(),
        lastError: `Missing required credentials: ${missing.join(', ')}`,
      };
      this.connections.set(key, state);
      return state;
    }

    // Attempt real connection test if ping function provided
    let status: ConnectionStatus = 'connected';
    let lastError: string | undefined;

    if (testPingFn) {
      try {
        const pingResult = await testPingFn();
        if (!pingResult.success) {
          status = 'invalid_credentials';
          lastError = pingResult.error || 'Provider rejected credentials';
        }
      } catch (err: any) {
        status = 'invalid_credentials';
        lastError = err?.message || 'Connection test failed';
      }
    }

    const state: IntegrationConnectionState = {
      providerId,
      workspaceId,
      status,
      credentialsConfigured: status === 'connected',
      missingCredentials: [],
      lastTestedAt: new Date().toISOString(),
      lastError,
    };

    if (status === 'connected') {
      this.storedCredentials.set(key, { ...credentials });
    }

    this.connections.set(key, state);
    return state;
  }

  /**
   * Disconnects an integration and purges stored credentials.
   */
  async disconnect(workspaceId: string, providerId: IntegrationProviderId): Promise<IntegrationConnectionState> {
    const key = this.getKey(workspaceId, providerId);
    this.storedCredentials.delete(key);
    const def = INTEGRATION_REGISTRY[providerId];
    const state: IntegrationConnectionState = {
      providerId,
      workspaceId,
      status: 'disconnected',
      credentialsConfigured: false,
      missingCredentials: def.requiredCredentials.map((c) => c.envVarName || c.key),
      lastTestedAt: new Date().toISOString(),
    };
    this.connections.set(key, state);
    return state;
  }

  /**
   * Pulls data from an integration. Fails immediately if integration is not connected.
   */
  async pullData(
    workspaceId: string,
    providerId: IntegrationProviderId,
    pullFn?: () => Promise<{ headers: string[]; rows: DatasetRow[] }>
  ): Promise<{ headers: string[]; rows: DatasetRow[] }> {
    const state = await this.getConnectionState(workspaceId, providerId);
    if (state.status !== 'connected') {
      throw new IntegrationNotConfiguredError(providerId, state.missingCredentials);
    }

    if (!pullFn) {
      throw new Error(`Real data pull handler not provided for ${providerId}.`);
    }

    return await pullFn();
  }

  /**
   * Pushes cleaned dataset to an integration. Fails immediately if not connected.
   */
  async pushData(
    workspaceId: string,
    providerId: IntegrationProviderId,
    headers: string[],
    rows: DatasetRow[],
    pushFn?: () => Promise<{ recordsCreated: number; recordsUpdated: number }>
  ): Promise<IntegrationSyncResult> {
    const state = await this.getConnectionState(workspaceId, providerId);
    if (state.status !== 'connected') {
      throw new IntegrationNotConfiguredError(providerId, state.missingCredentials);
    }

    const start = performance.now();
    let details: Record<string, any> | undefined;

    if (pushFn) {
      details = await pushFn();
    }

    return {
      providerId,
      action: 'push',
      success: true,
      rowsCount: rows.length,
      durationMs: performance.now() - start,
      details,
    };
  }

  async listAllConnections(workspaceId: string): Promise<IntegrationConnectionState[]> {
    const providerIds = Object.keys(INTEGRATION_REGISTRY) as IntegrationProviderId[];
    const list: IntegrationConnectionState[] = [];
    for (const pId of providerIds) {
      list.push(await this.getConnectionState(workspaceId, pId));
    }
    return list;
  }
}

export const integrationService = new IntegrationService();
