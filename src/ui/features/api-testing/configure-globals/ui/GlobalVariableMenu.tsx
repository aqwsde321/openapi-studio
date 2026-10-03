import { Popover } from "../../../../shared/ui/Popover";
import type { ApiTestingBridge } from "../../../../../core/shared/workspace";
import { useGlobalVariableAccess } from "../context/global-variable-access";
import { GlobalVariablesPanel } from "./GlobalVariablesPanel";

export function GlobalVariableMenu({ projectId, bridge, disabled }: { projectId: string; bridge: ApiTestingBridge; disabled: boolean }) {
  const access = useGlobalVariableAccess();
  return <Popover label="{ } 전역변수" disabled={disabled} openRequest={access.request}>
    <GlobalVariablesPanel scope={{ projectId }} bridge={bridge} targetName={access.name} targetRequest={access.request} onSaved={access.saved} />
  </Popover>;
}
