import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import type { PdiPlan, User } from '@pdi/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { CanvasBoardComponent } from '../canvas/canvas-board.component';
import { WorkspaceService } from './workspace.service';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CanvasBoardComponent],
  providers: [WorkspaceService],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.css'
})
export class WorkspaceComponent implements OnChanges {
  @Input({ required: true }) user!: User;

  private readonly auth = inject(AuthService);
  protected readonly workspace = inject(WorkspaceService);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['user']?.currentValue) {
      void this.workspace.load(this.user);
    }
  }

  readonly handleCreatePlan = (input: { objective: string; ownerId?: string; title: string }) =>
    this.workspace.createPlan(input);

  readonly handleCreateUser = (input: { email: string; name: string; password: string; role: User['role'] }) =>
    this.workspace.createUser(input);

  readonly handleUpdatePlan = (event: { id: string; data: Partial<Pick<PdiPlan, 'objective' | 'ownerId' | 'status' | 'title'>> }) =>
    this.workspace.updatePlan(event.id, event.data);

  readonly handleDeletePlan = (planId: string) => this.workspace.deletePlan(planId);

  readonly handleExportPlan = (planId: string) => this.workspace.exportPlan(planId);

  readonly handleImportPlan = (file: File) => this.workspace.importPlan(file);

  readonly handleLogout = () => this.auth.logout();
}
