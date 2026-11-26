/**
 * Safe zero-eval recursive-descent KPI expression parser & evaluator (W2.5).
 * Supports arithmetic (+, -, *, /, unary -), comparisons (>=, <=, >, <, ==, !=),
 * logical (&&, ||), parentheses, variables, and abs/min/max helpers.
 */
type TokenKind = "num" | "id" | "op" | "lparen" | "rparen" | "comma" | "eof";
interface Token {
  kind: TokenKind;
  value: string;
}

const TOKEN_RE =
  /\s*(>=|<=|==|!=|&&|\|\||[+\-*/><(),]|[0-9]+(?:\.[0-9]+)?|[a-zA-Z_][a-zA-Z0-9_]*)/y;

const CMP_FNS: Record<string, (a: number, b: number) => boolean> = {
  ">=": (a, b) => a >= b,
  "<=": (a, b) => a <= b,
  ">": (a, b) => a > b,
  "<": (a, b) => a < b,
  "==": (a, b) => Math.abs(a - b) < 1e-9,
  "!=": (a, b) => Math.abs(a - b) >= 1e-9,
};

function classifyToken(raw: string): Token {
  if (raw === "(") return { kind: "lparen", value: raw };
  if (raw === ")") return { kind: "rparen", value: raw };
  if (raw === ",") return { kind: "comma", value: raw };
  if (/^[0-9]/.test(raw)) return { kind: "num", value: raw };
  if (/^[a-zA-Z_]/.test(raw)) return { kind: "id", value: raw };
  return { kind: "op", value: raw };
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < expr.length) {
    TOKEN_RE.lastIndex = pos;
    const match = TOKEN_RE.exec(expr);
    if (!match?.[1]) {
      const rest = expr.slice(pos).trim();
      if (!rest) break;
      throw new Error(`Unsupported token near "${rest.slice(0, 12)}" in KPI expression`);
    }
    tokens.push(classifyToken(match[1]));
    pos = TOKEN_RE.lastIndex;
  }
  tokens.push({ kind: "eof", value: "" });
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: readonly Token[],
    private readonly vars: Readonly<Record<string, number>>,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos] ?? { kind: "eof", value: "" };
  }

  private next(): Token {
    const t = this.peek();
    this.pos += 1;
    return t;
  }

  parseOr(): number {
    let left = this.parseAnd();
    while (this.peek().kind === "op" && this.peek().value === "||") {
      this.next();
      const right = this.parseAnd();
      left = left !== 0 || right !== 0 ? 1 : 0;
    }
    return left;
  }

  private parseAnd(): number {
    let left = this.parseCmp();
    while (this.peek().kind === "op" && this.peek().value === "&&") {
      this.next();
      const right = this.parseCmp();
      left = left !== 0 && right !== 0 ? 1 : 0;
    }
    return left;
  }

  private parseCmp(): number {
    const left = this.parseAdd();
    const cmp = this.peek().kind === "op" ? CMP_FNS[this.peek().value] : undefined;
    if (!cmp) return left;
    this.next();
    return cmp(left, this.parseAdd()) ? 1 : 0;
  }

  private parseAdd(): number {
    let left = this.parseMul();
    while (this.peek().kind === "op" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.next().value;
      const right = this.parseMul();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private parseMul(): number {
    let left = this.parseUnary();
    while (this.peek().kind === "op" && (this.peek().value === "*" || this.peek().value === "/")) {
      const op = this.next().value;
      const right = this.parseUnary();
      if (op === "/") {
        if (Math.abs(right) < 1e-12) throw new Error("Division by zero in KPI expression");
        left /= right;
      } else {
        left *= right;
      }
    }
    return left;
  }

  private parseUnary(): number {
    if (this.peek().kind === "op" && this.peek().value === "-") {
      this.next();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parseCall(name: string): number {
    this.next();
    const args: number[] = [];
    if (this.peek().kind !== "rparen") {
      args.push(this.parseOr());
      while (this.peek().kind === "comma") {
        this.next();
        args.push(this.parseOr());
      }
    }
    if (this.next().kind !== "rparen") throw new Error(`Expected ")" after ${name}(...)`);
    if (name === "abs" && args.length === 1) return Math.abs(args[0] ?? 0);
    if (name === "min" && args.length >= 1) return Math.min(...args);
    if (name === "max" && args.length >= 1) return Math.max(...args);
    throw new Error(`Unknown KPI helper function "${name}"`);
  }

  private resolveIdent(name: string): number {
    if (this.peek().kind === "lparen") return this.parseCall(name);
    const val = this.vars[name];
    if (val === undefined || !Number.isFinite(val)) {
      throw new Error(`Missing KPI variable "${name}"`);
    }
    return val;
  }

  private parsePrimary(): number {
    const t = this.next();
    if (t.kind === "num") return Number(t.value);
    if (t.kind === "id") return this.resolveIdent(t.value);
    if (t.kind === "lparen") {
      const val = this.parseOr();
      if (this.next().kind !== "rparen") throw new Error('Expected closing ")"');
      return val;
    }
    throw new Error(`Unexpected token "${t.value || t.kind}"`);
  }

  assertEof() {
    if (this.peek().kind !== "eof") {
      throw new Error(`Unexpected trailing token "${this.peek().value}"`);
    }
  }
}

export function evaluateSafeKpiExpression(
  expression: string,
  variables: Readonly<Record<string, number>>,
): { ok: true; value: number; passed: boolean } | { ok: false; error: string } {
  try {
    const parser = new Parser(tokenize(expression), variables);
    const value = parser.parseOr();
    parser.assertEof();
    return { ok: true, value, passed: value !== 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function evaluateConsecutiveKpiPeriods(
  expression: string,
  periodSeries: readonly Readonly<Record<string, number>>[],
  consecutivePeriods: number,
): { triggered: boolean; matchedPeriods: number } {
  const required = Math.max(1, Math.round(consecutivePeriods));
  let streak = 0;
  for (let i = periodSeries.length - 1; i >= 0; i -= 1) {
    const vars = periodSeries[i];
    if (!vars) break;
    const res = evaluateSafeKpiExpression(expression, vars);
    if (!res.ok || !res.passed) break;
    streak += 1;
  }
  return { triggered: streak >= required, matchedPeriods: streak };
}
