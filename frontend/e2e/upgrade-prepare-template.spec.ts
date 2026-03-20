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

import {expect, test} from '@playwright/test';
import {
  installUpgradePrepareTemplateRoutes,
  upgradePrepareTemplate,
} from './helpers/upgrade-prepare-template';

test.describe('upgrade prepare template', () => {
  test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await installUpgradePrepareTemplateRoutes(page);
  });

  test('runs upgrade precheck and continues into config review', async ({
    page,
  }) => {
    await page.goto(
      `/clusters/${upgradePrepareTemplate.clusterId}/upgrade/prepare`,
    );

    await expect(page.getByTestId('upgrade-prepare-page')).toBeVisible();
    await expect(page.getByRole('heading', {level: 1})).toHaveText(
      /升级准备页|Upgrade Prepare/i,
    );
    await expect(page.getByTestId('upgrade-prepare-continue')).toBeDisabled();

    await page.getByTestId('upgrade-prepare-run-precheck').click();
    await expect(page.getByTestId('upgrade-prepare-summary')).toContainText(
      upgradePrepareTemplate.targetVersion,
    );
    await expect(page.getByTestId('upgrade-prepare-ready-badge')).toContainText(
      /可继续|可计划|Ready/i,
    );
    await expect(
      page.getByTestId('upgrade-prepare-node-targets'),
    ).toContainText(upgradePrepareTemplate.targetInstallDir);

    await expect(page.getByTestId('upgrade-prepare-continue')).toBeEnabled();
    await page.getByTestId('upgrade-prepare-continue').click();

    await page.waitForURL(
      `**/clusters/${upgradePrepareTemplate.clusterId}/upgrade/config`,
    );
    await expect(page.getByRole('heading', {level: 1})).toHaveText(
      /配置差异处理|Config Difference Review/i,
    );
  });
});
