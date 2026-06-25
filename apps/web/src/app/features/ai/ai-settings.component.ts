import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AI_NOT_IMPLEMENTED_MESSAGE, AiIntegrationService, AiNotImplementedError } from './ai-integration.service';

/**
 * Configuration surface for the AI / Agents integration.
 *
 * Scaffold only: this panel persists configuration and exposes the integration
 * points, but performs NO live API calls. Live analysis runs server-side once a
 * key is configured (env / Doppler) and a backend endpoint exists.
 */
@Component({
  selector: 'app-ai-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ai-panel" aria-labelledby="ai-settings-title">
      <header class="ai-panel__header">
        <p class="ai-panel__eyebrow">Scaffold</p>
        <h2 id="ai-settings-title" class="ai-panel__title">AI / Agents integration</h2>
        <p class="ai-panel__subtitle">
          Configure how board analysis will run. The provider key is never stored in the browser — it lives
          server-side and live calls go through a future backend endpoint.
        </p>
      </header>

      <p
        class="ai-status"
        [class.ai-status--ready]="ai.isConfigured()"
        role="status"
        aria-live="polite"
      >
        <span class="ai-status__dot" aria-hidden="true"></span>
        <span class="ai-status__text">
          @if (ai.isConfigured()) {
            Configured ({{ ai.config().provider }} · {{ ai.config().model }}) — still not connected. Integration
            point: live analysis will run server-side once a key is configured.
          } @else {
            Not connected. Integration point — live analysis will run server-side once a key is configured.
          }
        </span>
      </p>

      <form class="ai-form" (submit)="onSave($event)">
        <label class="ai-field ai-field--toggle" for="ai-enabled">
          <span class="ai-field__label">Enable AI integration</span>
          <input
            id="ai-enabled"
            type="checkbox"
            [checked]="enabled()"
            (change)="enabled.set(asChecked($event))"
          />
        </label>

        <label class="ai-field" for="ai-provider">
          <span class="ai-field__label">Provider</span>
          <input
            id="ai-provider"
            name="provider"
            type="text"
            autocomplete="off"
            [value]="provider()"
            (input)="provider.set(asValue($event))"
          />
        </label>

        <label class="ai-field" for="ai-model">
          <span class="ai-field__label">Model</span>
          <input
            id="ai-model"
            name="model"
            type="text"
            autocomplete="off"
            [value]="model()"
            (input)="model.set(asValue($event))"
          />
        </label>

        <label class="ai-field" for="ai-instructions">
          <span class="ai-field__label">Analysis instructions</span>
          <textarea
            id="ai-instructions"
            name="instructions"
            rows="4"
            [value]="instructions()"
            (input)="instructions.set(asValue($event))"
            placeholder="Describe how the AI should analyze a PDI board…"
          ></textarea>
        </label>

        <div class="ai-actions">
          <button type="submit" class="ai-button ai-button--primary">Save</button>
          <button type="button" class="ai-button" (click)="onReset()">Reset</button>
        </div>
      </form>

      <div class="ai-integration-point">
        <h3 class="ai-integration-point__title">Integration point</h3>
        <p class="ai-integration-point__hint">
          This action is a scaffold. Wiring it to the Claude-backed endpoint is the only remaining step.
        </p>
        <button
          type="button"
          class="ai-button ai-button--ghost"
          [attr.aria-describedby]="analysisNotice() ? 'ai-analysis-notice' : null"
          (click)="onAnalyzeBoard()"
        >
          Analyze board with AI
        </button>
        @if (analysisNotice(); as notice) {
          <p id="ai-analysis-notice" class="ai-notice" role="status" aria-live="polite">{{ notice }}</p>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .ai-panel {
        background: var(--color-surface-raised);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg);
        color: var(--color-content-primary);
        display: grid;
        gap: 16px;
        padding: 18px 20px;
      }

      .ai-panel__eyebrow {
        color: var(--color-content-muted);
        font: var(--font-body-xs);
        letter-spacing: 0.08em;
        margin: 0 0 4px;
        text-transform: uppercase;
      }

      .ai-panel__title {
        font: var(--font-title-md);
        margin: 0;
      }

      .ai-panel__subtitle {
        color: var(--color-content-muted);
        font: var(--font-body-sm);
        margin: 6px 0 0;
        max-width: 60ch;
      }

      .ai-status {
        align-items: center;
        background: var(--color-surface-floating);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        color: var(--color-content-muted);
        display: flex;
        font: var(--font-body-sm);
        gap: 10px;
        margin: 0;
        padding: 12px 14px;
      }

      .ai-status__dot {
        background: var(--color-content-muted);
        border-radius: 50%;
        flex: 0 0 auto;
        height: 10px;
        width: 10px;
      }

      .ai-status--ready .ai-status__dot {
        background: var(--color-action-primary);
      }

      .ai-form {
        display: grid;
        gap: 12px;
      }

      .ai-field {
        display: grid;
        gap: 6px;
      }

      .ai-field--toggle {
        align-items: center;
        grid-auto-flow: column;
        justify-content: space-between;
      }

      .ai-field__label {
        font: var(--font-label-md);
      }

      .ai-field input[type='text'],
      .ai-field textarea {
        background: var(--color-surface-base);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        color: var(--color-content-primary);
        font: var(--font-body-sm);
        padding: 9px 11px;
        width: 100%;
      }

      .ai-field textarea {
        resize: vertical;
      }

      .ai-field input:focus-visible,
      .ai-field textarea:focus-visible,
      .ai-button:focus-visible {
        outline: 2px solid var(--color-action-primary);
        outline-offset: 2px;
      }

      .ai-actions {
        display: flex;
        gap: 10px;
      }

      .ai-button {
        background: var(--color-surface-floating);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        color: var(--color-content-primary);
        cursor: pointer;
        font: var(--font-label-md);
        padding: 9px 16px;
      }

      .ai-button--primary {
        background: var(--color-action-primary);
        border-color: var(--color-action-primary-strong);
        color: var(--color-content-on-primary);
      }

      .ai-button--ghost {
        background: transparent;
      }

      .ai-integration-point {
        border: 1px dashed var(--color-border-subtle);
        border-radius: var(--radius-md);
        display: grid;
        gap: 8px;
        padding: 14px;
      }

      .ai-integration-point__title {
        font: var(--font-title-sm);
        margin: 0;
      }

      .ai-integration-point__hint {
        color: var(--color-content-muted);
        font: var(--font-body-sm);
        margin: 0;
      }

      .ai-notice {
        color: var(--color-content-muted);
        font: var(--font-body-xs);
        margin: 0;
      }
    `
  ]
})
export class AiSettingsComponent {
  protected readonly ai = inject(AiIntegrationService);

  protected readonly enabled = signal(this.ai.config().enabled);
  protected readonly provider = signal(this.ai.config().provider);
  protected readonly model = signal(this.ai.config().model);
  protected readonly instructions = signal(this.ai.config().analysisInstructions);
  protected readonly analysisNotice = signal<string | null>(null);

  protected readonly onSave = (event: Event) => {
    event.preventDefault();
    this.ai.update({
      enabled: this.enabled(),
      provider: this.provider().trim(),
      model: this.model().trim(),
      analysisInstructions: this.instructions()
    });
  };

  protected readonly onReset = () => {
    this.ai.reset();
    const config = this.ai.config();
    this.enabled.set(config.enabled);
    this.provider.set(config.provider);
    this.model.set(config.model);
    this.instructions.set(config.analysisInstructions);
    this.analysisNotice.set(null);
  };

  /**
   * Integration point: this exercises the stubbed {@link AiIntegrationService.analyzeBoard}
   * to make clear where the future Claude-backed call will run. It performs no
   * network request and surfaces the not-implemented notice in-panel (no alert).
   */
  protected readonly onAnalyzeBoard = async () => {
    try {
      await this.ai.analyzeBoard({ planId: 'preview', boardTitle: 'Current board' });
    } catch (error) {
      this.analysisNotice.set(error instanceof AiNotImplementedError ? error.message : AI_NOT_IMPLEMENTED_MESSAGE);
    }
  };

  protected readonly asValue = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  protected readonly asChecked = (event: Event) => (event.target as HTMLInputElement).checked;
}
