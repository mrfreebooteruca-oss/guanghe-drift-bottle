import type {
  AdminBottle,
  AdminBottleFilter,
  AdminEvent,
  AdminMetricsData,
  ApiBottle,
  BottleReportData,
  BottleStatus,
  BulkModerationResult,
  BootstrapData,
  Quota,
  ReportReason,
  StorageAuditData,
  SubmitBottleInput,
  WallSlot
} from "./types";

type TokenGetter = () => Promise<string | null>;

type ApiResult<T> = {
  data: T;
};

export class ClientApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ApiClient {
  private readonly getToken: TokenGetter;

  constructor(getToken: TokenGetter) {
    this.getToken = getToken;
  }

  bootstrap() {
    return this.request<BootstrapData>("/api/bootstrap");
  }

  async submitBottle(input: SubmitBottleInput) {
    const form = new FormData();
    form.set("title", input.title);
    form.set("gameName", input.gameName);
    form.set("category", input.category);
    form.set("description", input.description);
    form.set("template", input.template);
    form.set("image", input.image);
    if (input.turnstileToken) {
      form.set("turnstileToken", input.turnstileToken);
    }

    return this.request<{ bottle: ApiBottle }>("/api/bottles", {
      method: "POST",
      body: form
    });
  }

  dredge() {
    return this.request<{ bottle: ApiBottle; quota: Quota }>("/api/dredge", {
      method: "POST"
    });
  }

  saveWall(bottleId: string, slot: number, layout: "grid4" | "grid9") {
    return this.request<{ wall: WallSlot[] }>("/api/wall", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ bottleId, slot, layout })
    });
  }

  shareTask() {
    return this.request<{ granted: boolean; quota: Quota; message?: string }>("/api/tasks/share", {
      method: "POST"
    });
  }

  reportBottle(bottleId: string, reason: ReportReason, details?: string) {
    return this.request<{ report: BottleReportData }>(`/api/bottles/${encodeURIComponent(bottleId)}/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason, details })
    });
  }

  adminMetrics() {
    return this.request<AdminMetricsData>("/api/admin/metrics");
  }

  adminBottles(status: AdminBottleFilter = "all", limit = 50) {
    return this.request<{ bottles: AdminBottle[] }>(
      `/api/admin/bottles?status=${encodeURIComponent(status)}&limit=${limit}`
    );
  }

  adminEvents(limit = 20, type?: string) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (type) params.set("type", type);
    return this.request<{ events: AdminEvent[] }>(`/api/admin/events?${params.toString()}`);
  }

  updateBottleModeration(bottleId: string, status: BottleStatus, featuredScore?: number) {
    return this.request<{ bottle: ApiBottle }>(`/api/admin/bottles/${encodeURIComponent(bottleId)}/moderation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status, featuredScore })
    });
  }

  bulkUpdateBottleModeration(bottleIds: string[], status: BottleStatus, featuredScore?: number) {
    return this.request<BulkModerationResult>("/api/admin/bottles/moderation/bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ bottleIds, status, featuredScore })
    });
  }

  adminStorageAudit(limit = 1000, cursor?: string | null) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return this.request<{ storage: StorageAuditData }>(`/api/admin/storage/audit?${params.toString()}`);
  }

  exportAdminBottles(status: AdminBottleFilter = "all", limit = 1000) {
    return this.requestBlob(
      `/api/admin/export/bottles.csv?status=${encodeURIComponent(status)}&limit=${limit}`
    );
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const response = await this.fetchWithAuth(path, init);
    const payload = (await response.json().catch(() => null)) as
      | ApiResult<T>
      | { error?: { code?: string; message?: string } }
      | null;

    if (!response.ok) {
      throw errorFromPayload(response.status, payload);
    }

    if (!payload || !("data" in payload)) {
      throw new ClientApiError(response.status, "invalid_response", "服务返回格式异常。");
    }

    return payload.data;
  }

  private async requestBlob(path: string, init: RequestInit = {}) {
    const response = await this.fetchWithAuth(path, init);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      throw errorFromPayload(response.status, payload);
    }
    return response.blob();
  }

  private async fetchWithAuth(path: string, init: RequestInit = {}) {
    const token = await this.getToken();
    const headers = new Headers(init.headers);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    } else {
      headers.set("X-Dev-User", "demo-user-local");
    }

    return fetch(path, {
      ...init,
      headers
    });
  }
}

function errorFromPayload(
  status: number,
  payload: ApiResult<unknown> | { error?: { code?: string; message?: string } } | null
) {
  const error = payload && "error" in payload ? payload.error : undefined;
  return new ClientApiError(
    status,
    error?.code ?? "request_failed",
    error?.message ?? "请求失败，请稍后重试。"
  );
}
