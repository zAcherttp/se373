/**
 * The welcome notice, replaced.
 *
 * Upstream's text is DeepSeek addressing Harness developers about their 0.1
 * release. Showing it here would put their statement in our mouth and their
 * product name on our page, to a reader with no way to tell the difference —
 * so the notice says what this actually is instead. The exported surface is
 * unchanged; only the words are ours.
 */

/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = 'se373.2026-08-28.1'

/** The complete editable welcome notice in both supported GUI locales. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: 'SE373 · 智能体构建器',
    body: '这是一个在建的课程项目：一个用来构建智能体的智能体。它建立在 DeepSeek Harness（MIT 许可）之上，其中的运行时、会话与工具层均来自上游并保留原有署名；本项目新增的是构建器平面与知识平面。\n\n这不是 DeepSeek 的产品，上游作者也未对其进行背书。功能仍在快速变化，请以此为前提使用。',
    continueLabel: '继续',
  },
  en: {
    title: 'SE373 · Agentic Builder',
    body: 'A course project under construction: an agent that builds agents. It is built on DeepSeek Harness (MIT), whose runtime, session and tool layers are vendored here with their notices intact; what this project adds is the builder plane and the knowledge plane.\n\nThis is not a DeepSeek product and is not endorsed by the upstream authors. Expect things to change quickly.',
    continueLabel: 'Continue',
  },
} as const
