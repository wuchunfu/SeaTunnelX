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

import fs from 'node:fs/promises';
import path from 'node:path';
import {expect, type APIRequestContext} from '@playwright/test';
import type {InstalledPlugin, LocalPlugin, PluginDependency} from '@/lib/services/plugin';

const backendBaseURL =
  process.env.E2E_BACKEND_BASE_URL ?? 'http://127.0.0.1:18000';
const tmpDirRoot =
  process.env.E2E_INSTALLER_REAL_TMP_DIR ??
  path.resolve(process.cwd(), '../tmp/e2e/installer-real');

interface ErrorResponse {
  error_msg?: string;
}

interface LocalPluginsResponse extends ErrorResponse {
  data?: LocalPlugin[];
}

interface InstalledPluginsResponse extends ErrorResponse {
  data?: InstalledPlugin[];
}

interface DownloadStatusResponse extends ErrorResponse {
  data?: {
    plugin_name?: string;
    version?: string;
    status?: 'not_started' | 'downloading' | 'completed' | 'failed';
    error?: string;
    message?: string;
    selected_profile_keys?: string[];
  } | null;
}

function normalizeTargetDir(targetDir: string): string {
  return targetDir.replace(/^[/\\]+/, '');
}

function getDependencyFileName(dep: PluginDependency): string {
  const artifact = dep.artifact_id?.trim() || 'dependency';
  const version = dep.version?.trim();
  return version ? `${artifact}-${version}.jar` : `${artifact}.jar`;
}

export function resolveLocalPluginDependencyPath(
  version: string,
  dependency: PluginDependency,
): string {
  return path.join(
    tmpDirRoot,
    'storage',
    'plugins',
    version,
    normalizeTargetDir(dependency.target_dir),
    getDependencyFileName(dependency),
  );
}

export async function waitForLocalPlugin(
  request: APIRequestContext,
  pluginName: string,
  version: string,
  predicate: (plugin: LocalPlugin) => boolean = () => true,
  timeoutMs: number = 300000,
): Promise<LocalPlugin> {
  await expect
    .poll(
      async () => {
        const response = await request.get(`${backendBaseURL}/api/v1/plugins/local`);
        expect(response.ok()).toBeTruthy();
        const payload = (await response.json()) as LocalPluginsResponse;
        const localPlugin = (payload.data || []).find(
          (plugin) =>
            plugin.name === pluginName &&
            plugin.version === version &&
            predicate(plugin),
        );
        return localPlugin ?? null;
      },
      {timeout: timeoutMs},
    )
    .not.toBeNull();

  const response = await request.get(`${backendBaseURL}/api/v1/plugins/local`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as LocalPluginsResponse;
  return (payload.data || []).find(
    (plugin) =>
      plugin.name === pluginName &&
      plugin.version === version &&
      predicate(plugin),
  ) as LocalPlugin;
}

async function waitForFile(pathname: string, timeoutMs: number = 30000): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          await fs.access(pathname);
          return true;
        } catch {
          return false;
        }
      },
      {timeout: timeoutMs},
    )
    .toBeTruthy();
}

export async function assertLocalPluginAssets(plugin: LocalPlugin): Promise<void> {
  await waitForFile(plugin.connector_path);
}

export async function installPluginToClusterApi(
  request: APIRequestContext,
  clusterId: number,
  pluginName: string,
  version: string,
  profileKeys?: string[],
): Promise<void> {
  const response = await request.post(
    `${backendBaseURL}/api/v1/clusters/${clusterId}/plugins`,
    {
      data: {
        plugin_name: pluginName,
        version,
        mirror: 'apache',
        profile_keys: profileKeys,
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as ErrorResponse;
  expect(payload.error_msg ?? '').toBe('');
}

export async function downloadPluginApi(
  request: APIRequestContext,
  pluginName: string,
  version: string,
  profileKeys?: string[],
): Promise<void> {
  const response = await request.post(
    `${backendBaseURL}/api/v1/plugins/${pluginName}/download`,
    {
      data: {
        version,
        mirror: 'apache',
        profile_keys: profileKeys,
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as ErrorResponse;
  expect(payload.error_msg ?? '').toBe('');
}

export async function waitForPluginDownloadCompleted(
  request: APIRequestContext,
  pluginName: string,
  version: string,
  profileKeys?: string[],
  timeoutMs: number = 600000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const params = new URLSearchParams({version});
        for (const profileKey of profileKeys || []) {
          params.append('profile_keys', profileKey);
        }
        const response = await request.get(
          `${backendBaseURL}/api/v1/plugins/${encodeURIComponent(pluginName)}/download/status?${params.toString()}`,
        );
        expect(response.ok()).toBeTruthy();
        const payload = (await response.json()) as DownloadStatusResponse;
        const status = payload.data?.status || 'not_started';
        const errorMessage = payload.data?.error || payload.data?.message || '';
        if (
          status === 'failed' &&
          !/download already in progress|下载正在进行中/i.test(errorMessage)
        ) {
          throw new Error(
            `plugin ${pluginName}@${version} download failed: ${errorMessage || 'unknown error'}`,
          );
        }
        if (status === 'completed') {
          return 'completed';
        }
        const localResponse = await request.get(`${backendBaseURL}/api/v1/plugins/local`);
        expect(localResponse.ok()).toBeTruthy();
        const localPayload = (await localResponse.json()) as LocalPluginsResponse;
        const localPlugin = (localPayload.data || []).find(
          (plugin) =>
            plugin.name === pluginName &&
            plugin.version === version &&
            ((profileKeys && profileKeys.length > 0)
              ? profileKeys.every((profileKey) =>
                  (plugin.selected_profile_keys || []).includes(profileKey),
                )
              : true),
        );
        return localPlugin ? 'completed' : status;
      },
      {timeout: timeoutMs},
    )
    .toBe('completed');
}

export async function waitForInstalledPlugin(
  request: APIRequestContext,
  clusterId: number,
  pluginName: string,
  version: string,
  predicate: (plugin: InstalledPlugin) => boolean = () => true,
  timeoutMs: number = 180000,
): Promise<InstalledPlugin> {
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${backendBaseURL}/api/v1/clusters/${clusterId}/plugins`,
        );
        expect(response.ok()).toBeTruthy();
        const payload = (await response.json()) as InstalledPluginsResponse;
        const installedPlugin = (payload.data || []).find(
          (plugin) =>
            plugin.plugin_name === pluginName &&
            plugin.version === version &&
            predicate(plugin),
        );
        return installedPlugin ?? null;
      },
      {timeout: timeoutMs},
    )
    .not.toBeNull();

  const response = await request.get(
    `${backendBaseURL}/api/v1/clusters/${clusterId}/plugins`,
  );
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as InstalledPluginsResponse;
  return (payload.data || []).find(
    (plugin) =>
      plugin.plugin_name === pluginName &&
      plugin.version === version &&
      predicate(plugin),
  ) as InstalledPlugin;
}
