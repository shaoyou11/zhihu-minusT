/**
 * Captured contract for `GET https://api.zhihu.com/next-render`, observed from
 * the Android question feed on 2026-10-03. The preview runtime below validates
 * HTTP data as `unknown`; these capture types are not a substitute for parsing.
 *
 * Required fields and literal unions describe this capture, not a verified
 * complete server schema. No credentials, device fingerprints, tracking
 * strings, identities, URLs from the response, or original prose are retained.
 */

import type { ZhihuStructuredContent } from '@/types/zhihu';

export {
  type AnswerPublishInfo,
  buildZhihuNextRenderUrl,
  getAnswerPreviewContinuation,
  getNextContentRender,
  getNextRender,
  getStructuredContentContinuation,
  normalizeZhihuAnswerPreviewPage,
  validateZhihuRenderUrl,
  type ZhihuAnswerPreviewItem,
  type ZhihuAnswerPreviewPage,
  type ZhihuPlainPreviewAnswer,
  type ZhihuPreviewAnswer,
  type ZhihuPreviewAnswerMetadata,
  type ZhihuPreviewLoginPrompt,
  type ZhihuPreviewRequestOptions,
  type ZhihuReadingPreviewItem,
  type ZhihuRenderContinuation,
} from './answerPreview';

export type ZhihuNextRenderScene =
  | 'unknown'
  | 'recommend'
  | 'profile_answer'
  | 'question_feed';

interface ZhihuNextRenderBaseParams {
  id: string;
  type: 'answer';
  context_expand: 0 | 1;
  is_native: 0 | 1;
}

/** Question-feed context belongs only to explicitly selected question feeds. */
export type ZhihuNextRenderParams = ZhihuNextRenderBaseParams &
  (
    | { scenes?: 'unknown' }
    | { scenes: 'recommend' }
    | { scenes: 'profile_answer' }
    | {
        scenes: 'question_feed';
        collection_id: string;
        collection_type: 'question';
        /** Unknown session IDs and cursors remain empty, not invented. */
        question_feed_session_id: string;
        question_feed_cursor: string;
      }
  );

/**
 * 从 paging.next / previous 的 /next-content-render URL 观测到的查询参数。
 * URL 线上表示均为字符串；这里只把已验证的 offset 表达为逻辑整数。
 * 本记录没有实际调用该续取接口，参数不是通过猜测重新构建链接的依据。
 */
export interface ZhihuNextContentRenderParams {
  offset: number;
  url_token: string;
  /** answer 仅为已观测内容类型，完整服务器枚举未知。 */
  content_type: 'answer';
  version_id: string;
}

export interface ZhihuNextRenderPaging {
  is_end: boolean;
  is_start: boolean;
  /** Server-provided continuation URL; preserve its session and cursor values. */
  next: string;
  /** Empty in this capture; its pagination semantics have not been verified. */
  previous: string;
  totals: number;
}

/** The capture contained five answers and one login prompt, without `target`. */
export interface ZhihuNextRenderResponse {
  paging: ZhihuNextRenderPaging;
  data: ZhihuNextRenderItem[];
}

/** These two discriminants cover only the item types observed in the capture. */
export type ZhihuNextRenderItem =
  | ZhihuNextRenderAnswer
  | ZhihuNextRenderLoginPrompt;

export interface ZhihuNextRenderLoginPrompt {
  id: string;
  type: 'login_prompt';
  description: string;
}

