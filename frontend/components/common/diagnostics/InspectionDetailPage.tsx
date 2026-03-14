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

'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {ArrowLeft, Download, ExternalLink, FileText, Loader2, Package} from 'lucide-react';
import {toast} from 'sonner';
import services from '@/lib/services';
import type {
  DiagnosticsInspectionFinding,
  DiagnosticsInspectionFindingSeverity,
  DiagnosticsInspectionReport,
  DiagnosticsTask,
  DiagnosticsTaskNodeScope,
  DiagnosticsTaskOptions,
} from '@/lib/services/diagnostics';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Skeleton} from '@/components/ui/skeleton';
import {Switch} from '@/components/ui/switch';
import {localizeDiagnosticsText} from './text-utils';

interface InspectionDetailPageProps {
  inspectionId: number;
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function getSeverityLabel(severity: DiagnosticsInspectionFindingSeverity): string {
  switch (severity) {
    case 'critical':
      return '严重';
    case 'warning':
      return '警告';
    case 'info':
      return '信息';
    default:
      return severity;
  }
}

function getSeverityBadgeClass(severity: DiagnosticsInspectionFindingSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'warning':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'info':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    default:
      return '';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return '等待中';
    case 'running':
      return '执行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return status;
  }
}

function getStatusVariant(
  status: string,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'completed':
    case 'succeeded':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'running':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getTriggerSourceLabel(source: string): string {
  switch (source) {
    case 'manual':
      return '手动触发';
    case 'auto':
      return '自动触发';
    case 'cluster_detail':
      return '集群详情';
    case 'diagnostics_workspace':
      return '诊断工作台';
    default:
      return source;
  }
}

function getFindingSeverityScore(
  severity: DiagnosticsInspectionFindingSeverity,
): number {
  switch (severity) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

function formatNodeOrigin(options: {
  nodeId?: number | null;
  hostId?: number | null;
  hostName?: string | null;
  hostIp?: string | null;
}): string {
  const parts: string[] = [];
  if (options.hostName?.trim()) {
    parts.push(options.hostName.trim());
  } else if (options.hostIp?.trim()) {
    parts.push(options.hostIp.trim());
  } else if (options.hostId) {
    parts.push(`#${options.hostId}`);
  }
  if (options.nodeId) {
    parts.push(`node #${options.nodeId}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '-';
}

const DEFAULT_BUNDLE_OPTIONS: DiagnosticsTaskOptions = {
  include_thread_dump: true,
  include_jvm_dump: false,
  jvm_dump_min_free_mb: 2048,
  log_sample_lines: 200,
};

export default function InspectionDetailPage({
  inspectionId,
}: InspectionDetailPageProps) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<DiagnosticsInspectionReport | null>(null);
  const [findings, setFindings] = useState<DiagnosticsInspectionFinding[]>([]);
  const [creatingBundle, setCreatingBundle] = useState(false);
  const [bundleTask, setBundleTask] = useState<DiagnosticsTask | null>(null);
  const [pollingBundle, setPollingBundle] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [bundleOptions, setBundleOptions] =
    useState<DiagnosticsTaskOptions>(DEFAULT_BUNDLE_OPTIONS);
  const [nodeScope, setNodeScope] =
    useState<DiagnosticsTaskNodeScope>('all');
  const [bundleLookbackMinutes, setBundleLookbackMinutes] =
    useState<number>(30);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [execLogDialogOpen, setExecLogDialogOpen] = useState(false);

  const pollBundleTask = useCallback(
    async (taskId: number) => {
      const result = await services.diagnostics.getTaskSafe(taskId);
      if (!result.success || !result.data) {
        return;
      }
      setBundleTask(result.data);
      const status = result.data.status;
      if (
        status === 'succeeded' ||
        status === 'failed' ||
        status === 'cancelled'
      ) {
        setPollingBundle(false);
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    },
    [],
  );

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const result =
        await services.diagnostics.getInspectionReportDetailSafe(inspectionId);
      if (!result.success || !result.data) {
        toast.error(result.error || '加载巡检详情失败');
        setReport(null);
        setFindings([]);
        setBundleTask(null);
        return;
      }
      setReport(result.data.report);
      setFindings(result.data.findings || []);
      const related = result.data.related_diagnostic_task;
      if (related) {
        setBundleTask(related);
        const status = related.status;
        if (
          status !== 'succeeded' &&
          status !== 'failed' &&
          status !== 'cancelled'
        ) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setPollingBundle(true);
          const taskId = related.id;
          pollTimerRef.current = setInterval(() => {
            void pollBundleTask(taskId);
          }, 3000);
        }
      } else {
        setBundleTask(null);
      }
    } finally {
      setLoading(false);
    }
  }, [inspectionId, pollBundleTask]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  // Sort findings by severity: critical > warning > info
  const sortedFindings = useMemo(
    () =>
      [...findings].sort(
        (a, b) =>
          getFindingSeverityScore(b.severity) -
          getFindingSeverityScore(a.severity),
      ),
    [findings],
  );

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const handleConfirmAndCreateBundle = useCallback(() => {
    const base = report?.lookback_minutes || 30;
    setBundleLookbackMinutes(
      base < 5 || base > 1440 ? 30 : base,
    );
    setConfirmDialogOpen(true);
  }, [report]);

  const handleCreateBundle = useCallback(async () => {
    if (!report) {
      return;
    }
    if (bundleLookbackMinutes < 5 || bundleLookbackMinutes > 1440) {
      toast.error('时间范围需在 5 ~ 1440 分钟之间');
      return;
    }
    const firstFinding =
      findings.find((f) => f.severity === 'critical') ??
      findings.find((f) => f.severity === 'warning') ??
      findings[0];

    setCreatingBundle(true);
    setConfirmDialogOpen(false);
    try {
      const payloadScope: DiagnosticsTaskNodeScope = nodeScope || 'all';
      const result = await services.diagnostics.createTaskSafe({
        cluster_id: report.cluster_id,
        trigger_source: firstFinding ? 'inspection_finding' : 'manual',
        source_ref: firstFinding
          ? {
              inspection_report_id: report.id,
              inspection_finding_id: firstFinding.id,
            }
          : undefined,
        node_scope: payloadScope,
        options: bundleOptions,
        lookback_minutes: bundleLookbackMinutes,
        auto_start: true,
      });
      if (!result.success || !result.data) {
        toast.error(result.error || '诊断包生成失败');
        return;
      }
      toast.success('诊断包生成已启动');
      setBundleTask(result.data);
      setPollingBundle(true);
      const taskId = result.data.id;
      pollTimerRef.current = setInterval(() => {
        void pollBundleTask(taskId);
      }, 3000);
    } finally {
      setCreatingBundle(false);
    }
  }, [bundleOptions, findings, nodeScope, pollBundleTask, report]);

  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-10 w-48' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    );
  }

  if (!report) {
    return (
      <div className='space-y-4'>
        <Button asChild variant='ghost'>
          <Link href='/diagnostics?tab=inspections'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            返回巡检列表
          </Link>
        </Button>
        <Card>
          <CardContent className='py-8 text-center text-muted-foreground'>
            巡检报告不存在或加载失败
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCompleted = report.status === 'completed';
  const hasFindings = findings.length > 0;

  return (
    <div className='space-y-4'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button asChild variant='ghost' size='sm'>
          <Link href='/diagnostics?tab=inspections'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            返回巡检列表
          </Link>
        </Button>
        <h1 className='text-2xl font-bold tracking-tight'>巡检详情</h1>
        <Badge variant='outline'>#{report.id}</Badge>
      </div>

      {/* Status Banner */}
      <Card>
        <CardContent className='space-y-3 pt-6'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant={getStatusVariant(report.status)}>
              {getStatusLabel(report.status)}
            </Badge>
            <Badge variant='outline'>
              {getTriggerSourceLabel(report.trigger_source)}
            </Badge>
            {report.cluster_name ? (
              <Badge variant='outline'>{report.cluster_name}</Badge>
            ) : (
              <Badge variant='outline'>集群 #{report.cluster_id}</Badge>
            )}
          </div>
          {report.trigger_source === 'auto' && report.auto_trigger_reason ? (
            <div className='rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800'>
              自动触发原因：{report.auto_trigger_reason}
            </div>
          ) : null}
          <div className='grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4'>
            <div>
              <span className='text-muted-foreground'>创建时间：</span>
              {formatDateTime(report.created_at)}
            </div>
            <div>
              <span className='text-muted-foreground'>完成时间：</span>
              {formatDateTime(report.finished_at)}
            </div>
            <div>
              <span className='text-muted-foreground'>回溯时间：</span>
              {report.lookback_minutes || 30} 分钟
            </div>
            <div>
              <span className='text-muted-foreground'>发起人：</span>
              {report.requested_by || '-'}
            </div>
          </div>
          {report.summary ? (
            <div className='text-sm'>
              {localizeDiagnosticsText(report.summary)}
            </div>
          ) : null}
          {report.error_message ? (
            <div className='rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive'>
              {report.error_message}
            </div>
          ) : null}
          <div className='text-sm text-muted-foreground'>
            发现统计：共 {report.finding_total} 条（严重{' '}
            {report.critical_count} / 警告 {report.warning_count} / 信息{' '}
            {report.info_count}）
          </div>
        </CardContent>
      </Card>

      {/* Findings Section */}
      <Card>
        <CardHeader>
          <CardTitle>巡检发现</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedFindings.length === 0 ? (
            <div className='flex items-center justify-center rounded-lg border border-dashed p-8 text-sm text-muted-foreground'>
              暂无巡检发现
            </div>
          ) : (
            <div className='space-y-4'>
              {sortedFindings.map((finding) => (
                <div
                  key={finding.id}
                  className='rounded-lg border p-4 space-y-3'
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge
                      variant='outline'
                      className={getSeverityBadgeClass(finding.severity)}
                    >
                      {getSeverityLabel(finding.severity)}
                    </Badge>
                    <Badge variant='outline'>{finding.category}</Badge>
                    <Badge variant='outline'>{finding.check_code}</Badge>
                  </div>
                  <div className='font-medium'>
                    {localizeDiagnosticsText(
                      finding.check_name || finding.summary,
                    )}
                  </div>
                  <div className='text-sm text-muted-foreground'>
                    {localizeDiagnosticsText(finding.summary)}
                  </div>
                  {finding.evidence_summary ? (
                    <div className='rounded-md bg-muted/40 p-3 text-sm text-muted-foreground'>
                      {localizeDiagnosticsText(finding.evidence_summary)}
                    </div>
                  ) : null}
                  {finding.recommendation ? (
                    <div className='text-sm text-muted-foreground'>
                      建议：{localizeDiagnosticsText(finding.recommendation)}
                    </div>
                  ) : null}
                  <div className='text-xs text-muted-foreground'>
                    来源节点：
                    {formatNodeOrigin({
                      nodeId: finding.related_node_id,
                      hostId: finding.related_host_id,
                      hostName: finding.related_host_name,
                      hostIp: finding.related_host_ip,
                    })}
                  </div>
                  {finding.related_error_group_id > 0 ? (
                    <Button asChild size='sm' variant='outline'>
                      <Link
                        href={`/diagnostics?tab=errors&cluster_id=${finding.cluster_id}&group_id=${finding.related_error_group_id}&source=inspection-finding`}
                      >
                        查看错误组 &rarr;
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnostic Bundle Section */}
      {isCompleted ? (
        <Card>
          <CardHeader>
            <CardTitle>诊断包</CardTitle>
          </CardHeader>
          <CardContent>
            {bundleTask ? (
              <div className='space-y-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant={getStatusVariant(bundleTask.status)}>
                    {getStatusLabel(bundleTask.status)}
                  </Badge>
                  <Badge variant='outline'>任务 #{bundleTask.id}</Badge>
                  {pollingBundle ? (
                    <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                      <Loader2 className='h-3 w-3 animate-spin' />
                      正在刷新...
                    </span>
                  ) : null}
                </div>

                <div className='flex flex-wrap gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setExecLogDialogOpen(true)}
                  >
                    <FileText className='mr-2 h-4 w-4' />
                    查看执行日志
                  </Button>
                  {bundleTask.status === 'succeeded' ? (
                    <>
                      <Button asChild variant='outline' size='sm'>
                        <a
                          href={services.diagnostics.getTaskHTMLUrl(
                            bundleTask.id,
                          )}
                          target='_blank'
                          rel='noopener noreferrer'
                        >
                          <ExternalLink className='mr-2 h-4 w-4' />
                          预览报告
                        </a>
                      </Button>
                      <Button asChild variant='outline' size='sm'>
                        <a
                          href={services.diagnostics.getTaskBundleUrl(
                            bundleTask.id,
                          )}
                          download
                        >
                          <Download className='mr-2 h-4 w-4' />
                          下载诊断包
                        </a>
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={handleConfirmAndCreateBundle}
                        disabled={creatingBundle}
                      >
                        {creatingBundle ? (
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        ) : (
                          <Package className='mr-2 h-4 w-4' />
                        )}
                        重新生成
                      </Button>
                    </>
                  ) : null}
                  {bundleTask.status === 'failed' ? (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={handleConfirmAndCreateBundle}
                      disabled={creatingBundle}
                    >
                      {creatingBundle ? (
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      ) : (
                        <Package className='mr-2 h-4 w-4' />
                      )}
                      重新生成
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : hasFindings ? (
              <div className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  巡检已发现 {findings.length} 条问题，可一键生成诊断包与诊断报告。
                </p>
                <Button
                  onClick={handleConfirmAndCreateBundle}
                  disabled={creatingBundle}
                >
                  {creatingBundle ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <Package className='mr-2 h-4 w-4' />
                  )}
                  一键生成诊断包和诊断报告
                </Button>
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>
                巡检已完成，未发现问题，无需生成诊断包。
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* 生成确认弹窗 */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>确认生成诊断包</DialogTitle>
            <DialogDescription>
              将采集时间范围内的错误日志、告警信息及指标数据，并可选采集线程 Dump 与 JVM Dump。
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='bundle-lookback'>时间范围（分钟）</Label>
              <Input
                id='bundle-lookback'
                type='number'
                min={5}
                max={1440}
                step={5}
                value={bundleLookbackMinutes}
                onChange={(event) =>
                  setBundleLookbackMinutes(
                    Number.parseInt(event.target.value, 10) || 30,
                  )
                }
              />
              <p className='text-xs text-muted-foreground'>
                默认与巡检时间范围一致，可在此按需调整，用于采集该时段内的现场证据。
              </p>
            </div>
            <div className='space-y-3'>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div>
                  <div className='font-medium'>采集线程 Dump</div>
                  <div className='text-xs text-muted-foreground'>
                    用于分析线程状态、死锁等问题。
                  </div>
                </div>
                <Switch
                  checked={bundleOptions.include_thread_dump}
                  onCheckedChange={(checked) =>
                    setBundleOptions((c) => ({
                      ...c,
                      include_thread_dump: checked,
                    }))
                  }
                />
              </div>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div>
                  <div className='font-medium'>采集 JVM Dump</div>
                  <div className='text-xs text-muted-foreground'>
                    体积较大，仅在需深入分析内存时开启。
                  </div>
                </div>
                <Switch
                  checked={bundleOptions.include_jvm_dump}
                  onCheckedChange={(checked) =>
                    setBundleOptions((c) => ({
                      ...c,
                      include_jvm_dump: checked,
                    }))
                  }
                />
              </div>
              <div className='flex flex-wrap gap-2 text-xs'>
                <Button
                  type='button'
                  variant={nodeScope === 'all' ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setNodeScope('all')}
                >
                  全部节点
                </Button>
                <Button
                  type='button'
                  variant={nodeScope === 'related' ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setNodeScope('related')}
                >
                  仅问题相关节点
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setConfirmDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={() => void handleCreateBundle()}
              disabled={creatingBundle}
            >
              {creatingBundle ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : null}
              确认生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 查看执行日志弹窗 */}
      <Dialog open={execLogDialogOpen} onOpenChange={setExecLogDialogOpen}>
        <DialogContent className='max-h-[85vh] overflow-hidden flex flex-col sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>执行日志</DialogTitle>
            <DialogDescription>
              诊断包生成步骤及执行状态
            </DialogDescription>
          </DialogHeader>
          <div className='flex-1 overflow-y-auto space-y-3 py-2'>
            {bundleTask?.steps?.length ? (
              bundleTask.steps.map((step) => (
                <div
                  key={step.id}
                  className='rounded-lg border p-3 space-y-1'
                >
                  <div className='flex items-center gap-2'>
                    <Badge
                      variant={getStatusVariant(step.status)}
                      className='text-xs'
                    >
                      {getStatusLabel(step.status)}
                    </Badge>
                    <span className='font-mono text-xs text-muted-foreground'>
                      {step.code}
                    </span>
                  </div>
                  <div className='text-sm'>
                    {localizeDiagnosticsText(step.title) || step.description}
                  </div>
                  {(step.error || step.message) ? (
                    <div className='rounded bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground'>
                      {step.error || step.message}
                    </div>
                  ) : null}
                </div>
              ))
            ) : bundleTask?.failure_reason ? (
              <div className='rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive'>
                {bundleTask.failure_reason}
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>暂无执行步骤记录</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
