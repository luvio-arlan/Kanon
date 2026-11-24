"use client";

import { IconSearch, IconX } from "@tabler/icons-react";
import type { RefObject } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "../primitives/spinner";

export interface SearchFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  loading?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}

function SearchLeadingGlyph({ loading }: { loading: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-3 flex h-4 w-4 items-center justify-center text-ink-muted"
    >
      <IconSearch
        size={14}
        stroke={1.5}
        className={cn(
          "absolute transition-[opacity,transform] duration-150",
          loading && "scale-75 opacity-0",
        )}
      />
      <span
        className={cn(
          "absolute flex items-center justify-center transition-[opacity,transform] duration-150",
          !loading && "scale-75 opacity-0",
        )}
      >
        {loading ? <Spinner size="xs" decorative /> : null}
      </span>
    </span>
  );
}

function SearchClearButton({ visible, onClear }: { visible: boolean; onClear: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label="清除搜索"
      aria-hidden={!visible}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClear}
      className={cn(
        "absolute right-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-pill bg-muted/90 text-ink-muted transition-[opacity,transform,color] duration-150 hover:text-ink-primary",
        visible ? "scale-100 opacity-100" : "pointer-events-none scale-50 opacity-0",
      )}
    >
      <IconX size={12} stroke={1.5} />
    </button>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "筛选代码 ( / )",
  ariaLabel = "筛选",
  loading = false,
  inputRef,
  className,
}: SearchFieldProps) {
  const hasValue = value.length > 0;
  return (
    <div className={cn("relative flex items-center", className)}>
      <SearchLeadingGlyph loading={loading} />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && hasValue) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-10 w-full rounded-control border border-hairline bg-surface pl-9 pr-9 text-sm text-ink-primary shadow-button transition-colors placeholder:text-ink-muted hover:border-strong focus:border-strong focus:outline-none focus:ring-2 focus:ring-accent-coral-soft [&::-webkit-search-cancel-button]:hidden"
      />
      <SearchClearButton visible={hasValue} onClear={() => onChange("")} />
    </div>
  );
}