export interface ZhihuNextRenderAnswer {
  id: string;
  type: 'answer';
  question: ZhihuNextRenderQuestion;
  author: ZhihuNextRenderAuthor;
  search_word: ZhihuNextRenderSearchWord;
  interaction_bar_plugins: ZhihuNextRenderInteractionBarPlugin[];
  /** Integer in the capture; the time unit has not been verified. */
  bar_plugins_flip_time: number;
  /** Only the captured business type is represented. */
  business_type: 'normal';
  is_mine: boolean;
  /** Only the captured permission value is represented. */
  comment_permission: 'all';
  admin_closed_comment: boolean;
  /** These values cover only the capture, not all possible copyright states. */
  copyright_status: 'PUBLIC' | 'RESERVED';
  can_copy: boolean;
  reaction_instruction: ZhihuNextRenderReactionInstruction;
  /** All five arrays were empty; the element structure is unknown. */
  hot_comment: unknown[];
  reaction: ZhihuNextRenderReaction;
  excerpt: string;
  /** Only the captured business category is represented. */
  biz_type_list: 'answer'[];
  structured_content: ZhihuStructuredContent;
  /** All five values were null; the non-null structure is unknown. */
  video: null;
  /** Present in three of the five answers; absent rather than null otherwise. */
  image_list?: ZhihuNextRenderImageList;
  /** Present as null in two answers; the non-null structure is unknown. */
  card_list?: null;
  /** All five arrays were empty; the element structure is unknown. */
  endorsement: unknown[];
  relationship_tips: ZhihuNextRenderRelationshipTips;
  podcast_audio_enter: ZhihuNextRenderPodcastAudioEnter;
  ad_info: ZhihuNextRenderAdInfo;
  /** Opaque Base64-encoded binary metadata, not a JSON string. */
  attached_info: string;
  /** Empty in all five answers; any non-empty format is unverified. */
  nf_attached_info: string;
  content_end_info: ZhihuNextRenderContentEndInfo;
  preload: boolean;
  third_business: ZhihuNextRenderThirdBusiness;
  comment_config: ZhihuNextRenderCommentConfig;
}

export interface ZhihuNextRenderQuestion {
  id: string;
  /** Only the captured question type is represented. */
  type: 'question';
  title: string;
  url: string;
  status: ZhihuNextRenderQuestionStatus;
  relationship: ZhihuNextRenderQuestionRelationship;
  review_info: ZhihuNextRenderQuestionReviewInfo;
  mute_info: ZhihuNextRenderQuestionMuteInfo;
  reaction_instruction: ZhihuNextRenderReactionInstruction;
  followers_count: number;
  answer_count: number;
}

export interface ZhihuNextRenderQuestionStatus {
  is_locked: boolean;
  /** Preserve the captured field name `is_close`. */
  is_close: boolean;
  is_evaluate: boolean;
  is_suggest: boolean;
}

export interface ZhihuNextRenderQuestionRelationship {
  is_author: boolean;
  is_anonymous: boolean;
  is_following: boolean;
  is_downvoting: boolean;
}

export interface ZhihuNextRenderQuestionReviewInfo {
  /** Only an empty type value was observed. */
  type: '';
  tips: string;
  edit_tips: string;
  is_reviewing: boolean;
  edit_is_reviewing: boolean;
}

export interface ZhihuNextRenderQuestionMuteInfo {
  /** Only an empty type value was observed. */
  type: '';
}

/** All observed values were empty objects; no field structure is inferred. */
export type ZhihuNextRenderReactionInstruction = Record<string, unknown>;

export interface ZhihuNextRenderThemeImage {
  day: string;
  night: string;
  width: number;
  height: number;
}

export interface ZhihuNextRenderJumpThemeImage
  extends ZhihuNextRenderThemeImage {
  jump_url: string;
}

export interface ZhihuNextRenderAvatar {
  avatar_image: ZhihuNextRenderJumpThemeImage;
  /** All observed values were null; the non-null structure is unknown. */
  avatar_frame_image: null;
  /** Three image objects and two null values were observed. */
  avatar_icon_image: ZhihuNextRenderJumpThemeImage | null;
  /** All observed values were null; the non-null structure is unknown. */
  avatar_cover_image: null;
}

export interface ZhihuNextRenderAuthor {
  id: string;
  url_token: string;
  /** Only the captured author type is represented. */
  type: 'people';
  is_org: boolean;
  gender: number;
  fullname: string;
  avatar: ZhihuNextRenderAvatar;
  identity_icons: ZhihuNextRenderJumpThemeImage[];
  description: string;
  /** Only the captured follow-status value is represented. */
  follow_status: 'normal';
}

export interface ZhihuNextRenderSearchWord {
  queries: ZhihuNextRenderSearchQuery[];
}

export interface ZhihuNextRenderSearchQuery {
  display_query: string;
  real_query: string;
  link_url: string;
  attached_info: string;
  id: string;
}

