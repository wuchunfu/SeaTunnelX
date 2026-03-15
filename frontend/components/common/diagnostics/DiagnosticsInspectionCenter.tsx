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

import {type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {ClipboardCheck, Download, ExternalLink, FileText, Loader2, Package, RefreshCw} from 'lucide-react';
import {toast} from 'sonner';
import services from '@/lib/services';
import type {
  DiagnosticsInspectionFinding,
  DiagnosticsInspectionFindingSeverity,
  DiagnosticsInspectionReport,
  DiagnosticsInspectionReportStatus,
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
import {ScrollArea} from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Skeleton} from '@/components/ui/skeleton';
import {Switch} from '@/components/ui/switch';
import {localizeDiagnosticsText} from './text-utils';

const DEFAULT_BUNDLE_OPTIONS: DiagnosticsTaskOptions = {
  include_thread_dump: true,
  include_jvm_dump: false,
  jvm_dump_min_free_mb: 2048,
  log_sample_lines: 200,
};

type DiagnosticsInspectionCenterProps = {
  clusterId?: number;
  clusterName?: string;
  reportId?: number;
  onSelectReport?: (reportId: number | null) => void;
};

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

function getTaskStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '等待中',
    ready: '就绪',
    running: '执行中',
    succeeded: '已完成',
    failed: '失败',
    skipped: '已跳过',
    cancelled: '已取消',
  };
  return map[status] ?? status;
}

