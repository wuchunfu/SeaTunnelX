/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {Page} from '@playwright/test';

function ok<T>(data: T) {
  return {
    error_msg: '',
    data,
  };
}

const now = '2026-03-20T12:00:00Z';
const seatunnelVersion = '2.3.13';
const pluginName = 'jdbc';
const failureErrorMessage =
  'Failed to attach the JDBC baseline because mysql-connector-j download failed.';
const failureRollbackMessage =
  'Rollback guidance: clean the staged plugin files before retrying.';

const pluginFixture = {
  name: pluginName,
  display_name: 'JDBC',
  category: 'connector',
  version: seatunnelVersion,
  description:
    'Universal JDBC connector with profile-based dependency baseline.',
  group_id: 'org.apache.seatunnel',
  artifact_id: 'connector-jdbc',
  doc_url: 'https://seatunnel.apache.org/docs/2.3.13/connectors/sink/Jdbc/',
  dependency_status: 'ready_exact',
  dependency_count: 3,
  dependency_baseline_version: seatunnelVersion,
  dependency_resolution_mode: 'exact',
};

const officialDependencies = {
  plugin_name: pluginName,
  seatunnel_version: seatunnelVersion,
  dependency_status: 'ready_exact',
  dependency_count: 3,
  baseline_version_used: seatunnelVersion,
  dependency_resolution_mode: 'exact',
  profiles: [
    {
      id: 1,
      seatunnel_version: seatunnelVersion,
      plugin_name: pluginName,
      artifact_id: 'connector-jdbc',
      profile_key: 'mysql',
      profile_name: 'MySQL 8.x',
      engine_scope: 'zeta',
      target_dir: 'plugins/Jdbc/lib',
      applies_to: 'mysql',
      include_versions: '',
      excluded_versions: '',
      source_kind: 'official',
      baseline_version_used: seatunnelVersion,
      doc_slug: 'connectors/sink/Mysql',
      doc_source_url:
        'https://seatunnel.apache.org/docs/2.3.13/connectors/sink/Mysql/',
      confidence: 'high',
      no_additional_dependencies: false,
      is_default: true,
      note: 'Default profile for MySQL sink/source.',
      content_hash: 'mysql-profile',
      created_at: now,
      updated_at: now,
      items: [
        {
          id: 11,
          profile_id: 1,
          group_id: 'org.apache.seatunnel',
          artifact_id: 'connector-cdc-mysql',
          version: seatunnelVersion,
          target_dir: 'connectors',
          required: true,
          source_url:
            'https://seatunnel.apache.org/docs/2.3.13/connectors/sink/Mysql/',
          note: 'MySQL CDC companion connector',
          created_at: now,
          updated_at: now,
        },
        {
          id: 12,
          profile_id: 1,
          group_id: 'com.mysql',
          artifact_id: 'mysql-connector-j',
          version: '8.0.33',
          target_dir: 'plugins/Jdbc/lib',
          required: true,
          source_url:
            'https://repo1.maven.org/maven2/com/mysql/mysql-connector-j/8.0.33/',
          note: 'MySQL runtime driver',
          created_at: now,
          updated_at: now,
        },
      ],
    },
    {
      id: 2,
      seatunnel_version: seatunnelVersion,
      plugin_name: pluginName,
      artifact_id: 'connector-jdbc',
      profile_key: 'postgres',
      profile_name: 'PostgreSQL',
      engine_scope: 'zeta',
      target_dir: 'plugins/Jdbc/lib',
      applies_to: 'postgresql',
      include_versions: '',
      excluded_versions: '',
      source_kind: 'official',
      baseline_version_used: seatunnelVersion,
      doc_slug: 'connectors/sink/Postgres',
      doc_source_url:
        'https://seatunnel.apache.org/docs/2.3.13/connectors/sink/Postgres/',
      confidence: 'high',
      no_additional_dependencies: false,
      is_default: false,
      note: 'Alternative profile for PostgreSQL.',
      content_hash: 'postgres-profile',
      created_at: now,
      updated_at: now,
      items: [
        {
          id: 21,
          profile_id: 2,
          group_id: 'org.postgresql',
          artifact_id: 'postgresql',
          version: '42.4.3',
          target_dir: 'plugins/Jdbc/lib',
          required: true,
          source_url:
            'https://repo1.maven.org/maven2/org/postgresql/postgresql/42.4.3/',
          note: 'PostgreSQL runtime driver',
          created_at: now,
          updated_at: now,
        },
      ],
    },
  ],
  effective_dependencies: [],
  disabled_dependencies: [],
};

