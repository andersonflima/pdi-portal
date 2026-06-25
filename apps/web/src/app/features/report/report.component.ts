import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import type { Board, PdiPlan } from '@pdi/contracts';
import { ApiRequestError, ApiService } from '../../core/api/api.service';
import {
  summarizeBoardProgress,
  type BoardProgressSummary,
  type NodeProgressInsight,
  type ProgressStatus,
  type ProgressTrackable
} from '../progress/progress-analysis';
import { barWidths, circleCircumference, donutDashArray, percentToLength } from './report-charts';

const STATUS_COLORS: Record<ProgressStatus, string> = {
  done: '#2e9b6b',
  'on-track': '#2e9b6b',
  ahead: '#0d8f8f',
  behind: '#d98414',
  overdue: '#d9504a',
  'not-started': '#6b7a90'
};

const STATUS_LABELS: Record<ProgressStatus, string> = {
  done: 'Done',
  'on-track': 'On track',
  ahead: 'Ahead',
  behind: 'Behind',
  overdue: 'Overdue',
  'not-started': 'Not started'
};

/** Order the status bars are rendered in (stable, color-coded). */
const STATUS_ORDER: readonly ProgressStatus[] = [
  'done',
  'on-track',
  'ahead',
  'behind',
  'overdue',
  'not-started'
];

const DONUT_RADIUS = 52;
const DONUT_CIRCUMFERENCE = circleCircumference(DONUT_RADIUS);
const BAR_TRACK_WIDTH = 240;
const STEP_TRACK_WIDTH = 100;

type StatusBar = {
  status: ProgressStatus;
  label: string;
  color: string;
  count: number;
  width: number;
};

type StepView = {
  id: string;
  label: string;
  status: ProgressStatus;
  statusLabel: string;
  color: string;
  progress: number;
  progressWidth: number;
  expectedProgress: number | null;
  expectedOffset: number | null;
  deadline: string | null;
};

const toTrackable = (node: Board['nodes'][number]): ProgressTrackable => ({
  id: node.id,
  kind: node.kind,
  label: node.label,
  progress: node.progress,
  startDate: node.startDate,
  targetDate: node.targetDate
});

const toDeadlineLabel = (days: number | null): string | null => {
  if (days === null) return null;
  if (days === 0) return 'Due today';
  return days > 0 ? `${days} days left` : `${Math.abs(days)} days late`;
};

const toStepView = (insight: NodeProgressInsight): StepView => ({
  id: insight.id,
  label: insight.label,
  status: insight.status,
  statusLabel: STATUS_LABELS[insight.status],
  color: STATUS_COLORS[insight.status],
  progress: insight.progress,
  progressWidth: percentToLength(insight.progress, STEP_TRACK_WIDTH),
  expectedProgress: insight.expectedProgress,
  expectedOffset:
    insight.expectedProgress === null ? null : percentToLength(insight.expectedProgress, STEP_TRACK_WIDTH),
  deadline: toDeadlineLabel(insight.daysRemaining)
});