function getSeverityVariant(
  severity: DiagnosticsInspectionFindingSeverity,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (severity) {
    case 'critical':
      return 'destructive';
    case 'warning':
      return 'secondary';
    case 'info':
    default:
      return 'outline';
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

export function DiagnosticsInspectionCenter({
  clusterId,
  clusterName,
  reportId,
  onSelectReport,
}: DiagnosticsInspectionCenterProps) {
  const t = useTranslations('diagnosticsCenter');
  const commonT = useTranslations('common');

  const [statusFilter, setStatusFilter] = useState<
    'all' | DiagnosticsInspectionReportStatus
  >('all');
  const [severityFilter, setSeverityFilter] = useState<
    'all' | DiagnosticsInspectionFindingSeverity
  >('all');
  const [page, setPage] = useState(1);
  const [loadingReports, setLoadingReports] = useState(true);
  const [startingInspection, setStartingInspection] = useState(false);
  const [lookbackMinutes, setLookbackMinutes] = useState(30);
  const [errorThreshold, setErrorThreshold] = useState(1);
  const [reports, setReports] = useState<DiagnosticsInspectionReport[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(
    reportId ?? null,
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedReport, setSelectedReport] =
    useState<DiagnosticsInspectionReport | null>(null);
  const [findings, setFindings] = useState<DiagnosticsInspectionFinding[]>([]);
  const [bundleTask, setBundleTask] = useState<DiagnosticsTask | null>(null);
  const [creatingBundle, setCreatingBundle] = useState(false);
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

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const result = await services.diagnostics.getInspectionReportsSafe({
        cluster_id: clusterId,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        severity: severityFilter !== 'all' ? severityFilter : undefined,
        page,
        page_size: 20,
      });
      if (!result.success || !result.data) {
        toast.error(result.error || t('inspections.loadReportsError'));
        setReports([]);
        setReportTotal(0);
        return;
      }
      setReports(result.data.items || []);
      setReportTotal(result.data.total || 0);
    } finally {
      setLoadingReports(false);
    }
  }, [clusterId, page, severityFilter, statusFilter, t]);

  const loadDetail = useCallback(
    async (nextReportId: number) => {
      setLoadingDetail(true);
      try {
        const result =
          await services.diagnostics.getInspectionReportDetailSafe(
            nextReportId,
          );
        if (!result.success || !result.data) {
          toast.error(result.error || t('inspections.loadDetailError'));
          setSelectedReport(null);
          setFindings([]);
          setBundleTask(null);
          return;
        }
        setSelectedReport(result.data.report);
        setFindings(result.data.findings || []);
        setBundleTask(result.data.related_diagnostic_task || null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (reports.length === 0) {
      setSelectedReportId(null);
      setSelectedReport(null);
      setFindings([]);
      setBundleTask(null);
      return;
    }
    if (
      !selectedReportId ||
      !reports.some((item) => item.id === selectedReportId)
    ) {
      setSelectedReportId(reports[0].id);
      onSelectReport?.(reports[0].id);
    }
  }, [onSelectReport, reports, selectedReportId]);

  useEffect(() => {
    if (
      !selectedReportId ||
      !reports.some((item) => item.id === selectedReportId)
    ) {
      return;
    }
    void loadDetail(selectedReportId);
  }, [loadDetail, reports, selectedReportId]);

  useEffect(() => {
    setSelectedReportId(reportId ?? null);
  }, [reportId]);

  const groupedFindings = useMemo(
    () =>
      findings.reduce<
        Record<
          DiagnosticsInspectionFindingSeverity,
          DiagnosticsInspectionFinding[]
        >
      >(
        (accumulator, finding) => {
          const bucket = accumulator[finding.severity] || [];
          bucket.push(finding);
          accumulator[finding.severity] = bucket;
          return accumulator;
        },
        {
          critical: [],
          warning: [],
          info: [],
        },
      ),
    [findings],
  );
  const hasFindings = findings.length > 0;
  const totalPages = Math.max(1, Math.ceil(reportTotal / 20));

  const pollBundleTask = useCallback(async (taskId: number) => {
    const result = await services.diagnostics.getTaskSafe(taskId);
    if (!result.success || !result.data) {
      return;
    }
    setBundleTask(result.data);
    if (['succeeded', 'failed', 'cancelled'].includes(result.data.status)) {
      setPollingBundle(false);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!bundleTask || !selectedReportId || bundleTask.id === 0) {
      return;
    }
    const status = bundleTask.status;
    if (['succeeded', 'failed', 'cancelled'].includes(status)) {
      return;
    }
    setPollingBundle(true);
    const taskId = bundleTask.id;
    pollTimerRef.current = setInterval(() => void pollBundleTask(taskId), 3000);
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [bundleTask, pollBundleTask, selectedReportId]);

  const handleConfirmAndCreateBundle = useCallback(() => {
    const base =
      selectedReport?.lookback_minutes || lookbackMinutes || 30;
    setBundleLookbackMinutes(
      base < 5 || base > 1440 ? 30 : base,
    );
    setConfirmDialogOpen(true);
  }, [lookbackMinutes, selectedReport]);

  const handleCreateBundle = useCallback(async () => {
    if (!selectedReport || creatingBundle) {
      return;
    }
    if (bundleLookbackMinutes < 5 || bundleLookbackMinutes > 1440) {
      toast.error(t('inspections.lookbackRangeError'));
      return;
    }
    const firstFinding =
      findings.find((f) => f.severity === 'critical') ??
      findings.find((f) => f.severity === 'warning') ??
      findings[0];
    setCreatingBundle(true);
    setConfirmDialogOpen(false);
    try {
      const result = await services.diagnostics.createTaskSafe({
        cluster_id: selectedReport.cluster_id,
        trigger_source: firstFinding ? 'inspection_finding' : 'manual',
        source_ref: firstFinding
          ? {
              inspection_report_id: selectedReport.id,
              inspection_finding_id: firstFinding.id,
            }
          : undefined,
        node_scope: nodeScope || 'all',
        options: bundleOptions,
        lookback_minutes: bundleLookbackMinutes,
        auto_start: true,
      });
      if (!result.success || !result.data) {
        toast.error(result.error || t('inspections.followUp.createTaskError'));
        return;
      }
      toast.success(t('inspections.followUp.createTaskSuccess'));
      setBundleTask(result.data);
      setPollingBundle(true);
    } finally {
      setCreatingBundle(false);
    }
  }, [
    bundleLookbackMinutes,
    bundleOptions,
    creatingBundle,
    findings,
    nodeScope,
    selectedReport,
    t,
  ]);

  const handleStartInspection = useCallback(async () => {
    if (!clusterId || startingInspection) {
      return;
    }
    if (lookbackMinutes < 5 || lookbackMinutes > 1440) {
      toast.error(t('inspections.lookbackRangeError'));
      return;
    }
    if (errorThreshold < 1 || errorThreshold > 1000) {
      toast.error(t('inspections.errorThresholdRangeError'));
      return;
    }
    setStartingInspection(true);
    try {
      const result = await services.diagnostics.startInspectionSafe({
        cluster_id: clusterId,
        trigger_source: 'diagnostics_workspace',
        lookback_minutes: lookbackMinutes,
        error_threshold: errorThreshold,
      });
      if (!result.success || !result.data?.report) {
        toast.error(result.error || t('inspections.startError'));
        return;
      }
      toast.success(t('inspections.startSuccess'));
      setPage(1);
      await loadReports();
      setSelectedReportId(result.data.report.id);
      onSelectReport?.(result.data.report.id);
      setSelectedReport(result.data.report);
      setFindings(result.data.findings || []);
    } finally {
      setStartingInspection(false);
    }
  }, [
    clusterId,
    errorThreshold,
    loadReports,
    lookbackMinutes,
    onSelectReport,
    startingInspection,
    t,
  ]);

  const handleInspectionInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      void handleStartInspection();
    },
    [handleStartInspection],
  );

  const handleBundleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      void handleCreateBundle();
    },
    [handleCreateBundle],
  );

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] xl:items-start'>
      <div className='space-y-4'>
        <Card>
          <CardHeader className='space-y-3'>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
              <div>
                <CardTitle>{t('inspections.title')}</CardTitle>
                <div className='mt-1 text-sm text-muted-foreground'>
                  {clusterId
                    ? t('inspections.clusterScopedHint', {
                        name: clusterName || `#${clusterId}`,
                      })
                    : t('inspections.globalHint')}
                </div>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='outline'>
                  {t('inspections.matchedReports', {count: reportTotal})}
                </Badge>
                <Button variant='outline' onClick={() => void loadReports()}>
                  <RefreshCw className='mr-2 h-4 w-4' />
                  {commonT('refresh')}
                </Button>
                <Button
                  onClick={() => void handleStartInspection()}
                  disabled={!clusterId || startingInspection}
                >
                  {startingInspection ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <ClipboardCheck className='mr-2 h-4 w-4' />
                  )}
                  {t('inspections.startInspection')}
                </Button>
              </div>
            </div>
            <div className='grid grid-cols-1 gap-3 lg:grid-cols-4'>
              <div className='space-y-2'>
                <Label>{t('inspections.filters.status')}</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setPage(1);
                    setStatusFilter(value as typeof statusFilter);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('inspections.filters.status')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>
                      {t('inspections.filters.allStatuses')}
                    </SelectItem>
                    <SelectItem value='completed'>
                      {t('inspections.status.completed')}
                    </SelectItem>
                    <SelectItem value='failed'>
                      {t('inspections.status.failed')}
                    </SelectItem>
                    <SelectItem value='running'>
                      {t('inspections.status.running')}
                    </SelectItem>
                    <SelectItem value='pending'>
                      {t('inspections.status.pending')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>{t('inspections.filters.severity')}</Label>
                <Select
                  value={severityFilter}
                  onValueChange={(value) => {
                    setPage(1);
                    setSeverityFilter(value as typeof severityFilter);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('inspections.filters.severity')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>
                      {t('inspections.filters.allSeverities')}
                    </SelectItem>
                    <SelectItem value='critical'>
                      {t('inspections.severity.critical')}
                    </SelectItem>
                    <SelectItem value='warning'>
                      {t('inspections.severity.warning')}
                    </SelectItem>
                    <SelectItem value='info'>
                      {t('inspections.severity.info')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='diagnostics-inspection-lookback'>
                  {t('inspections.lookbackLabel')}
                </Label>
                <Input
                  id='diagnostics-inspection-lookback'
                  type='number'
                  min={5}
                  max={1440}
                  step={5}
                  value={lookbackMinutes}
                  onChange={(event) =>
                    setLookbackMinutes(
                      Number.parseInt(event.target.value, 10) || 30,
                    )
                  }
                  onKeyDown={handleInspectionInputKeyDown}
                />
                <div className='text-xs text-muted-foreground'>
                  {t('inspections.lookbackHint')}
                </div>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='diagnostics-inspection-error-threshold'>
                  {t('inspections.errorThresholdLabel')}
                </Label>
                <Input
                  id='diagnostics-inspection-error-threshold'
                  type='number'
                  min={1}
                  max={1000}
                  step={1}
                  value={errorThreshold}
                  onChange={(event) =>
                    setErrorThreshold(
                      Number.parseInt(event.target.value, 10) || 1,
                    )
                  }
                  onKeyDown={handleInspectionInputKeyDown}
                />
                <div className='text-xs text-muted-foreground'>
                  {t('inspections.errorThresholdHint')}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className='flex min-h-[630px] flex-col overflow-hidden xl:h-[780px]'>
          <CardHeader>
            <CardTitle>{t('inspections.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-1 min-h-0 flex-col space-y-4'>
            {loadingReports ? (
              <div className='space-y-3'>
                <Skeleton className='h-24 w-full' />
                <Skeleton className='h-24 w-full' />
                <Skeleton className='h-24 w-full' />
              </div>
            ) : reports.length === 0 ? (
              <div className='flex flex-1 items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
                {t('inspections.empty')}
              </div>
            ) : (
              <>
                <ScrollArea className='min-h-0 flex-1 pr-3'>
                  <div className='space-y-3'>
                    {reports.map((report) => (
                      <button
                        key={report.id}
                        type='button'
                        className={
                          selectedReportId === report.id
                            ? 'flex min-h-[140px] w-full flex-col gap-3 rounded-lg border border-primary bg-muted/40 p-4 text-left'
                            : 'flex min-h-[140px] w-full flex-col gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/30'
                        }
                        onClick={() => {
                          setSelectedReportId(report.id);
                          onSelectReport?.(report.id);
                        }}
                      >
                        <div className='flex flex-wrap items-center gap-2'>
                          <Badge variant={getStatusVariant(report.status)}>
                            {t(`inspections.status.${report.status}`)}
                          </Badge>
                          <Badge variant='outline'>#{report.id}</Badge>
                          <Badge variant='outline'>
                            {t(`inspections.trigger.${report.trigger_source}`)}
                          </Badge>
                        </div>
                        <div className='min-w-0 flex-1'>
                          <div
                            className='line-clamp-2 font-medium leading-6'
                            title={
                              localizeDiagnosticsText(report.summary) ||
                              t('inspections.summaryFallback')
                            }
                          >
                            {localizeDiagnosticsText(report.summary) ||
                              t('inspections.summaryFallback')}
                          </div>
                          <div className='mt-1 text-sm text-muted-foreground'>
                            {t('inspections.counts', {
                              total: report.finding_total,
                              critical: report.critical_count,
                              warning: report.warning_count,
                              info: report.info_count,
                            })}
                          </div>
                          <div className='mt-1 text-xs text-muted-foreground'>
                            {t('inspections.lookbackValue', {
                              minutes: report.lookback_minutes || 30,
                            })}
                          </div>
                          <div className='mt-1 text-xs text-muted-foreground'>
                            {t('inspections.errorThresholdValue', {
                              count: report.error_threshold || 1,
                            })}
                          </div>
                        </div>
                        <div className='mt-auto flex items-center justify-between'>
                          <div className='text-xs text-muted-foreground'>
                            {t('inspections.finishedAt')}:{' '}
                            {formatDateTime(
                              report.finished_at || report.created_at,
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>

                <div className='flex items-center justify-between text-sm'>
                  <div className='text-muted-foreground'>
                    {t('errors.pageSummary', {page, totalPages})}
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        setPage((current) => Math.max(1, current - 1))
                      }
                      disabled={page <= 1}
                    >
                      {t('errors.previous')}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        setPage((current) =>
                          current >= totalPages ? current : current + 1,
                        )
                      }
                      disabled={page >= totalPages}
                    >
                      {t('errors.next')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className='flex min-h-[1020px] flex-col overflow-hidden xl:h-[1110px]'>
        <CardHeader>
          <CardTitle>{t('inspections.detailTitle')}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-1 min-h-0 flex-col space-y-4'>
          {loadingDetail ? (
            <div className='space-y-3'>
              <Skeleton className='h-20 w-full' />
              <Skeleton className='h-48 w-full' />
              <Skeleton className='h-56 w-full' />
            </div>
          ) : !selectedReport ? (
            <div className='flex flex-1 items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
              {t('inspections.selectReport')}
            </div>
          ) : (
            <>
              <div className='flex min-h-0 flex-1 flex-col space-y-3'>
                {selectedReport.status === 'completed' && hasFindings ? (
                  <div className='rounded-lg border bg-muted/20 p-4 space-y-3'>
                    {bundleTask ? (
                      <>
                        <div className='flex flex-wrap items-center gap-2'>
                          <Badge variant={getStatusVariant(bundleTask.status)}>
                            {getTaskStatusLabel(bundleTask.status)}
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
                                  href={services.diagnostics.getTaskHTMLUrl(bundleTask.id)}
                                  target='_blank'
                                  rel='noopener noreferrer'
                                >
                                  <ExternalLink className='mr-2 h-4 w-4' />
                                  预览报告
                                </a>
                              </Button>
                              <Button asChild variant='outline' size='sm'>
                                <a
                                  href={services.diagnostics.getTaskBundleUrl(bundleTask.id)}
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
                          ) : bundleTask.status === 'failed' ? (
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
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={handleConfirmAndCreateBundle}
                          disabled={creatingBundle}
                        >
                          {creatingBundle ? (
                            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                          ) : (
                            <Package className='mr-2 h-4 w-4' />
                          )}
                          {t('inspections.followUp.generateBundle')}
                        </Button>
                        <p className='text-xs text-muted-foreground'>
                          {t('inspections.followUp.generateHint')}
                        </p>
                      </>
                    )}
                  </div>
                ) : selectedReport.status === 'completed' && !hasFindings ? (
                  <div className='rounded-lg border bg-muted/20 p-4'>
                    <p className='text-sm text-muted-foreground'>
                      {t('inspections.followUp.noFindingsDescription')}
                    </p>
                  </div>
                ) : null}

                <div className='text-sm font-medium'>
                  {t('inspections.findingsTitle')}
                </div>
                {findings.length === 0 ? (
                  <div className='flex flex-1 items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
                    {t('inspections.noFindings')}
                  </div>
                ) : (
                  <ScrollArea className='min-h-0 flex-1 pr-3'>
                    <div className='space-y-4'>
                      {(['critical', 'warning', 'info'] as const).map(
                        (severity) => {
                          const severityItems = groupedFindings[severity];
                          if (!severityItems || severityItems.length === 0) {
                            return null;
                          }
                          return (
                            <div key={severity} className='space-y-3'>
                              <div className='flex items-center gap-2'>
                                <Badge variant={getSeverityVariant(severity)}>
                                  {t(`inspections.severity.${severity}`)}
                                </Badge>
                                <span className='text-sm text-muted-foreground'>
                                  {severityItems.length}
                                </span>
                              </div>
                              {severityItems.map((finding) => (
                                <div
                                  key={finding.id}
                                  className='rounded-lg border p-4'
                                >
                                  <div className='flex flex-wrap items-center gap-2'>
                                    <Badge
                                      variant={getSeverityVariant(
                                        finding.severity,
                                      )}
                                    >
                                      {t(
                                        `inspections.severity.${finding.severity}`,
                                      )}
                                    </Badge>
                                    <Badge variant='outline'>
                                      {finding.category}
                                    </Badge>
                                    <Badge variant='outline'>
                                      {finding.check_code}
                                    </Badge>
                                  </div>
                                  <div className='mt-3 space-y-2 text-sm'>
                                    <div className='font-medium'>
                                      {localizeDiagnosticsText(
                                        finding.check_name || finding.summary,
                                      )}
                                    </div>
                                    <div>
                                      {localizeDiagnosticsText(finding.summary)}
                                    </div>
                                    {finding.evidence_summary ? (
                                      <div className='rounded-md bg-muted/40 p-3 text-muted-foreground'>
                                        {localizeDiagnosticsText(
                                          finding.evidence_summary,
                                        )}
                                      </div>
                                    ) : null}
                                    {finding.recommendation ? (
                                      <div className='text-muted-foreground'>
                                        {localizeDiagnosticsText(
                                          finding.recommendation,
                                        )}
                                      </div>
                                    ) : null}
                                    <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                                      <span>
                                        {t('inspections.nodeLabel')}:{' '}
                                        {formatNodeOrigin({
                                          nodeId: finding.related_node_id,
                                          hostId: finding.related_host_id,
                                          hostName: finding.related_host_name,
                                          hostIp: finding.related_host_ip,
                                        })}
                                      </span>
                                      {finding.related_error_group_id > 0 ? (
                                        <Link
                                          href={`/diagnostics?tab=errors&cluster_id=${selectedReport.cluster_id}&group_id=${finding.related_error_group_id}&source=inspection-finding`}
                                          className='text-primary hover:underline'
                                        >
                                          {t('inspections.actions.viewErrorGroup')}
                                        </Link>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        },
                      )}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
                onKeyDown={handleBundleInputKeyDown}
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
                      {getTaskStatusLabel(step.status)}
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