function buildSuccessfulInstallation() {
  return {
    id: 'install-1',
    host_id: '1',
    status: 'success',
    current_step: 'complete',
    steps: [
      {
        step: 'download',
        name: 'Download package',
        description: 'Download the selected SeaTunnel package.',
        status: 'success',
        progress: 100,
        retryable: false,
        start_time: now,
        end_time: now,
      },
      {
        step: 'install_plugins',
        name: 'Install plugins',
        description: 'Attach the selected JDBC baseline.',
        status: 'success',
        progress: 100,
        retryable: false,
        start_time: now,
        end_time: now,
      },
      {
        step: 'complete',
        name: 'Complete',
        description: 'Finish installation.',
        status: 'success',
        progress: 100,
        retryable: false,
        start_time: now,
        end_time: now,
      },
    ],
    progress: 100,
    message: 'Installation completed successfully',
    start_time: now,
    end_time: now,
  };
}

function buildFailedInstallation() {
  return {
    id: 'install-rollback-1',
    host_id: '1',
    status: 'failed',
    current_step: 'install_plugins',
    steps: [
      {
        step: 'download',
        name: 'Download package',
        description: 'Download the selected SeaTunnel package.',
        status: 'success',
        progress: 100,
        retryable: false,
        start_time: now,
        end_time: now,
      },
      {
        step: 'install_plugins',
        name: 'Install plugins',
        description: 'Attach the selected JDBC baseline.',
        status: 'failed',
        progress: 100,
        retryable: true,
        message: failureRollbackMessage,
        error: failureErrorMessage,
        start_time: now,
        end_time: now,
      },
      {
        step: 'complete',
        name: 'Complete',
        description: 'Finish installation.',
        status: 'pending',
        progress: 0,
        retryable: false,
      },
    ],
    progress: 67,
    message: 'Installation stopped after plugin installation failed',
    error: failureErrorMessage,
    start_time: now,
    end_time: now,
  };
}

export interface InstallWizardTemplateRouteOptions {
  installationScenario?: 'success' | 'failed';
}

export async function installInstallWizardTemplateRoutes(
  page: Page,
  options?: InstallWizardTemplateRouteOptions,
): Promise<void> {
  const installationFixture =
    options?.installationScenario === 'failed'
      ? buildFailedInstallation()
      : buildSuccessfulInstallation();

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const {pathname} = url;

    if (request.method() === 'GET' && pathname === '/api/v1/packages') {
      await route.fulfill({
        status: 200,
        json: ok({
          versions: [seatunnelVersion],
          recommended_version: seatunnelVersion,
          local_packages: [],
        }),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      pathname === '/api/v1/packages/downloads'
    ) {
      await route.fulfill({
        status: 200,
        json: ok([]),
      });
      return;
    }

    if (request.method() === 'GET' && pathname === '/api/v1/plugins') {
      await route.fulfill({
        status: 200,
        json: ok({
          plugins: [pluginFixture],
          total: 1,
          version: seatunnelVersion,
          mirror: 'aliyun',
          source: 'database',
          cache_hit: true,
          catalog_refreshed_at: now,
        }),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      pathname === `/api/v1/plugins/${pluginName}/official-dependencies`
    ) {
      await route.fulfill({
        status: 200,
        json: ok(officialDependencies),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      pathname === `/api/v1/plugins/${pluginName}/dependencies`
    ) {
      await route.fulfill({
        status: 200,
        json: ok([]),
      });
      return;
    }

    if (
      request.method() === 'POST' &&
      pathname === '/api/v1/hosts/1/precheck'
    ) {
      await route.fulfill({
        status: 200,
        json: ok({
          items: [
            {
              name: 'memory',
              status: 'passed',
              message: '16 GB memory is available.',
              details: {available_gb: 16},
            },
            {
              name: 'cpu',
              status: 'passed',
              message: '8 CPU cores are available.',
              details: {available_cores: 8},
            },
            {
              name: 'ports',
              status: 'passed',
              message: 'Required ports are available.',
              details: {ports: [5801, 8080]},
            },
          ],
          overall_status: 'passed',
          summary: 'Host passed all installation checks.',
        }),
      });
      return;
    }

    if (request.method() === 'POST' && pathname === '/api/v1/hosts/1/install') {
      await route.fulfill({
        status: 200,
        json: ok(installationFixture),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      pathname === '/api/v1/hosts/1/install/status'
    ) {
      await route.fulfill({
        status: 200,
        json: ok(installationFixture),
      });
      return;
    }

    await route.continue();
  });
}

export const installWizardTemplate = {
  seatunnelVersion,
  pluginName,
  profileKey: 'mysql',
};

export const installWizardFailureTemplate = {
  seatunnelVersion,
  pluginName,
  profileKey: 'mysql',
  failureErrorMessage,
  failureRollbackMessage,
};
