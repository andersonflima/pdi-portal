import { Component, Input, OnChanges, SimpleChanges, output } from '@angular/core';
import type { PdiPlan, User } from '@pdi/contracts';
import { FormsModule } from '@angular/forms';

type NewPlanForm = {
  objective: string;
  ownerId: string;
  title: string;
};

type EditPlanForm = {
  objective: string;
  ownerId: string;
  status: PdiPlan['status'];
  title: string;
};

const emptyNewPlan = (ownerId: string): NewPlanForm => ({
  objective: '',
  ownerId,
  title: ''
});

const toEditForm = (plan: PdiPlan): EditPlanForm => ({
  objective: plan.objective,
  ownerId: plan.ownerId,
  status: plan.status,
  title: plan.title
});

@Component({
  selector: 'app-techlead-pdis-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './techlead-pdis-page.component.html',
  styleUrl: './techlead-pdis-page.component.css'
})
export class TechleadPdisPageComponent implements OnChanges {
  @Input({ required: true }) isCreatingPlan = false;
  @Input({ required: true }) isDeletingPlan = false;
  @Input({ required: true }) isUpdatingPlan = false;
  @Input({ required: true }) plan!: PdiPlan;
  @Input({ required: true }) plans: PdiPlan[] = [];
  @Input({ required: true }) users: User[] = [];

  readonly createPlan = output<{ objective: string; ownerId?: string; title: string }>();
  readonly deletePlan = output<string>();
  readonly selectPlan = output<string>();
  readonly updatePlan = output<{ id: string; data: Partial<Pick<PdiPlan, 'objective' | 'ownerId' | 'status' | 'title'>> }>();

  protected editingPlanId = '';
  protected editPlan: EditPlanForm | null = null;
  protected newPlan: NewPlanForm = emptyNewPlan('');
  protected pendingDeletePlan: { id: string; title: string } | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isDeletingPlan'] && !this.isDeletingPlan) {
      this.pendingDeletePlan = null;
    }

    if (!this.editingPlanId && this.plan?.id) {
      this.editingPlanId = this.plan.id;
      this.editPlan = toEditForm(this.plan);
    }

    if (!this.newPlan.ownerId) {
      this.newPlan = { ...this.newPlan, ownerId: this.defaultOwnerId() };
    }
  }

  protected readonly ownerName = (ownerId: string) => this.users.find((user) => user.id === ownerId)?.name ?? 'No owner';

  protected readonly handleCreatePlan = (event: Event) => {
    event.preventDefault();
    const ownerId = this.newPlan.ownerId || this.defaultOwnerId();

    if (!ownerId) return;

    this.createPlan.emit({
      objective: this.newPlan.objective,
      ownerId,
      title: this.newPlan.title
    });
    this.newPlan = emptyNewPlan(ownerId);
  };

  protected readonly selectPlanForEdit = (planId: string) => {
    const selected = this.plans.find((candidate) => candidate.id === planId);

    if (!selected) return;

    this.editingPlanId = selected.id;
    this.editPlan = toEditForm(selected);
    this.selectPlan.emit(selected.id);
  };

  protected readonly handleUpdatePlan = (event: Event) => {
    event.preventDefault();
    if (!this.editPlan) return;
    this.updatePlan.emit({ data: this.editPlan, id: this.editingPlanId });
  };

  protected readonly handleDeletePlan = (planId: string, title: string) => {
    this.pendingDeletePlan = { id: planId, title };
  };

  protected readonly closeDeleteModal = () => {
    this.pendingDeletePlan = null;
  };

  protected readonly confirmDeletePlan = () => {
    if (!this.pendingDeletePlan) return;
    this.deletePlan.emit(this.pendingDeletePlan.id);
  };

  private readonly defaultOwnerId = () =>
    this.users.find((user) => user.role === 'MEMBER')?.id ?? this.users[0]?.id ?? '';
}