/** These plugin discriminants cover only the two kinds in the capture. */
export type ZhihuNextRenderInteractionBarPlugin =
  | ZhihuNextRenderCommentPlugin
  | ZhihuNextRenderFollowPlugin;

export interface ZhihuNextRenderCommentPlugin {
  type: 'comment';
  comment: ZhihuNextRenderCommentPluginConfig;
}

export interface ZhihuNextRenderCommentPluginConfig {
  enable: boolean;
  placeholder: string;
}

export interface ZhihuNextRenderFollowPlugin {
  type: 'follow';
}

export interface ZhihuNextRenderReaction {
  statistics: ZhihuNextRenderReactionStatistics;
  relation: ZhihuNextRenderReactionRelation;
  image_reactions: ZhihuNextRenderImageReactions;
}

export interface ZhihuNextRenderReactionStatistics {
  up_vote_count: number;
  down_vote_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  play_count: number;
  interest_play_count: number;
  favorites: number;
  pv_count: number;
  bullet_count: number;
  applaud_count: number;
  question_follower_count: number;
  question_answer_count: number;
  plaincontent_vote_up_count: number;
  plaincontent_like_count: number;
  /** Present in three of the five answers; keys are dynamic image IDs. */
  img_like_count?: ZhihuNextRenderImageLikeCounts;
  subscribe_count: number;
  /** All five arrays were empty; the element structure is unknown. */
  republishers: unknown[];
}

export type ZhihuNextRenderImageLikeCounts = Record<string, number>;

export interface ZhihuNextRenderReactionRelation {
  is_author: boolean;
  /** Only the captured vote value is represented. */
  vote: 'Neutral';
  liked: boolean;
  /** Present in three of the five answers; keys are dynamic image IDs. */
  img_liked?: ZhihuNextRenderImageLikedRelations;
  faved: boolean;
  following: boolean;
  /** Preserve the captured spelling `subcribed`. */
  subcribed: boolean;
  is_navigator_vote: boolean;
  current_user_is_navigator: boolean;
  /** Only an empty next-step value was observed. */
  vote_next_step: '';
}

export type ZhihuNextRenderImageLikedRelations = Record<string, boolean>;

/** Keys are dynamic image IDs, not fixed object fields. */
export type ZhihuNextRenderImageReactions = Record<
  string,
  ZhihuNextRenderImageReaction
>;

export interface ZhihuNextRenderImageReaction {
  like_count: number;
  is_liked: boolean;
}

export interface ZhihuNextRenderImageList {
  count: number;
  images: ZhihuNextRenderImage[];
  width_ratio: number;
  is_grid: boolean;
}

export interface ZhihuNextRenderImage {
  height: number;
  original_height: number;
  original_token: string;
  original_url: string;
  original_width: number;
  /** URL suffix; it may contain query parameters and is not an enum. */
  suffix: string;
  thumbnail: string;
  token: string;
  url: string;
  width: number;
}

export interface ZhihuNextRenderRelationshipTips {
  /** Only the captured relationship-tip type is represented. */
  type: 'reaction_endorse';
  right_icon: ZhihuNextRenderThemeImage;
  text: string;
  text_color: string;
  text_size: number;
  is_bold: boolean;
  action_url: string;
}

export interface ZhihuNextRenderPodcastAudioEnter {
  text: string;
  text_color: string;
  text_size: number;
  action_url: string;
  /** Only an empty subtype value was observed. */
  sub_type: '';
}

export interface ZhihuNextRenderAdInfo {
  /** Empty in all five answers; any non-empty format is unverified. */
  data: string;
}

export interface ZhihuNextRenderContentEndInfo {
  create_time_text: string;
  update_time_text: string;
  ip_info: string;
  reshipment_settings: string;
  show_origin_page: ZhihuNextRenderOriginPage;
}

export interface ZhihuNextRenderOriginPage {
  text: string;
  action_url: string;
}

/** All observed values were empty objects; no field structure is inferred. */
export type ZhihuNextRenderThirdBusiness = Record<string, unknown>;

export interface ZhihuNextRenderCommentConfig {
  can_segment_reply: boolean;
}
