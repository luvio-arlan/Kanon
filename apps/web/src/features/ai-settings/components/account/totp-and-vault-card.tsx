"use client";

import { SettingsCard, SettingsRow, SettingsSectionLabel } from "@kanon/ui";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  apiConfirmTotp,
  apiDisableTotp,
  apiEnrollTotp,
  apiLoadSecurityVault,
  type MaskedAiCred,
  type TotpEnrollmentBundle,
} from "../../lib/security-vault-api";
import {
  TotpDisableRow,
  TotpEnrollPanel,
  TotpRecoveryCodesPanel,
  TotpStatusAction,
} from "./totp-setup-panel";
import { VaultSection } from "./vault-credentials-section";

function useTotpSectionActions(onChanged: () => void) {
  const [enrollData, setEnrollData] = useState<TotpEnrollmentBundle | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  async function enroll() {
    const res = await apiEnrollTotp();
    if (!res.ok) return void toast.error(res.error);
    setEnrollData(res.data);
  }
  async function confirm() {
    const res = await apiConfirmTotp(code.trim());
    if (!res.ok) return void toast.error(res.error);
    setEnrollData(null);
    setCode("");
    setRecoveryCodes(res.recoveryCodes);
    toast.success("已开启两步验证");
    onChanged();
  }
  async function disable() {
    const res = await apiDisableTotp(disableCode.trim());
    if (!res.ok) return void toast.error(res.error);
    setDisabling(false);
    setDisableCode("");
    setRecoveryCodes(null);
    toast.success("已停用两步验证");
    onChanged();
  }
  return {
    enrollData,
    code,
    setCode,
    recoveryCodes,
    setRecoveryCodes,
    disabling,
    setDisabling,
    disableCode,
    setDisableCode,
    enroll,
    confirm,
    disable,
  };
}

function TotpCardPanels({
  enabled,
  s,
}: {
  enabled: boolean;
  s: ReturnType<typeof useTotpSectionActions>;
}) {
  return (
    <>
      {s.enrollData ? (
        <TotpEnrollPanel
          secret={s.enrollData.secret}
          otpauthUri={s.enrollData.otpauthUri}
          code={s.code}
          onCode={s.setCode}
          onConfirm={() => void s.confirm()}
        />
      ) : null}
      {s.recoveryCodes ? (
        <TotpRecoveryCodesPanel
          codes={s.recoveryCodes}
          onAcknowledge={() => s.setRecoveryCodes(null)}
        />
      ) : null}
      {enabled && s.disabling ? (
        <TotpDisableRow
          code={s.disableCode}
          onCode={s.setDisableCode}
          onDisable={() => void s.disable()}
          onCancel={() => {
            s.setDisabling(false);
            s.setDisableCode("");
          }}
        />
      ) : null}
    </>
  );
}

function TotpSection({
  enabled,
  recoveryRemaining,
  onChanged,
}: {
  enabled: boolean;
  recoveryRemaining: number;
  onChanged: () => void;
}) {
  const s = useTotpSectionActions(onChanged);
  return (
    <div>
      <SettingsSectionLabel>两步验证 (TOTP)</SettingsSectionLabel>
      <SettingsCard>
        <SettingsRow
          label="动态口令保护"
          description={enabled ? `剩余恢复码 ${recoveryRemaining} 枚` : "支持常见认证器应用"}
        >
          <TotpStatusAction
            enabled={enabled}
            onToggleDisable={() => s.setDisabling((v) => !v)}
            onEnroll={() => void s.enroll()}
          />
        </SettingsRow>
        <TotpCardPanels enabled={enabled} s={s} />
      </SettingsCard>
    </div>
  );
}

export function TotpAndVaultCard() {
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [recoveryRemaining, setRecoveryRemaining] = useState(0);
  const [creds, setCreds] = useState<MaskedAiCred[]>([]);
  const load = useCallback(() => {
    void apiLoadSecurityVault().then((res) => {
      setTotpEnabled(res.totpEnabled);
      setRecoveryRemaining(res.recoveryCodesRemaining);
      setCreds(res.credentials);
    });
  }, []);
  useEffect(() => load(), [load]);

  return (
    <div className="space-y-6">
      <TotpSection enabled={totpEnabled} recoveryRemaining={recoveryRemaining} onChanged={load} />
      <VaultSection creds={creds} onChanged={load} />
    </div>
  );
}
