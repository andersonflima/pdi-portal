import { ChangeDetectionStrategy, Component, HostListener, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import type { PdiPlan, User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth/auth.service';
import { AiSettingsComponent } from '../ai/ai-settings.component';
import { CanvasBoardComponent } from '../canvas/canvas-board.component';
import { ReportComponent } from '../report/report.component';
import { CommandPaletteComponent } from './components/command-palette.component';
import { TechleadPdisPageComponent } from './techlead-pdis-page.component';
import { TechleadUsersPageComponent } from './techlead-users-page.component';
import { WorkspaceService } from './workspace.service';

type WorkspaceView = 'board' | 'pdis' | 'users' | 'report' | 'integrations';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    AiSettingsComponent,
    CanvasBoardComponent,
    CommandPaletteComponent,
    LucideAngularModule,
    ReportComponent,
    TechleadPdisPageComponent,
    TechleadUsersPageComponent
  ],
  providers: [WorkspaceService],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspaceComponent implements OnChanges {
  @Input({ required: true }) user!: User;
  protected activeView: WorkspaceView = 'board';
  protected readonly isCommandPaletteOpen = signal(false);

  private readonly auth = inject(AuthService);
  protected readonly workspace = inject(WorkspaceService);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['user']?.currentValue) {
      void this.workspace.load(this.user);
      this.activeView = 'board';
    }
  }

  protected readonly isTechLead = () => this.user.role === 'ADMIN';
  protected readonly roleLabel = () => (this.isTechLead() ? 'Tech Lead' : 'Member');
  protected readonly canAccessView = (view: WorkspaceView) =>
    view === 'board' || view === 'report' || (this.isTechLead() && (view === 'pdis' || view === 'users' || view === 'integrations'));
  protected readonly menuItems = () =>
    [
      { description: 'Canvas colaborativo', label: 'Board', view: 'board' as const },
      { description: 'Progresso e evolucao', label: 'Report', view: 'report' as const },
      { description: 'Controle de planos', label: 'PDIs', view: 'pdis' as const },
      { description: 'Gestao de pessoas', label: 'Users', view: 'users' as const },
      { description: 'IA e Agents', label: 'Integrations', view: 'integrations' as const }
    ].filter((item) => this.canAccessView(item.view));
  protected readonly quickCommands = () =>
    this.menuItems().map((item) => ({
      description: item.description,
      id: `open-${item.view}`,
      label: `Open ${item.label}`
    }));
  protected readonly isActiveView = (view: WorkspaceView) => this.activeView === view;
  protected readonly openView = (view: WorkspaceView) => {
    if (this.canAccessView(view)) this.activeView = view;
    this.isCommandPaletteOpen.set(false);
  };
  protected readonly toggleCommandPalette = () => this.isCommandPaletteOpen.update((current) => !current);
  protected readonly closeCommandPalette = () => this.isCommandPaletteOpen.set(false);
  protected readonly executeQuickCommand = (commandId: string) => {
    const view = commandId.replace('open-', '') as WorkspaceView;
    if (['board', 'report', 'pdis', 'users', 'integrations'].includes(view)) this.openView(view);
  };

  readonly handleCreatePlan = (input: { objective: string; ownerId?: string; title: string }) =>
    this.workspace.createPlan(input);

  readonly handleCreateUser = (input: { email: string; name: string; password: string; role: User['role'] }) =>
    this.workspace.createUser(input);

  readonly handleDeleteUser = (userId: string) => this.workspace.deleteUser(userId);

  readonly handleUpdatePlan = (event: { id: string; data: Partial<Pick<PdiPlan, 'objective' | 'ownerId' | 'status' | 'title'>> }) =>
    this.workspace.updatePlan(event.id, event.data);

  readonly handleDeletePlan = (planId: string) => this.workspace.deletePlan(planId);

  readonly handleExportPlan = (planId: string) => this.workspace.exportPlan(planId);

  readonly handleImportPlan = (file: File) => this.workspace.importPlan(file);

  readonly handleLogout = () => this.auth.logout();

  @HostListener('window:keydown', ['$event'])
  protected readonly handleWindowKeydown = (event: KeyboardEvent) => {
    if (!event.metaKey && !event.ctrlKey) return;
    if (event.key.toLowerCase() !== 'k') return;

    event.preventDefault();
    this.toggleCommandPalette();
  };
}
