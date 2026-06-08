export type ModerationMessage = {
  bottleId: string;
  authorId: string;
  category: string;
  createdAt: string;
};

export type RuntimeEnv = Env &
  Required<Pick<Env, "DB" | "BOTTLE_IMAGES" | "GH_CONFIG">> & {
    MODERATION_QUEUE?: Queue<ModerationMessage>;
    CLERK_SECRET_KEY?: string;
    CLERK_JWT_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    ADMIN_USER_IDS?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_REQUIRED?: string;
  };

export type AuthUser = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isDemo: boolean;
};

export type BottleCategory =
  | "炸裂的截图"
  | "震撼的场景"
  | "人物"
  | "外观"
  | "故事情节"
  | "战绩";

export type BottleRow = {
  id: string;
  author_id: string;
  title: string;
  game_name: string;
  category: BottleCategory;
  description: string;
  image_key: string | null;
  image_url: string | null;
  image_mime: string | null;
  template: string;
  status: "approved" | "pending" | "rejected";
  report_count: number;
  featured_score: number;
  created_at: string;
  updated_at: string;
  author_name?: string;
};

export type WallSlotRow = {
  user_id: string;
  slot: number;
  bottle_id: string;
  layout: "grid4" | "grid9";
  updated_at: string;
} & BottleRow;

export type DailyQuotaRow = {
  user_id: string;
  day: string;
  earned: number;
  used: number;
  share_count: number;
  throw_count: number;
  invite_count: number;
  login_granted: number;
  updated_at: string;
};

export type ApiBottle = {
  id: string;
  title: string;
  gameName: string;
  category: BottleCategory;
  description: string;
  imageUrl: string;
  template: string;
  status: BottleRow["status"];
  authorName: string;
  createdAt: string;
  featuredScore: number;
};
