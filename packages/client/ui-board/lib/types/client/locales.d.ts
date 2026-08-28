/** Copy dictionaries for the runtime board. */
/** Simplified Chinese dictionary and key source of truth. */
export declare const zh: {
    readonly open: "运行时视图";
    readonly close: "关闭";
    readonly refresh: "刷新";
    readonly loading: "正在读取运行时…";
    readonly error: "暂时无法读取运行时。";
    readonly search: "搜索组件";
    readonly empty: "没有匹配的组件。";
    readonly rows: "行";
    readonly disabled: "已停用";
    readonly notLive: "未挂载";
    readonly waiting: "等待依赖";
    readonly realm: "隔离域";
    readonly provides: "提供";
    readonly injects: "依赖";
    readonly unsatisfied: "未满足";
    readonly transitions: "状态变化（不是日志）";
    readonly config: "配置";
    readonly none: "无";
    readonly captured: "快照时间";
};
/** Dictionary key domain, taken from the Chinese source of truth. */
export type BoardLocaleKey = keyof typeof zh;
/** English dictionary. */
export declare const en: Record<BoardLocaleKey, string>;
//# sourceMappingURL=locales.d.ts.map