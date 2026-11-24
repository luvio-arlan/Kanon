import type { GlossaryTerm } from "@kanon/core";
import type { CommandActionGroup } from "@kanon/ui";
import { IconBook2 } from "@tabler/icons-react";
import { toast } from "sonner";

export function buildGlossaryGroup(glossary: readonly GlossaryTerm[]): CommandActionGroup {
  return {
    heading: "投研术语词典",
    secondary: true,
    items: glossary.map((item) => ({
      id: `term-${item.term}`,
      label: item.term,
      description: item.fullName,
      keywords: [item.term, item.fullName, item.plainSummary, item.category],
      icon: <IconBook2 size={16} stroke={1.5} />,
      onSelect: () =>
        toast(`${item.term} · ${item.fullName}`, {
          description: `${item.plainSummary}（${item.filingContext}）`,
        }),
    })),
  };
}
