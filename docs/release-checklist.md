# 发版检查单（Release Checklist）

> 每次发版逐项勾选；CI 会跑 `npm test` + `npm run build`（tag 触发 release.yml），以下为本地/人工项。

## 版本同步（release.yml 校验 tag 与 manifest 一致）

- [ ] `manifest.json` `version` / `package.json` `version` / `versions.json` 三处同步
- [ ] `src/changelog.ts` 追加本版条目（zh/en 双语）并更新 `CHANGELOG_ORDER`
- [ ] README「说明/Notes」中的版本号同步

## 质量门禁

- [ ] `npm test` 全过（0 失败、0 跳过）
- [ ] `npm run build` 通过（tsc -noEmit + esbuild production）
- [ ] i18n 双语核对：本版新增 UI 文案 zh/en 逐键在位（缺一不发版）
- [ ] 数据红线自查：新功能业务数据只进 frontmatter；`data.json` 仅插件状态；零网络请求

## 性能门禁

- [ ] `npm run bench:check` 全场景在预算内（10k 档，对照 `scripts/bench-budgets.json`）
- [ ] 若超预算：**显式豁免** —— 在本文件下方「豁免记录」表登记：日期 / 版本 / 超预算场景与实测值 / 原因（如：为修 X 引入的必要回退）/ 后续优化项
- [ ] 大幅优化后重新基线化：更新 `scripts/bench-budgets.json` 与 `docs/benchmarks.md`（注明新参考机型）

## 发布

- [ ] 提交全部改动 → `git tag <版本号>`（必须等于 manifest version）→ `git push origin main <版本号>`
- [ ] CI Release 流水线绿灯；Release 产物含 `main.js / manifest.json / styles.css / versions.json`

## 豁免记录（超预算发版须登记）

| 日期 | 版本 | 超预算场景 | 实测 / 预算 | 原因 | 后续项 |
| --- | --- | --- | --- | --- | --- |
| （暂无） | | | | | |
