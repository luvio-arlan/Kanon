import type { GlossaryTerm } from "@kanon/core";
import type { CommandActionGroup } from "@kanon/ui";
import { IconBook2 } from "@tabler/icons-react";
import { toast } from "sonner";

export function buildGlossaryGroup(glossary: readonly GlossaryTerm[]): CommandActionGroup {
  return {
    heading: "行业术语速查（12 词条）",
    items: glossary.map((item) => ({
      id: `term-${item.term}`,
      label: `${item.term} — ${item.fullName}`,
      description: item.plainSummary,
      keywords: [item.term, item.fullName, item.category],
      icon: <IconBook2 size={15} stroke={1.5} />,
      onSelect: () =>
        toast(`${item.term} · ${item.fullName}`, {
          description: `${item.plainSummary}（${item.filingContext}）`,
        }),
    })),
  };
}
