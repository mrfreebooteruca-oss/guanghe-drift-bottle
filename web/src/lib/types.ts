export type BottleCategory =
  | "炸裂的截图"
  | "震撼的场景"
  | "人物"
  | "外观"
  | "故事情节"
  | "战绩";

export type BottleStatus = "approved" | "pending" | "rejected";
export type AdminBottleFilter = BottleStatus | "all" | "reported";

export type ReportReason = "spam" | "harassment" | "adult" | "hate" | "spoiler" | "other";

export type ApiBottle = {
  id: string;
  title: string;
  gameName: string;
  category: BottleCategory;
  description: string;
  imageUrl: string;
  template: string;
  status: BottleStatus;
  authorName: string;
  createdAt: string;
  featuredScore: number;
};

export type Quota = {
  day: string;
  earned: number;
  used: number;
  remaining: number;
  max: number;
  shareCount?: number;
  throwCount?: number;
  inviteCount?: number;
};

export type TaskItem = {
  id: string;
  title: string;
  progress: number;
  limit: number;
  reward: string;
  done: boolean;
};

export type WallSlot = {
  slot: number;
  layout: "grid4" | "grid9";
  bottle: ApiBottle;
};

export type Metrics = {
  participants: number;
  bottles: number;
  dredges: number;
  wallItems: number;
  activeUsers24h: number;
};

export type CategoryBreakdown = {
  category: string;
  count: number;
};

export type AdminMetricsData = {
  metrics: Metrics;
  categories: CategoryBreakdown[];
  latest: ApiBottle[];
};

export type AdminBottle = {
  id: string;
  title: string;
  gameName: string;
  category: string;
  description: string;
  imageUrl: string;
  template: string;
  status: BottleStatus;
  featuredScore: number;
  reportCount: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type BulkModerationResult = {
  bottles: AdminBottle[];
  updated: number;
};

export type AdminEvent = {
  id: string;
  userId: string | null;
  type: string;
  metadata: string | null;
  createdAt: string;
};

export type StorageAuditData = {
  scannedR2Objects: number;
  trackedD1Images: number;
  orphanKeysSample: string[];
  missingKeysSample: string[];
  truncated: boolean;
  cursor: string | null;
};

export type BottleReportData = {
  bottleId: string;
  reportCount: number;
  status: BottleStatus;
  autoQueued: boolean;
};

export type BootstrapData = {
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    isDemo: boolean;
  };
  categories: BottleCategory[];
  quota: Quota;
  tasks: TaskItem[];
  latest: ApiBottle[];
  featured: ApiBottle[];
  wall: WallSlot[];
  metrics: Metrics;
  security: {
    turnstileSiteKey: string | null;
    turnstileRequired: boolean;
  };
};

export type SubmitBottleInput = {
  title: string;
  gameName: string;
  category: BottleCategory;
  description: string;
  template: string;
  image: File;
  turnstileToken?: string;
};
