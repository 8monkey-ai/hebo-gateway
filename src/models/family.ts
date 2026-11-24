import { compileGlob } from "../utils/glob.ts";
import { defineModelGroup, type ModelGroup, type ModelLab } from "./catalog.ts";
import type { ModelId, ModelsDevCatalog } from "./types.ts";

/**
 * A model family (e.g. `claude`), resolved against the catalog when it loads, so new
 * releases join their groups without a gateway release:
 * - `all`: every model of the family, named groups included
 * - `latest`: the newest stable release of each models.dev family (e.g. Opus, Sonnet, Haiku),
 *   leaving out pre-release and deprecated models
 * - `v5.5` / `v5`: one version, `v5.x`: one major version
 * - named groups (e.g. `opus`)
 */
export type ModelFamily<G extends string = never, P extends string = "v"> = {
  readonly all: ModelGroup;
  readonly latest: ModelGroup;
} & { readonly [K in G]: ModelGroup } & {
  readonly [K in `${P}${number}` | `${P}${number}.x`]: ModelGroup;
};

/** IDs and patterns are written without the lab namespace, e.g. `claude-opus-*`. */
export type ModelFamilyConfig<G extends string, P extends string> = {
  /**
   * Matches the models of the family, capturing their version if they have one (`-`
   * separators read as `.`), e.g. `/^claude-[a-z]+-(\d+(?:-\d)?)(?:-\d{8})?$/u`.
   */
  version: RegExp;
  /** Prefix of the version group keys. @default "v" */
  prefix?: P;
  /** Named groups: model IDs or `*` patterns. */
  groups?: Record<G, string | readonly string[]>;
};

/** `"4.0"` and `"4"` are the same version. */
const sameVersion = (a: string, b: string) => {
  const x = a.split(".");
  const y = b.split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (Number(x[i] ?? 0) !== Number(y[i] ?? 0)) return false;
  }
  return true;
};

export function defineModelFamily<const G extends string = never, const P extends string = "v">(
  lab: Pick<ModelLab, "namespace">,
  config: ModelFamilyConfig<G, P>,
): ModelFamily<G, P> {
  const { version, prefix = "v", groups = {} as Record<G, string> } = config;
  const namespaces = [lab.namespace];
  const scope = `${lab.namespace}/`;

  const members = (source: ModelsDevCatalog) => {
    const out: [ModelId, string | undefined][] = [];
    for (const id in source) {
      if (!id.startsWith(scope)) continue;
      const match = version.exec(id.slice(scope.length));
      if (match) out.push([id, match[1]?.replaceAll("-", ".")]);
    }
    return out;
  };

  const group = (select: (source: ModelsDevCatalog) => ModelId[]) =>
    defineModelGroup(namespaces, select);

  const named = Object.entries<string | readonly string[]>(groups).map(([name, patterns]) => {
    const tests = (typeof patterns === "string" ? [patterns] : patterns).map((p) =>
      compileGlob(scope + p),
    );
    return [name, (id: string) => tests.some((t) => t(id))] as const;
  });

  const family: Record<string, ModelGroup> = {
    // Versioned models and every named group (e.g. embeddings, transcription).
    all: group((source) => {
      const ids = new Set(members(source).map(([id]) => id));
      for (const id in source) {
        if (named.some(([, test]) => test(id))) ids.add(id);
      }
      return [...ids];
    }),
    // By release date rather than version: labs number some releases out of order.
    latest: group((source) => {
      const newest = new Map<string, { created: string; ids: ModelId[] }>();
      for (const [id] of members(source)) {
        const model = source[id]!;
        if (model.status || id.includes("-preview")) continue;

        const line = model.family ?? id;
        const created = model.created ?? "";
        const best = newest.get(line);
        if (!best || created > best.created) newest.set(line, { created, ids: [id] });
        else if (created === best.created) best.ids.push(id);
      }
      return [...newest.values()].flatMap(({ ids }) => ids);
    }),
  };

  for (const [name, test] of named) {
    family[name] = group((source) => Object.keys(source).filter((id) => test(id)));
  }

  // Version groups are created on first access: versions released later work too.
  return new Proxy(family, {
    get(target, key) {
      const wanted = typeof key === "string" && key.startsWith(prefix) && key.slice(prefix.length);
      if (!wanted || !/^\d/u.test(wanted) || key in target) return target[key as string];

      const major = wanted.endsWith(".x") ? wanted.slice(0, -2) : undefined;
      return (target[key] = group((source) =>
        members(source)
          .filter(
            ([, v]) =>
              v !== undefined &&
              (major ? v === major || v.startsWith(`${major}.`) : sameVersion(v, wanted)),
          )
          .map(([id]) => id),
      ));
    },
  }) as unknown as ModelFamily<G, P>;
}
