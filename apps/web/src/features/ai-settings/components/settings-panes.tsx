"use client";

import {
  Badge,
  Button,
  SettingsCard,
  SettingsRow,
  SettingsSectionLabel,
  SidebarThemeSwitch,
} from "@kanon/ui";
import { IconCode, IconDownload, IconRefresh, IconTrash, IconUpload } from "@tabler/icons-react";

export interface SettingsThesisContext {
  id: string;
  ticker: string;
  companyName: string;
}

export function GeneralSettingsPane(p: {
  refreshingPrices?: boolean;
  onRefreshPrices?: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <SettingsSectionLabel>外观与阅读</SettingsSectionLabel>
        <SettingsCard>
          <SettingsRow label="主题外观" description="在暖白纸面与暗夜黑曜石之间切换">
            <SidebarThemeSwitch className="w-40" />
          </SettingsRow>
          {p.onRefreshPrices ? (
            <SettingsRow label="行情收盘校准" description="同步最新参考收盘价并重算赔率">
              <Button
                variant="outline"
                size="sm"
                disabled={p.refreshingPrices}
                onClick={p.onRefreshPrices}
              >
                <IconRefresh
                  size={15}
                  stroke={1.5}
                  className={p.refreshingPrices ? "animate-spin text-accent-coral" : undefined}
                />
                <span>{p.refreshingPrices ? "校准中..." : "立即校准"}</span>
              </Button>
            </SettingsRow>
          ) : null}
        </SettingsCard>
      </div>
      <div>
        <SettingsSectionLabel>内置投研纪律参数</SettingsSectionLabel>
        <SettingsCard>
          <SettingsRow label="安全买点年化门槛" description="自动反推 15% 与 20% 年化对应入场价">
            <Badge variant="titanium" className="font-mono">
              15% / 20%
            </Badge>
          </SettingsRow>
          <SettingsRow label="杠杆约束铁律" description="建仓留痕强制确认零杠杆与单票上限">
            <Badge variant="pass">已启用</Badge>
          </SettingsRow>
        </SettingsCard>
      </div>
    </div>
  );
}

function ThesisExportSection({ thesis }: { thesis: SettingsThesisContext }) {
  const go = (fmt: string) => () =>
    window.location.assign(`/api/export/thesis/${thesis.id}?format=${fmt}`);
  return (
    <div>
      <SettingsSectionLabel>{`${thesis.companyName} (${thesis.ticker}) 档案导出`}</SettingsSectionLabel>
      <SettingsCard>
        <SettingsRow label="Markdown 档案" description="结构化 .md 文档，适配本地知识库">
          <Button variant="outline" size="sm" onClick={go("md")}>
            <IconDownload size={15} stroke={1.5} />
            <span>导出 MD</span>
          </Button>
        </SettingsRow>
        <SettingsRow label="Google Doc 排版" description="可直接导入 Google Docs 的研报格式">
          <Button variant="outline" size="sm" onClick={go("gdoc")}>
            <IconDownload size={15} stroke={1.5} />
            <span>导出文档</span>
          </Button>
        </SettingsRow>
        <SettingsRow label="全量 JSON 备份" description="包含滤镜、假设、估值与 SEC 快照">
          <Button variant="outline" size="sm" onClick={go("json")}>
            <IconCode size={15} stroke={1.5} />
            <span>导出 JSON</span>
          </Button>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

function PortfolioTransferSection(p: { onOpenImport?: () => void; onClose: () => void }) {
  return (
    <div>
      <SettingsSectionLabel>全仓台账与迁移</SettingsSectionLabel>
      <SettingsCard>
        <SettingsRow label="导出全仓赔率台账" description="含三情景目标价、CAGR 与安全边际的 CSV">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.assign("/api/export/portfolio")}
          >
            <IconDownload size={15} stroke={1.5} />
            <span>导出 CSV</span>
          </Button>
        </SettingsRow>
        {p.onOpenImport ? (
          <SettingsRow label="导入 JSON 研究备份" description="从本地 archive.json 恢复单标的档案">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                p.onClose();
                p.onOpenImport?.();
              }}
            >
              <IconUpload size={15} stroke={1.5} />
              <span>导入备份</span>
            </Button>
          </SettingsRow>
        ) : null}
      </SettingsCard>
    </div>
  );
}

function DangerDeleteSection(p: {
  ticker: string;
  onRequestDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div>
      <SettingsSectionLabel>危险操作</SettingsSectionLabel>
      <SettingsCard>
        <SettingsRow label={`删除 ${p.ticker} 研究档案`} description="永久移除且无法恢复">
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              p.onClose();
              p.onRequestDelete();
            }}
          >
            <IconTrash size={15} stroke={1.5} />
            <span>删除档案</span>
          </Button>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

export function DataArchivePane(p: {
  thesis?: SettingsThesisContext;
  onOpenImport?: () => void;
  onRequestDelete?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-6">
      {p.thesis ? <ThesisExportSection thesis={p.thesis} /> : null}
      <PortfolioTransferSection onOpenImport={p.onOpenImport} onClose={p.onClose} />
      {p.thesis && p.onRequestDelete ? (
        <DangerDeleteSection
          ticker={p.thesis.ticker}
          onRequestDelete={p.onRequestDelete}
          onClose={p.onClose}
        />
      ) : null}
    </div>
  );
}
