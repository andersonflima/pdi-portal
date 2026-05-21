import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import type { PdiPlan, User } from '@pdi/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { CanvasBoardComponent } from '../canvas/canvas-board.component';
import { TechleadPdisPageComponent } from './techlead-pdis-page.component';
import { TechleadUsersPageComponent } from './techlead-users-page.component';
import { WorkspaceService } from './workspace.service';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CanvasBoardComponent, TechleadPdisPageComponent, TechleadUsersPageComponent],
  providers: [WorkspaceService],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.css'
})
export class WorkspaceComponent implements OnChanges {
  @Input({ required: true }) user!: User;
  protected activeView: 'board' | 'pdis' | 'users' = 'board';

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
  protected readonly canAccessView = (view: 'board' | 'pdis' | 'users') => view === 'board' || this.isTechLead();
  protected readonly menuItems = () =>
    [
      { description: 'Canvas colaborativo', label: 'Board', view: 'board' as const },
      { description: 'Controle de planos', label: 'PDIs', view: 'pdis' as const },
      { description: 'Gestao de pessoas', label: 'Users', view: 'users' as const }
    ].filter((item) => this.canAccessView(item.view));
  protected readonly isActiveView = (view: 'board' | 'pdis' | 'users') => this.activeView === view;
  protected readonly openView = (view: 'board' | 'pdis' | 'users') => {
    if (this.canAccessView(view)) this.activeView = view;
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
}