@Component({
  selector: 'app-report',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="report">
      <header class="report-head">
        <div>
          <p class="report-eyebrow">Progress report</p>
          <h2 class="report-title">{{ plan()?.title ?? 'No plan selected' }}</h2>
        </div>
        @if (plan()) {
          <button type="button" class="report-print" (click)="print()">Print / Save as PDF</button>
        }
      </header>

      @if (!plan()) {
        <p class="report-state">Select a PDI plan to generate its progress report.</p>
      } @else if (loading()) {
        <p class="report-state">Analyzing board…</p>
      } @else if (error(); as message) {
        <p class="report-state report-state-error" role="alert">{{ message }}</p>
      } @else if (summary(); as data) {
        @if (data.trackedCount === 0) {
          <p class="report-state">No steps are being tracked yet — set progress on board items.</p>
        } @else {
          <div class="report-stats">
            <div class="stat">
              <span class="stat-value">{{ data.averageProgress }}%</span>
              <span class="stat-label">Overall completion</span>
            </div>
            <div class="stat">
              <span class="stat-value">
                {{ data.averageProgress }}%
                <small class="stat-versus">
                  vs {{ data.averageExpectedProgress === null ? '—' : data.averageExpectedProgress + '%' }}
                </small>
              </span>
              <span class="stat-label">Actual vs expected</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ data.trackedCount }}</span>
              <span class="stat-label">Tracked steps</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ data.completedCount }}</span>
              <span class="stat-label">Completed</span>
            </div>
          </div>

          <div class="report-charts">
            <figure class="chart chart-donut">
              <figcaption class="chart-title">Overall completion</figcaption>
              <svg viewBox="0 0 120 120" role="img" [attr.aria-label]="data.averageProgress + '% complete'">
                <circle class="donut-track" cx="60" cy="60" [attr.r]="donutRadius" />
                <circle
                  class="donut-value"
                  cx="60"
                  cy="60"
                  [attr.r]="donutRadius"
                  [attr.stroke-dasharray]="donutDash().dash + ' ' + donutDash().gap"
                  transform="rotate(-90 60 60)"
                />
                <text class="donut-label" x="60" y="60" text-anchor="middle" dominant-baseline="central">
                  {{ data.averageProgress }}%
                </text>
              </svg>
            </figure>

            <figure class="chart chart-bars">
              <figcaption class="chart-title">Status distribution</figcaption>
              <ul class="bars">
                @for (bar of statusBars(); track bar.status) {
                  <li class="bar-row">
                    <span class="bar-name">{{ bar.label }}</span>
                    <span class="bar-track">
                      <span class="bar-fill" [style.width.px]="bar.width" [style.background]="bar.color"></span>
                    </span>
                    <span class="bar-count">{{ bar.count }}</span>
                  </li>
                }
              </ul>
            </figure>
          </div>

          <ul class="steps">
            @for (step of steps(); track step.id) {
              <li class="step">
                <div class="step-head">
                  <span class="step-label">{{ step.label }}</span>
                  <span class="step-badge" [style.background]="step.color">{{ step.statusLabel }}</span>
                </div>
                <div class="step-meta">
                  <span class="step-track">
                    <span class="step-fill" [style.width.px]="step.progressWidth" [style.background]="step.color"></span>
                    @if (step.expectedOffset !== null) {
                      <span
                        class="step-marker"
                        [style.left.px]="step.expectedOffset"
                        [attr.title]="'Expected ' + step.expectedProgress + '%'"
                      ></span>
                    }
                  </span>
                  <span class="step-pct">{{ step.progress }}%</span>
                  @if (step.deadline) {
                    <span class="step-deadline">{{ step.deadline }}</span>
                  }
                </div>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        color: var(--color-content-primary);
        font: var(--font-body-sm);
      }

      .report {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 24px;
        background: var(--color-surface-raised);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg);
      }

      .report-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .report-eyebrow {
        margin: 0 0 4px;
        font: var(--font-body-xs);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-content-muted);
      }

      .report-title {
        margin: 0;
        font: var(--font-title-md);
      }

      .report-print {
        flex: none;
        padding: 9px 16px;
        font: var(--font-label-md);
        color: var(--color-content-on-primary);
        background: var(--color-action-primary);
        border: none;
        border-radius: var(--radius-sm);
        cursor: pointer;
      }

      .report-print:hover {
        background: var(--color-action-primary-strong);
      }

      .report-state {
        margin: 0;
        padding: 32px;
        text-align: center;
        color: var(--color-content-muted);
        background: var(--color-surface-base);
        border-radius: var(--radius-md);
      }

      .report-state-error {
        color: #d9504a;
      }

      .report-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
      }

      .stat {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 16px;
        background: var(--color-surface-base);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
      }

      .stat-value {
        font: var(--font-title-md);
      }

      .stat-versus {
        font: var(--font-body-xs);
        color: var(--color-content-muted);
      }

      .stat-label {
        font: var(--font-body-xs);
        color: var(--color-content-muted);
      }

      .report-charts {
        display: grid;
        grid-template-columns: minmax(160px, 220px) 1fr;
        gap: 20px;
        align-items: center;
      }

      .chart {
        margin: 0;
        padding: 16px;
        background: var(--color-surface-base);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
      }

      .chart-title {
        margin: 0 0 12px;
        font: var(--font-label-md);
        color: var(--color-content-muted);
      }

      .chart-donut svg {
        width: 100%;
        max-width: 180px;
        display: block;
        margin: 0 auto;
      }

      .donut-track {
        fill: none;
        stroke: var(--color-border-subtle);
        stroke-width: 14;
      }

      .donut-value {
        fill: none;
        stroke: #2e9b6b;
        stroke-width: 14;
        stroke-linecap: round;
        transition: stroke-dasharray 0.4s ease;
      }

      .donut-label {
        fill: var(--color-content-primary);
        font: var(--font-title-md);
      }

      .bars {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .bar-row {
        display: grid;
        grid-template-columns: 90px 1fr 28px;
        align-items: center;
        gap: 10px;
      }

      .bar-name {
        font: var(--font-body-xs);
        color: var(--color-content-muted);
      }

      .bar-track {
        height: 14px;
        border-radius: 999px;
        background: var(--color-border-subtle);
        overflow: hidden;
      }

      .bar-fill {
        display: block;
        height: 100%;
        min-width: 2px;
        border-radius: 999px;
        transition: width 0.4s ease;
      }

      .bar-count {
        font: var(--font-label-md);
        text-align: right;
      }

      .steps {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .step {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 14px;
        background: var(--color-surface-base);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
      }

      .step-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .step-label {
        font: var(--font-label-md);
      }

      .step-badge {
        flex: none;
        padding: 3px 10px;
        font: var(--font-body-xs);
        color: #fff;
        border-radius: 999px;
      }

      .step-meta {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .step-track {
        position: relative;
        flex: 1;
        height: 10px;
        border-radius: 999px;
        background: var(--color-border-subtle);
        overflow: hidden;
      }

      .step-fill {
        display: block;
        height: 100%;
        min-width: 2px;
        border-radius: 999px;
      }

      .step-marker {
        position: absolute;
        top: -3px;
        width: 2px;
        height: 16px;
        background: var(--color-content-primary);
        transform: translateX(-1px);
      }

      .step-pct {
        flex: none;
        width: 42px;
        text-align: right;
        font: var(--font-label-md);
      }

      .step-deadline {
        flex: none;
        font: var(--font-body-xs);
        color: var(--color-content-muted);
      }

      @media (max-width: 640px) {
        .report-charts {
          grid-template-columns: 1fr;
        }
      }

      @media print {
        :host {
          color: #111;
        }

        .report {
          border: none;
          padding: 0;
          background: #fff;
        }

        .report,
        .chart,
        .stat,
        .step,
        .bar-fill,
        .step-fill,
        .step-badge,
        .donut-value {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .report-print {
          display: none;
        }
      }
    `
  ]
})
export class ReportComponent {
  readonly plan = input<PdiPlan | null>(null);

  private readonly api = inject(ApiService);

  protected readonly donutRadius = DONUT_RADIUS;

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly summary = signal<BoardProgressSummary | null>(null);

  /** Monotonic token so only the latest in-flight request applies its result. */
  private requestToken = 0;

  protected readonly donutDash = computed(() => {
    const data = this.summary();
    return donutDashArray(data?.averageProgress ?? 0, DONUT_CIRCUMFERENCE);
  });

  protected readonly statusBars = computed<StatusBar[]>(() => {
    const counts = this.summary()?.statusCounts;
    if (!counts) return [];
    const widths = barWidths(
      STATUS_ORDER.map((status) => counts[status]),
      BAR_TRACK_WIDTH
    );
    return STATUS_ORDER.map((status, index) => ({
      status,
      label: STATUS_LABELS[status],
      color: STATUS_COLORS[status],
      count: counts[status],
      width: widths[index] ?? 0
    }));
  });

  protected readonly steps = computed<StepView[]>(() => (this.summary()?.insights ?? []).map(toStepView));

  constructor() {
    effect(() => {
      const plan = this.plan();
      this.loadReport(plan);
    });
  }

  protected readonly print = () => window.print();

  private readonly loadReport = (plan: PdiPlan | null): void => {
    const token = ++this.requestToken;

    if (!plan) {
      this.loading.set(false);
      this.error.set(null);
      this.summary.set(null);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.api
      .board(plan.id)
      .then((board) => {
        if (token !== this.requestToken) return;
        const trackables = board.nodes.map(toTrackable);
        this.summary.set(summarizeBoardProgress(trackables, new Date()));
        this.loading.set(false);
      })
      .catch((cause: unknown) => {
        if (token !== this.requestToken) return;
        this.summary.set(null);
        this.error.set(
          cause instanceof ApiRequestError ? cause.message : 'Could not load the board for this plan.'
        );
        this.loading.set(false);
      });
  };
}
