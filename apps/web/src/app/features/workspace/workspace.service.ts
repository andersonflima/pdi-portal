import { Injectable, computed, inject, signal } from '@angular/core';
import type { PdiPlan, PdiPlanExport, User } from '@pdi/contracts';
import { ApiService } from '../../core/api/api.service';

type PlanPatch = {
  objective?: string;
  ownerId?: string;
  status?: PdiPlan['status'];
  title?: string;
};

const insertCreatedPlan = (plans: PdiPlan[], createdPlan: PdiPlan) =>
  plans.some((plan) => plan.id === createdPlan.id) ? plans : [createdPlan, ...plans];

const removePlanById = (plans: PdiPlan[], planId: string) => plans.filter((plan) => plan.id !== planId);

const toExportFileName = (plan: PdiPlan) =>
  `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'pdi'}-${plan.id}.json`;

const downloadJson = (fileName: string, payload: PdiPlanExport) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    })
  );
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const readJsonFile = async <T>(file: File): Promise<T> => JSON.parse(await file.text()) as T;

@Injectable()
export class WorkspaceService {
  private readonly api = inject(ApiService);

  readonly plans = signal<PdiPlan[]>([]);
  readonly users = signal<User[]>([]);
  readonly activePlanId = signal<string | null>(null);
  readonly isCreatingPlan = signal(false);
  readonly isCreatingUser = signal(false);
  readonly isDeletingPlan = signal(false);
  readonly isExportingPlan = signal(false);
  readonly isImportingPlan = signal(false);
  readonly isUpdatingPlan = signal(false);

  readonly activePlan = computed(() => {
    const plans = this.plans();
    const activePlanId = this.activePlanId();

    return plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? null;
  });

  readonly load = async (user: User) => {
    const [plans, users] = await Promise.all([
      this.api.pdiPlans(),
      user.role === 'ADMIN' ? this.api.users() : Promise.resolve([])
    ]);

    this.plans.set(plans);
    this.users.set(users);
    this.activePlanId.set(this.activePlanId() ?? plans[0]?.id ?? null);
  };

  readonly selectPlan = (planId: string) => {
    this.activePlanId.set(planId);
  };

  readonly createPlan = async (input: { objective: string; ownerId?: string; title: string }) => {
    this.isCreatingPlan.set(true);

    try {
      const plan = await this.api.createPdiPlan(input);
      this.plans.set(insertCreatedPlan(this.plans(), plan));
      this.activePlanId.set(plan.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not create PDI');
    } finally {
      this.isCreatingPlan.set(false);
    }
  };

  readonly updatePlan = async (planId: string, input: PlanPatch) => {
    this.isUpdatingPlan.set(true);

    try {
      const updatedPlan = await this.api.updatePdiPlan(planId, input);
      this.plans.set(this.plans().map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan)));
      this.activePlanId.set(updatedPlan.id);
    } finally {
      this.isUpdatingPlan.set(false);
    }
  };

  readonly deletePlan = async (planId: string) => {
    this.isDeletingPlan.set(true);

    try {
      await this.api.deletePdiPlan(planId);
      const remainingPlans = removePlanById(this.plans(), planId);
      this.plans.set(remainingPlans);
      this.activePlanId.set(this.activePlanId() === planId ? (remainingPlans[0]?.id ?? null) : this.activePlanId());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not remove PDI');
    } finally {
      this.isDeletingPlan.set(false);
    }
  };

  readonly exportPlan = async (planId: string) => {
    const plan = this.plans().find((item) => item.id === planId);

    if (!plan) return;

    this.isExportingPlan.set(true);

    try {
      downloadJson(toExportFileName(plan), await this.api.exportPdiPlan(planId));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not export PDI');
    } finally {
      this.isExportingPlan.set(false);
    }
  };

  readonly importPlan = async (file: File) => {
    this.isImportingPlan.set(true);

    try {
      const plan = await this.api.importPdiPlan(await readJsonFile<PdiPlanExport>(file));
      this.plans.set(insertCreatedPlan(this.plans(), plan));
      this.activePlanId.set(plan.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not import PDI');
    } finally {
      this.isImportingPlan.set(false);
    }
  };

  readonly createUser = async (input: { email: string; name: string; password: string; role: User['role'] }) => {
    this.isCreatingUser.set(true);

    try {
      await this.api.createUser(input);
      this.users.set(await this.api.users());
    } finally {
      this.isCreatingUser.set(false);
    }
  };
}
